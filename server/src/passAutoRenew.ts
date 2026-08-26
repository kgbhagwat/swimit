import { maybeNotifyBatchCoachOverLimit } from './batchCapacity.js';
import { pool } from './db/pool.js';
import { indiaDaysAgoIso, indiaTodayIso } from './indiaDate.js';
import { maybeNotifyPackageSwimmerCapacity } from './packageCapacityWarnings.js';
import { formatPaymentDate, insertPassPayment } from './passInvoice.js';

/** Auto-renew when the current pass expires within this many days, or has already expired. */
export const AUTO_RENEW_WITHIN_DAYS = 5;

function daysAcrossStartingMonths(start: Date, monthCount: number) {
  let days = 0;
  for (let offset = 0; offset < monthCount; offset += 1) {
    days += new Date(start.getFullYear(), start.getMonth() + offset + 1, 0).getDate();
  }
  return days;
}

export function addPassDuration(duration: string, startDate: string) {
  const match = String(duration ?? '')
    .trim()
    .match(/^(\d+)\s*(Day|Week|Month|Year)s?$/i);
  const end = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(end.getTime())) return startDate;
  if (!match) {
    end.setDate(end.getDate() + 30);
    return toIsoDate(end);
  }
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith('day')) end.setDate(end.getDate() + Math.max(amount, 1) - 1);
  else if (unit.startsWith('week')) end.setDate(end.getDate() + amount * 7);
  else if (unit.startsWith('month')) {
    const inclusiveDays = daysAcrossStartingMonths(end, Math.max(amount, 1));
    end.setDate(end.getDate() + inclusiveDays - 1);
  }
  else end.setFullYear(end.getFullYear() + amount);
  return toIsoDate(end);
}

function toIsoDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export type AutoRenewCheck = {
  eligible: boolean;
  expectedAmount: number;
  configuredUpi: string;
  passType: string;
  passDuration: string;
  passCharges: number;
  coachingCharges: number;
  currentValidUntil: string;
  fullName: string;
  mobile: string;
  batch: string;
  coach: string | null;
};

function inferPassDuration(duration: string, passName: string) {
  const fromType = String(duration ?? '').trim();
  if (/^(\d+)\s*(Day|Week|Month|Year)s?$/i.test(fromType)) return fromType;
  if (/\bday|daily\b/i.test(`${fromType} ${passName}`)) return '1 Day';
  if (fromType) return fromType;
  return '1 Month';
}

export async function loadAutoRenewCandidate(params: {
  saasAccountId: number;
  registrationId: number;
}): Promise<AutoRenewCheck | null> {
  const { rows } = await pool.query(
    `SELECT r.id, r.full_name, r.whatsapp_mobile, r.pass_type, r.batch, r.coach, r.pass_valid_until,
            p.pass_type AS paid_pass_type, p.pass_charges AS paid_pass_charges,
            p.coaching_charges AS paid_coaching_charges, p.amount AS paid_amount,
            COALESCE(pt.duration, '') AS pass_duration,
            COALESCE(pt.pass_charges, 0) AS type_pass_charges,
            COALESCE(pt.coaching_charges, 0) AS type_coaching_charges,
            pci.upi_details
     FROM registrations r
     LEFT JOIN LATERAL (
       SELECT pass_type, pass_charges, coaching_charges, amount
       FROM pass_payments
       WHERE saas_account_id = r.saas_account_id AND registration_id = r.id
       ORDER BY payment_date DESC, id DESC
       LIMIT 1
     ) p ON TRUE
     LEFT JOIN pass_types pt
       ON pt.saas_account_id = r.saas_account_id
      AND LOWER(TRIM(pt.pass_name)) = LOWER(TRIM(COALESCE(p.pass_type, r.pass_type, '')))
     LEFT JOIN pool_core_info pci ON pci.saas_account_id = r.saas_account_id
     WHERE r.id = $1 AND r.saas_account_id = $2`,
    [params.registrationId, params.saasAccountId],
  );
  const row = rows[0];
  if (!row) return null;

  const today = indiaTodayIso();
  const until = formatPaymentDate(row.pass_valid_until);
  if (!until) return null;

  const windowEnd = indiaDaysAgoIso(-AUTO_RENEW_WITHIN_DAYS);
  const expired = until < today;
  const expiringSoon = until >= today && until <= windowEnd;
  if (!expired && !expiringSoon) return null;

  const passType = String(row.paid_pass_type || row.pass_type || '').trim();
  if (!passType) return null;

  const paidAmount = Number(row.paid_amount ?? 0);
  const typeAmount = Number(row.type_pass_charges ?? 0) + Number(row.type_coaching_charges ?? 0);
  const expectedAmount = paidAmount > 0 ? paidAmount : typeAmount;
  if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) return null;

  return {
    eligible: true,
    expectedAmount,
    configuredUpi: String(row.upi_details ?? '').trim(),
    passType,
    passDuration: inferPassDuration(String(row.pass_duration ?? ''), passType),
    passCharges: Number((paidAmount > 0 ? row.paid_pass_charges : row.type_pass_charges) ?? 0),
    coachingCharges: Number(
      (paidAmount > 0 ? row.paid_coaching_charges : row.type_coaching_charges) ?? 0,
    ),
    currentValidUntil: until,
    fullName: String(row.full_name ?? '').trim(),
    mobile: String(row.whatsapp_mobile ?? '').trim(),
    batch: String(row.batch ?? '').trim(),
    coach: row.coach == null ? null : String(row.coach),
  };
}

export async function issueAutoRenewedPass(params: {
  saasAccountId: number;
  registrationId: number;
  fromMobileLast10: string;
  candidate: AutoRenewCheck;
  paymentDate: string;
  transactionId: string;
  inboundId: number;
}) {
  const today = indiaTodayIso();
  const expired = params.candidate.currentValidUntil < today;
  const startDate = expired ? params.paymentDate : params.candidate.currentValidUntil;
  const passValidUntil = addPassDuration(params.candidate.passDuration, startDate);

  const client = await pool.connect();
  let updated:
    | {
        full_name?: string;
        whatsapp_mobile?: string;
        batch?: string;
        coach?: string | null;
      }
    | undefined;
  try {
    await client.query('BEGIN');
    const senderOk = await client.query(
      `SELECT id FROM registrations
        WHERE id = $1 AND saas_account_id = $2
          AND RIGHT(regexp_replace(COALESCE(whatsapp_mobile, ''), '\\D', '', 'g'), 10) = $3
        LIMIT 1`,
      [params.registrationId, params.saasAccountId, params.fromMobileLast10],
    );
    if (!senderOk.rows[0]) {
      await client.query('ROLLBACK');
      return { issued: false as const, reason: 'not_swimmer' as const, passValidUntil };
    }

    const existingTxn = await client.query(
      `SELECT id FROM pass_payments
       WHERE LOWER(TRIM(COALESCE(transaction_id, ''))) = LOWER(TRIM($1))
       LIMIT 1`,
      [params.transactionId],
    );
    if (existingTxn.rows[0]) {
      await client.query('ROLLBACK');
      return { issued: false as const, reason: 'duplicate_transaction' as const, passValidUntil };
    }

    const { rows } = await client.query(
      `UPDATE registrations
          SET is_active = TRUE,
              inactive_at = NULL,
              pass_type = $1,
              pass_valid_until = $2::date
        WHERE id = $3 AND saas_account_id = $4
        RETURNING id, full_name, whatsapp_mobile, pass_type, batch, coach, pass_valid_until`,
      [params.candidate.passType, passValidUntil, params.registrationId, params.saasAccountId],
    );
    updated = rows[0];
    if (!updated) {
      await client.query('ROLLBACK');
      return { issued: false as const, reason: 'not_found' as const, passValidUntil };
    }

    const inboundShot = await client.query<{ file_path: string | null }>(
      `SELECT file_path FROM whatsapp_inbound
        WHERE id = $1 AND saas_account_id = $2
        LIMIT 1`,
      [params.inboundId, params.saasAccountId],
    );
    const screenshotPath = String(inboundShot.rows[0]?.file_path ?? '').trim() || null;

    const payment = await insertPassPayment({
      accountId: params.saasAccountId,
      registrationId: params.registrationId,
      swimmerName: String(updated.full_name ?? params.candidate.fullName),
      passType: params.candidate.passType,
      passCharges: params.candidate.passCharges,
      coachingCharges: params.candidate.coachingCharges,
      amount: params.candidate.expectedAmount,
      paymentMode: 'Online',
      transactionId: params.transactionId,
      upgradeSourcePaymentId: null,
      paymentDate: params.paymentDate,
      screenshotPath,
      client,
    });
    // Same-amount WhatsApp renewals skip the in-person test-upgrade queue.
    await client.query(
      `UPDATE pass_payments
          SET test_upgrade_applied = TRUE
        WHERE id = $1 AND saas_account_id = $2`,
      [payment.id, params.saasAccountId],
    );

    await client.query(
      `UPDATE pass_payment_intents
          SET status = 'verified',
              verified_at = NOW(),
              inbound_id = $1,
              detected_amount = $2,
              transaction_id = COALESCE(NULLIF($3, ''), transaction_id),
              notes = 'Auto-renewed from WhatsApp screenshot'
        WHERE saas_account_id = $4
          AND registration_id = $5
          AND status = 'pending'`,
      [
        params.inboundId,
        params.candidate.expectedAmount,
        params.transactionId,
        params.saasAccountId,
        params.registrationId,
      ],
    );
    await client.query('COMMIT');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }

  if (!updated) {
    return { issued: false as const, reason: 'not_found' as const, passValidUntil };
  }

  try {
    await pool.query(
      `INSERT INTO account_audit_logs
         (saas_account_id, actor_user_id, actor_user_name, action, entity_type,
          entity_id, entity_label, summary, details)
       VALUES ($1, NULL, 'WhatsApp', 'update', 'swimmer', $2, $3, $4, $5::jsonb)`,
      [
        params.saasAccountId,
        String(params.registrationId),
        params.candidate.fullName,
        'Auto-renewed pass from payment screenshot',
        JSON.stringify({
          passType: params.candidate.passType,
          passValidUntil,
          paymentDate: params.paymentDate,
          amount: params.candidate.expectedAmount,
          transactionId: params.transactionId,
          startedFrom: expired ? 'payment_date' : 'current_expiry',
        }),
      ],
    );
  } catch (err) {
    console.warn('[pass-auto-renew] audit log failed', err);
  }

  void maybeNotifyBatchCoachOverLimit({
    saasAccountId: params.saasAccountId,
    registrationId: params.registrationId,
    swimmerName: String(updated.full_name ?? params.candidate.fullName),
    passType: params.candidate.passType,
    batch: String(updated.batch ?? params.candidate.batch),
    coach: updated.coach ?? params.candidate.coach,
    source: 'whatsapp_verified',
  }).catch((err) => console.warn('[whatsapp] batch capacity notify failed', err));

  void maybeNotifyPackageSwimmerCapacity(params.saasAccountId).catch((err) =>
    console.warn('[whatsapp] package capacity notify failed', err),
  );

  return {
    issued: true as const,
    passValidUntil,
    startDate,
    expired,
    fullName: String(updated.full_name ?? params.candidate.fullName),
    mobile: String(updated.whatsapp_mobile ?? params.candidate.mobile),
  };
}
