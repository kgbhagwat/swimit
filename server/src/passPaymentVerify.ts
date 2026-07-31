import { pool } from './db/pool.js';
import {
  amountsMatch,
  extractPaymentAmounts,
  extractTransactionId,
  ocrImageForAmount,
  upiIdPresentInText,
  uploadAbsolutePath,
} from './paymentAmount.js';
import { notifyPassIssued } from './whatsapp/notify.js';
import { maybeNotifyBatchCoachOverLimit } from './batchCapacity.js';
import { maybeNotifyPackageSwimmerCapacity } from './packageCapacityWarnings.js';
import { sendWhatsAppText } from './whatsapp/client.js';
import { getWhatsAppConfig } from './whatsapp/config.js';

async function logOutbound(params: {
  saasAccountId: number;
  toMobile: string;
  kind: string;
  body: string;
  status: 'sent' | 'skipped' | 'failed';
  error?: string;
}) {
  try {
    await pool.query(
      `INSERT INTO whatsapp_outbound
       (saas_account_id, to_mobile, kind, body, status, error)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        params.saasAccountId,
        params.toMobile,
        params.kind,
        params.body,
        params.status,
        params.error ?? null,
      ],
    );
  } catch (err) {
    console.error('[whatsapp] failed to log outbound', err);
  }
}

async function replyText(saasAccountId: number, mobile: string, body: string, kind: string) {
  const cfg = getWhatsAppConfig();
  if (!cfg.enabled) {
    await logOutbound({
      saasAccountId,
      toMobile: mobile,
      kind,
      body,
      status: 'skipped',
      error: 'WhatsApp is not configured',
    });
    return;
  }
  try {
    await sendWhatsAppText(mobile, body);
    await logOutbound({
      saasAccountId,
      toMobile: mobile,
      kind,
      body,
      status: 'sent',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed';
    await logOutbound({
      saasAccountId,
      toMobile: mobile,
      kind,
      body,
      status: 'failed',
      error: message,
    });
  }
}

/**
 * Verify pass payment screenshot against a pending intent for this account + mobile.
 * Matches pool UPI + expected amount, then issues the pass and confirms on WhatsApp.
 */
export async function processPassPaymentInbound(params: {
  saasAccountId: number;
  fromMobileLast10: string;
  caption: string;
  relativeFilePath: string | null;
  inboundId: number;
  registrationId?: number | null;
}) {
  const pending = await pool.query(
    `SELECT i.*
     FROM pass_payment_intents i
     WHERE i.saas_account_id = $1
       AND i.status = 'pending'
       AND (
         RIGHT(regexp_replace(i.from_mobile, '\\D', '', 'g'), 10) = $2
         OR ($3::int IS NOT NULL AND i.registration_id = $3)
       )
     ORDER BY
       CASE WHEN $3::int IS NOT NULL AND i.registration_id = $3 THEN 0 ELSE 1 END,
       i.created_at DESC
     LIMIT 1`,
    [params.saasAccountId, params.fromMobileLast10, params.registrationId ?? null],
  );
  if (!pending.rows[0]) return false;

  const intent = pending.rows[0] as Record<string, unknown>;
  const intentId = Number(intent.id);
  const registrationId = Number(intent.registration_id);
  const expected = Number(intent.expected_amount);
  const passType = String(intent.pass_type ?? '');
  const batch = String(intent.batch ?? '');
  const coach = String(intent.coach ?? '');
  const passValidUntil = String(intent.pass_valid_until).slice(0, 10);
  const passCharges = Number(intent.pass_charges ?? 0);
  const coachingCharges = Number(intent.coaching_charges ?? 0);

  let textBlob = String(params.caption ?? '');
  if (params.relativeFilePath) {
    try {
      const abs = uploadAbsolutePath(params.relativeFilePath);
      const ocrText = await ocrImageForAmount(abs);
      if (ocrText) textBlob = `${textBlob}\n${ocrText}`;
    } catch (err) {
      console.warn('[pass-payment] OCR skipped', err);
    }
  }

  const poolPay = await pool.query(
    `SELECT upi_details FROM pool_core_info WHERE saas_account_id = $1 LIMIT 1`,
    [params.saasAccountId],
  );
  const configuredUpi = String(poolPay.rows[0]?.upi_details ?? '').trim();
  const upiOk = upiIdPresentInText(configuredUpi, textBlob);
  const found = extractPaymentAmounts(textBlob);
  const matched = amountsMatch(expected, found);
  const detected = found.find((a) => Math.abs(a - expected) <= 1) ?? found[0] ?? null;
  const transactionId = extractTransactionId(textBlob) ?? '';

  if (!matched || !upiOk) {
    const reasons: string[] = [];
    if (!matched) {
      reasons.push(
        found.length
          ? `Amount not matched. Expected ₹${expected}, found: ${found.join(', ')}`
          : `Amount not found. Expected ₹${expected}`,
      );
    }
    if (!upiOk) {
      reasons.push(
        configuredUpi
          ? `UPI ID not found in screenshot. Expected payment to ${configuredUpi}`
          : 'Pool UPI ID could not be verified',
      );
    }

    await pool.query(
      `UPDATE pass_payment_intents
       SET inbound_id = $1,
           detected_amount = $2,
           transaction_id = COALESCE(NULLIF($3, ''), transaction_id),
           notes = $4
       WHERE id = $5 AND status = 'pending'`,
      [params.inboundId, detected, transactionId, reasons.join(' | '), intentId],
    );

    await replyText(
      params.saasAccountId,
      params.fromMobileLast10,
      [
        'We received your pass payment screenshot, but could not confirm it yet.',
        ...reasons,
        '',
        'Please pay the exact amount to the pool UPI / QR and send the payment screenshot again.',
      ].join('\n'),
      'pass_payment_mismatch',
    );
    return true;
  }

  const client = await pool.connect();
  let swimmerName = '';
  let mobile = params.fromMobileLast10;
  try {
    await client.query('BEGIN');

    const locked = await client.query(
      `UPDATE pass_payment_intents
       SET status = 'verified',
           inbound_id = $1,
           detected_amount = $2,
           transaction_id = $3,
           verified_at = NOW(),
           notes = 'Payment verified'
       WHERE id = $4 AND status = 'pending'
       RETURNING id`,
      [params.inboundId, detected ?? expected, transactionId, intentId],
    );
    if ((locked.rowCount ?? 0) === 0) {
      await client.query('ROLLBACK');
      return true;
    }

    const updated = await client.query(
      `UPDATE registrations
       SET pass_type = $1,
           batch = NULLIF($2, ''),
           coach = NULLIF($3, ''),
           pass_valid_until = $4::date,
           is_active = TRUE,
           inactive_at = NULL
       WHERE id = $5 AND saas_account_id = $6
       RETURNING id, full_name, whatsapp_mobile, pass_valid_until`,
      [passType, batch, coach, passValidUntil, registrationId, params.saasAccountId],
    );
    if (!updated.rows[0]) {
      await client.query('ROLLBACK');
      return true;
    }

    swimmerName = String(updated.rows[0].full_name ?? '');
    mobile = String(updated.rows[0].whatsapp_mobile ?? params.fromMobileLast10)
      .replace(/\D/g, '')
      .slice(-10);

    await client.query(
      `INSERT INTO pass_payments
       (saas_account_id, registration_id, swimmer_name, pass_type, pass_charges, coaching_charges,
        amount, payment_date, payment_mode, transaction_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE, 'Online', $8)`,
      [
        params.saasAccountId,
        registrationId,
        swimmerName,
        passType,
        passCharges,
        coachingCharges,
        expected,
        transactionId || null,
      ],
    );

    await client.query(
      `UPDATE pass_payment_intents
       SET status = 'cancelled', notes = 'Superseded by verified payment'
       WHERE registration_id = $1 AND status = 'pending' AND id <> $2`,
      [registrationId, intentId],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const account = await pool.query(`SELECT account_code FROM saas_accounts WHERE id = $1`, [
    params.saasAccountId,
  ]);

  await replyText(
    params.saasAccountId,
    mobile,
    [
      'Payment confirmation: pass payment received. Thank you!',
      '',
      `Swimmer: ${swimmerName}`,
      `Pass: ${passType}`,
      `Amount: ₹${expected.toLocaleString('en-IN')}`,
      transactionId ? `Transaction ID: ${transactionId}` : '',
      `Valid until: ${passValidUntil}`,
    ]
      .filter(Boolean)
      .join('\n'),
    'pass_payment_verified',
  );

  void notifyPassIssued({
    mobile,
    fullName: swimmerName,
    passType,
    passValidUntil,
    registrationId,
    accountCode: String(account.rows[0]?.account_code ?? ''),
    saasAccountId: params.saasAccountId,
  }).catch((err) => console.warn('[whatsapp] pass notify after WA payment failed', err));

  void maybeNotifyBatchCoachOverLimit({
    saasAccountId: params.saasAccountId,
    registrationId,
    swimmerName,
    passType,
    batch,
    coach,
    source: 'whatsapp_verified',
  }).catch((err) => console.warn('[whatsapp] batch capacity notify failed', err));

  void maybeNotifyPackageSwimmerCapacity(params.saasAccountId).catch((err) =>
    console.warn('[whatsapp] package capacity notify failed', err),
  );

  return true;
}
