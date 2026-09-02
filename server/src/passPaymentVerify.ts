import { pool } from './db/pool.js';
import {
  amountsMatch,
  extractPaymentAmounts,
  extractTransactionId,
  extractUpiIds,
  ocrImageForAmount,
  paymentDateValidForFullScreenshot,
  paymentIsToPlatformUpi,
  pickPaymentDateFromText,
  upiIdPresentInText,
  uploadAbsolutePath,
} from './paymentAmount.js';
import { sendWhatsAppText } from './whatsapp/client.js';
import { getWhatsAppConfig } from './whatsapp/config.js';
import { notifyPassIssued } from './whatsapp/notify.js';
import { INDIA_SQL_TODAY, indiaTodayIso } from './indiaDate.js';
import { formatPaymentDate, insertPassPayment, money } from './passInvoice.js';
import { issueAutoRenewedPass, loadAutoRenewCandidate } from './passAutoRenew.js';
import { maybeNotifyBatchCoachOverLimit } from './batchCapacity.js';
import { maybeNotifyPackageSwimmerCapacity } from './packageCapacityWarnings.js';

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

export type PassScreenshotStatus = {
  upiOk: boolean;
  amountMatched: boolean;
  partial?: boolean;
  transactionId: string;
  detectedAmount: number | null;
  expectedAmount: number | null;
  issued?: boolean;
};

function screenshotStatusFromRow(row: Record<string, unknown> | undefined): PassScreenshotStatus {
  const expected = row?.expected_amount == null ? null : Number(row.expected_amount);
  const detected = row?.detected_amount == null ? null : Number(row.detected_amount);
  const notes = String(row?.notes ?? '');
  const partial = notes.includes('Partial payment received');
  const matched = notes.includes('Screenshot matched') || notes.includes('Auto-renewed');
  const upiFailed = notes.includes('UPI ID not found');
  const amountFailed = notes.includes('Amount not');
  return {
    upiOk: partial || matched || (Boolean(notes) && !upiFailed),
    amountMatched: matched && !amountFailed,
    partial,
    transactionId: String(row?.transaction_id ?? '').trim(),
    detectedAmount: Number.isFinite(detected as number) ? detected : null,
    expectedAmount: Number.isFinite(expected as number) ? expected : null,
  };
}

async function issuePassFromPendingIntent(params: {
  saasAccountId: number;
  registrationId: number;
  inboundId: number;
  transactionId: string;
  paymentDate: string;
}) {
  const txn = String(params.transactionId ?? '').trim();
  if (!txn) return { issued: false as const, reason: 'no_transaction' as const };

  const duplicateTxn = await pool.query(
    `SELECT id FROM pass_payments
     WHERE saas_account_id = $1 AND registration_id = $2
       AND LOWER(TRIM(COALESCE(transaction_id, ''))) = LOWER(TRIM($3))
     LIMIT 1`,
    [params.saasAccountId, params.registrationId, txn],
  );
  if (duplicateTxn.rows[0]) {
    return { issued: false as const, reason: 'duplicate_transaction' as const };
  }

  const intentRes = await pool.query(
    `SELECT id, pass_type, batch, coach, pass_valid_until::text AS pass_valid_until,
            expected_amount, pass_charges, coaching_charges, notes
       FROM pass_payment_intents
      WHERE saas_account_id = $1 AND registration_id = $2 AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1`,
    [params.saasAccountId, params.registrationId],
  );
  const intent = intentRes.rows[0] as
    | {
        id: number;
        pass_type: string;
        batch: string;
        coach: string;
        pass_valid_until: string;
        expected_amount: string | number;
        pass_charges: string | number;
        coaching_charges: string | number;
        notes: string;
      }
    | undefined;
  if (!intent) return { issued: false as const, reason: 'no_intent' as const };
  if (!String(intent.notes ?? '').includes('Screenshot matched')) {
    return { issued: false as const, reason: 'not_matched' as const };
  }

  const inboundShot = await pool.query<{ file_path: string | null }>(
    `SELECT file_path FROM whatsapp_inbound
      WHERE id = $1 AND saas_account_id = $2
      LIMIT 1`,
    [params.inboundId, params.saasAccountId],
  );
  const screenshotPath = String(inboundShot.rows[0]?.file_path ?? '').trim() || null;
  const passType = String(intent.pass_type ?? '').trim();
  const batch = String(intent.batch ?? '').trim();
  const coach = String(intent.coach ?? '').trim() || null;
  const passValidUntil = String(intent.pass_valid_until ?? '').slice(0, 10);
  const amount = money(Number(intent.expected_amount ?? 0));
  const passCharges = money(Number(intent.pass_charges ?? 0));
  const coachingCharges = money(Number(intent.coaching_charges ?? 0));

  const client = await pool.connect();
  let updated:
    | {
        id: number;
        full_name?: string;
        whatsapp_mobile?: string;
        batch?: string;
        coach?: string | null;
        pass_valid_until?: string | Date;
      }
    | undefined;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE registrations
          SET is_active = TRUE,
              inactive_at = NULL,
              pass_type = $1,
              batch = $2,
              coach = $3,
              pass_valid_until = $4::date,
              pass_balance_due = 0
        WHERE id = $5 AND saas_account_id = $6
        RETURNING id, full_name, whatsapp_mobile, pass_type, batch, coach, pass_valid_until`,
      [passType, batch, coach, passValidUntil, params.registrationId, params.saasAccountId],
    );
    updated = rows[0];
    if (!updated) {
      await client.query('ROLLBACK');
      return { issued: false as const, reason: 'not_found' as const };
    }

    await insertPassPayment({
      accountId: params.saasAccountId,
      registrationId: params.registrationId,
      swimmerName: String(updated.full_name ?? ''),
      passType,
      passCharges,
      coachingCharges,
      amount,
      paymentMode: 'Online',
      transactionId: txn,
      upgradeSourcePaymentId: null,
      paymentDate: params.paymentDate,
      screenshotPath,
      client,
    });

    await client.query(
      `UPDATE pass_payment_intents
          SET status = 'verified',
              verified_at = NOW(),
              inbound_id = $1,
              transaction_id = COALESCE(NULLIF($2, ''), transaction_id),
              notes = 'Issued from WhatsApp screenshot'
        WHERE id = $3`,
      [params.inboundId, txn, intent.id],
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

  const account = await pool.query(`SELECT account_code FROM saas_accounts WHERE id = $1`, [
    params.saasAccountId,
  ]);
  await notifyPassIssued({
    mobile: String(updated!.whatsapp_mobile ?? ''),
    fullName: String(updated!.full_name ?? ''),
    passType,
    passValidUntil,
    registrationId: params.registrationId,
    accountCode: String(account.rows[0]?.account_code ?? ''),
    saasAccountId: params.saasAccountId,
    sendInvoice: true,
  }).catch((err) => {
    console.warn('[pass-payment] pass notify failed', err);
    return { skipped: true as const };
  });

  void maybeNotifyBatchCoachOverLimit({
    saasAccountId: params.saasAccountId,
    registrationId: params.registrationId,
    swimmerName: String(updated!.full_name ?? ''),
    passType,
    batch: String(updated!.batch ?? batch),
    coach: updated!.coach ?? coach,
    source: 'whatsapp_verified',
  }).catch((err) => console.warn('[whatsapp] batch capacity notify failed', err));

  void maybeNotifyPackageSwimmerCapacity(params.saasAccountId).catch((err) =>
    console.warn('[whatsapp] package capacity notify failed', err),
  );

  return {
    issued: true as const,
    passValidUntil,
    mobile: String(updated!.whatsapp_mobile ?? ''),
    fullName: String(updated!.full_name ?? ''),
  };
}

async function recordPartialPaymentFromIntent(params: {
  saasAccountId: number;
  registrationId: number;
  intentId: number;
  inboundId: number;
  intent: Record<string, unknown>;
  partialAmount: number;
  transactionId: string;
  expectedAmount: number;
}) {
  const txn = String(params.transactionId ?? '').trim();
  if (!txn) return false;

  const duplicateTxn = await pool.query(
    `SELECT id FROM pass_payments
     WHERE saas_account_id = $1 AND registration_id = $2
       AND LOWER(TRIM(COALESCE(transaction_id, ''))) = LOWER(TRIM($3))
     LIMIT 1`,
    [params.saasAccountId, params.registrationId, txn],
  );
  if (duplicateTxn.rows[0]) return true;

  const passType = String(params.intent.pass_type ?? '').trim();
  const batch = String(params.intent.batch ?? '').trim();
  const coach = String(params.intent.coach ?? '').trim() || null;
  const passValidUntil = String(params.intent.pass_valid_until ?? '').slice(0, 10);
  const passCharges = money(Number(params.intent.pass_charges ?? 0));
  const coachingCharges = money(Number(params.intent.coaching_charges ?? 0));
  const partialAmount = money(params.partialAmount);
  const remainingDue = money(Math.max(0, params.expectedAmount - partialAmount));

  const inboundShot = await pool.query<{ file_path: string | null }>(
    `SELECT file_path FROM whatsapp_inbound WHERE id = $1 LIMIT 1`,
    [params.inboundId],
  );
  const screenshotPath = String(inboundShot.rows[0]?.file_path ?? '').trim() || null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE registrations
          SET pass_type = $1,
              batch = $2,
              coach = $3,
              pass_valid_until = $4::date,
              pass_balance_due = $5
        WHERE id = $6 AND saas_account_id = $7`,
      [
        passType,
        batch,
        coach,
        passValidUntil,
        remainingDue,
        params.registrationId,
        params.saasAccountId,
      ],
    );
    await insertPassPayment({
      accountId: params.saasAccountId,
      registrationId: params.registrationId,
      swimmerName: (
        await client.query(`SELECT full_name FROM registrations WHERE id = $1`, [
          params.registrationId,
        ])
      ).rows[0]?.full_name ?? '',
      passType,
      passCharges,
      coachingCharges,
      amount: partialAmount,
      remark: 'Partially paid',
      paymentMode: 'Online',
      transactionId: txn,
      upgradeSourcePaymentId: null,
      screenshotPath,
      client,
    });
    await client.query(
      `UPDATE pass_payment_intents
          SET inbound_id = $1,
              detected_amount = $2,
              transaction_id = COALESCE(NULLIF($3, ''), transaction_id),
              notes = 'Partial payment received'
        WHERE id = $4 AND status = 'pending'`,
      [params.inboundId, partialAmount, txn, params.intentId],
    );
    await client.query('COMMIT');
    return true;
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
}

function validateFullPaymentScreenshotDate(params: {
  textBlob: string;
  screenshotReceivedDate: string;
  intentSavedAt: Date | string | null | undefined;
}): { ok: true; paymentDate: string } | { ok: false; paymentDate: string | null; note: string } {
  const paymentDate = pickPaymentDateFromText(params.textBlob);
  if (!paymentDate) {
    return { ok: false, paymentDate: null, note: 'Payment date not found in screenshot' };
  }
  const intentSavedDate = params.intentSavedAt
    ? indiaTodayIso(new Date(String(params.intentSavedAt)))
    : null;
  const valid = paymentDateValidForFullScreenshot({
    paymentDate,
    screenshotReceivedDate: params.screenshotReceivedDate,
    intentSavedDate,
  });
  if (!valid.ok) {
    const note =
      valid.reason === 'before_saved'
        ? `Payment date ${paymentDate} is before pass selections were saved (${intentSavedDate})`
        : valid.reason === 'after_received'
          ? `Payment date ${paymentDate} is after the screenshot was received (${params.screenshotReceivedDate})`
          : valid.reason === 'not_same_day'
            ? `Payment date ${paymentDate} must be the same day the screenshot was received (${params.screenshotReceivedDate})`
            : `Payment date ${paymentDate} could not be verified`;
    return { ok: false, paymentDate, note };
  }
  return { ok: true, paymentDate };
}

async function resolvePassIssueTarget(params: {
  fromMobileLast10: string;
  textBlob: string;
}): Promise<
  | {
      ok: true;
      saasAccountId: number;
      registrationId: number;
      configuredUpi: string;
      poolName: string;
    }
  | { ok: false; reason: 'no_upi' | 'no_pool' | 'not_swimmer' | 'ambiguous'; poolName?: string; matchedUpi?: string }
> {
  const upiIds = extractUpiIds(params.textBlob);
  if (!upiIds.length) return { ok: false, reason: 'no_upi' };

  const pools = await pool.query<{
    saas_account_id: number;
    upi_details: string;
    pool_name: string | null;
  }>(
    `SELECT saas_account_id, upi_details, pool_name
       FROM pool_core_info
      WHERE TRIM(COALESCE(upi_details, '')) <> ''`,
  );
  const matchedPools = pools.rows.filter((row) =>
    upiIdPresentInText(String(row.upi_details ?? ''), params.textBlob),
  );
  if (!matchedPools.length) return { ok: false, reason: 'no_pool' };

  const poolIds = [...new Set(matchedPools.map((row) => Number(row.saas_account_id)))];
  const swimmers = await pool.query<{ id: number; saas_account_id: number }>(
    `SELECT id, saas_account_id
       FROM registrations
      WHERE saas_account_id = ANY($1::int[])
        AND RIGHT(regexp_replace(COALESCE(whatsapp_mobile, ''), '\\D', '', 'g'), 10) = $2
      ORDER BY id DESC`,
    [poolIds, params.fromMobileLast10],
  );
  if (!swimmers.rows.length) {
    return {
      ok: false,
      reason: 'not_swimmer',
      poolName: String(matchedPools[0]?.pool_name ?? ''),
      matchedUpi: String(matchedPools[0]?.upi_details ?? '').trim(),
    };
  }

  const accountIds = [...new Set(swimmers.rows.map((row) => Number(row.saas_account_id)))];
  if (accountIds.length !== 1) return { ok: false, reason: 'ambiguous' };

  const saasAccountId = accountIds[0];
  const registrationId = Number(
    swimmers.rows.find((row) => Number(row.saas_account_id) === saasAccountId)?.id,
  );
  const poolRow = matchedPools.find((row) => Number(row.saas_account_id) === saasAccountId);
  if (!registrationId || !poolRow) return { ok: false, reason: 'not_swimmer' };

  return {
    ok: true,
    saasAccountId,
    registrationId,
    configuredUpi: String(poolRow.upi_details ?? '').trim(),
    poolName: String(poolRow.pool_name ?? ''),
  };
}

async function maybeAutoRenewFromScreenshot(params: {
  saasAccountId: number;
  registrationId: number;
  fromMobileLast10: string;
  inboundId: number;
  upiOk: boolean;
  configuredUpi: string;
  foundAmounts: number[];
  transactionId: string;
  paymentDate: string;
  textBlob?: string;
  intentSavedAt?: Date | string | null;
  notifyMismatch?: boolean;
  hasPendingIntent?: boolean;
}) {
  const candidate = await loadAutoRenewCandidate({
    saasAccountId: params.saasAccountId,
    registrationId: params.registrationId,
  });
  if (!candidate) return false;
  const swimmerMobile = String(candidate.mobile ?? '').replace(/\D/g, '').slice(-10);
  if (!swimmerMobile || swimmerMobile !== params.fromMobileLast10) return false;

  const amountOk = amountsMatch(candidate.expectedAmount, params.foundAmounts);
  if (!candidate.configuredUpi || !params.upiOk || !amountOk) {
    if (params.notifyMismatch === false || params.hasPendingIntent) return false;
    await replyText(
      params.saasAccountId,
      params.fromMobileLast10,
      !params.upiOk
        ? [
            'We received your payment screenshot, but the UPI ID did not match.',
            candidate.configuredUpi
              ? `Please pay to *${candidate.configuredUpi}* and send the screenshot again.`
              : '',
          ]
            .filter(Boolean)
            .join('\n')
        : [
            'We received your payment screenshot. The UPI ID matched, but the amount did not.',
            `Please pay *₹${candidate.expectedAmount.toLocaleString('en-IN')}* (same as your last pass) and send the screenshot again.`,
          ].join('\n'),
      'pass_payment_mismatch',
    );
    return true;
  }

  if (!params.transactionId) {
    await replyText(
      params.saasAccountId,
      params.fromMobileLast10,
      [
        'We received your payment screenshot. Amount and UPI ID matched.',
        'Please send a screenshot that clearly shows the UPI transaction ID / UTR so we can issue your pass.',
      ].join('\n'),
      'pass_payment_mismatch',
    );
    return true;
  }

  if (params.textBlob) {
    const dateCheck = validateFullPaymentScreenshotDate({
      textBlob: params.textBlob,
      screenshotReceivedDate: params.paymentDate,
      intentSavedAt: params.intentSavedAt ?? null,
    });
    if (!dateCheck.ok) {
      if (params.notifyMismatch === false || params.hasPendingIntent) return false;
      await replyText(
        params.saasAccountId,
        params.fromMobileLast10,
        [
          'We received your payment screenshot. Amount and UPI ID matched, but the payment date could not be verified.',
          dateCheck.note,
          'Please send a fresh screenshot from today\'s payment, or contact the pool office.',
        ].join('\n'),
        'pass_payment_mismatch',
      );
      return true;
    }
  }

  const result = await issueAutoRenewedPass({
    saasAccountId: params.saasAccountId,
    registrationId: params.registrationId,
    fromMobileLast10: params.fromMobileLast10,
    candidate,
    paymentDate: params.paymentDate,
    transactionId: params.transactionId,
    inboundId: params.inboundId,
  });

  if ('reason' in result && result.reason === 'duplicate_transaction') {
    if (params.notifyMismatch === false) {
      await sendPassAndInvoiceForRegistration({
        saasAccountId: params.saasAccountId,
        registrationId: params.registrationId,
        passType: candidate.passType,
      });
      return true;
    }
    await replyText(
      params.saasAccountId,
      params.fromMobileLast10,
      'This transaction was already used to issue a pass. If you paid again, send a new screenshot with a new transaction ID.',
      'pass_payment_received',
    );
    return true;
  }

  if (!result.issued) return false;

  await pool.query(`UPDATE whatsapp_inbound SET payment_notice_sent = TRUE WHERE id = $1`, [
    params.inboundId,
  ]);
  await replyText(
    params.saasAccountId,
    params.fromMobileLast10,
    [
      'Payment received. Thank you!',
      '',
      `Amount: ₹${candidate.expectedAmount.toLocaleString('en-IN')}`,
      `Payment date: ${params.paymentDate}`,
      candidate.configuredUpi ? `UPI ID: ${candidate.configuredUpi}` : '',
      `Transaction ID: ${params.transactionId}`,
      `Your pass is renewed until ${result.passValidUntil}.`,
    ]
      .filter(Boolean)
      .join('\n'),
    'pass_payment_received',
  );

  const account = await pool.query(`SELECT account_code FROM saas_accounts WHERE id = $1`, [
    params.saasAccountId,
  ]);
  await notifyPassIssued({
    mobile: result.mobile,
    fullName: result.fullName,
    passType: candidate.passType,
    passValidUntil: result.passValidUntil,
    registrationId: params.registrationId,
    accountCode: String(account.rows[0]?.account_code ?? ''),
    saasAccountId: params.saasAccountId,
    sendInvoice: true,
  }).catch((err) => {
    console.warn('[pass-auto-renew] pass notify failed', err);
    return { skipped: true as const };
  });
  return true;
}

async function sendPassAndInvoiceForRegistration(params: {
  saasAccountId: number;
  registrationId: number;
  passType: string;
}) {
  const { rows } = await pool.query(
    `SELECT r.full_name, r.whatsapp_mobile, r.pass_type, r.pass_valid_until, a.account_code
       FROM registrations r
       JOIN saas_accounts a ON a.id = r.saas_account_id
      WHERE r.id = $1 AND r.saas_account_id = $2`,
    [params.registrationId, params.saasAccountId],
  );
  const row = rows[0];
  if (!row) return;
  const until = formatPaymentDate(row.pass_valid_until);
  const mobile = String(row.whatsapp_mobile ?? '').trim();
  if (!until || !mobile) return;
  await notifyPassIssued({
    mobile,
    fullName: String(row.full_name ?? '').trim(),
    passType: String(row.pass_type ?? params.passType),
    passValidUntil: until,
    registrationId: params.registrationId,
    accountCode: String(row.account_code ?? ''),
    saasAccountId: params.saasAccountId,
    sendInvoice: true,
  }).catch((err) => {
    console.warn('[pass-auto-renew] pass notify failed', err);
    return { skipped: true as const };
  });
}

/** Issue a same-amount renewal for screenshot-matched intents that never created a pass. */
export async function completePendingScreenshotAutoRenews(params: {
  saasAccountId: number;
  registrationId?: number;
}) {
  const { rows } = await pool.query(
    `SELECT i.registration_id, i.inbound_id, i.transaction_id, i.expected_amount,
            i.detected_amount, i.from_mobile
       FROM pass_payment_intents i
      WHERE i.saas_account_id = $1
        AND i.status = 'pending'
        AND i.notes ILIKE '%Screenshot matched%'
        AND (
          TRIM(COALESCE(i.transaction_id, '')) <> ''
          OR EXISTS (
            SELECT 1 FROM whatsapp_inbound w
             WHERE w.id = i.inbound_id
               AND TRIM(COALESCE(w.ocr_transaction_id, '')) <> ''
          )
        )
        AND ($2::int IS NULL OR i.registration_id = $2)`,
    [params.saasAccountId, params.registrationId ?? null],
  );

  for (const row of rows) {
    const registrationId = Number(row.registration_id);
    if (!Number.isFinite(registrationId) || registrationId <= 0) continue;
    try {
      const inboundId = Number(row.inbound_id) || 0;
      if (!inboundId) continue;
      let paymentDate = indiaTodayIso();
      let fromMobile = String(row.from_mobile ?? '').replace(/\D/g, '').slice(-10);
      let inboundTxn = '';
      const inbound = await pool.query(
        `SELECT created_at, from_mobile, ocr_transaction_id, ocr_upi_ok
           FROM whatsapp_inbound
          WHERE id = $1`,
        [inboundId],
      );
      if (inbound.rows[0]?.ocr_upi_ok !== true) continue;
      if (inbound.rows[0]?.created_at) {
        paymentDate = indiaTodayIso(new Date(inbound.rows[0].created_at));
      }
      const inboundMobile = String(inbound.rows[0]?.from_mobile ?? '')
        .replace(/\D/g, '')
        .slice(-10);
      if (inboundMobile) fromMobile = inboundMobile;
      inboundTxn = String(inbound.rows[0]?.ocr_transaction_id ?? '').trim();
      const transactionId = String(row.transaction_id ?? '').trim() || inboundTxn;
      if (!transactionId || !fromMobile) continue;

      const detected = Number(row.detected_amount);
      const foundAmounts = Number.isFinite(detected) && detected > 0 ? [detected] : [];
      await maybeAutoRenewFromScreenshot({
        saasAccountId: params.saasAccountId,
        registrationId,
        fromMobileLast10: fromMobile,
        inboundId,
        upiOk: true,
        configuredUpi: '',
        foundAmounts,
        transactionId,
        paymentDate,
        notifyMismatch: false,
      });

      const issued = await issuePassFromPendingIntent({
        saasAccountId: params.saasAccountId,
        registrationId,
        inboundId,
        transactionId,
        paymentDate,
      });
      if (issued.issued) continue;
    } catch (err) {
      console.warn('[pass-auto-renew] complete pending failed', err);
    }
  }

  await markAutoRenewedTestPaymentsApplied(params.saasAccountId, params.registrationId);
  await sendMissingAutoRenewPassMedia(params.saasAccountId, params.registrationId);
}

async function markAutoRenewedTestPaymentsApplied(
  saasAccountId: number,
  registrationId?: number,
) {
  await pool.query(
    `UPDATE pass_payments p
        SET test_upgrade_applied = TRUE
      WHERE p.saas_account_id = $1
        AND COALESCE(p.test_upgrade_applied, FALSE) = FALSE
        AND ($2::int IS NULL OR p.registration_id = $2)
        AND EXISTS (
          SELECT 1
            FROM pass_payment_intents i
           WHERE i.saas_account_id = p.saas_account_id
             AND i.registration_id = p.registration_id
             AND i.status = 'verified'
             AND i.notes ILIKE '%Auto-renewed%'
             AND (
               (
                 TRIM(COALESCE(i.transaction_id, '')) <> ''
                 AND LOWER(TRIM(i.transaction_id)) = LOWER(TRIM(COALESCE(p.transaction_id, '')))
               )
               OR p.payment_date = ${INDIA_SQL_TODAY}
             )
        )`,
    [saasAccountId, registrationId ?? null],
  );
}

async function sendMissingAutoRenewPassMedia(
  saasAccountId: number,
  registrationId?: number,
) {
  const { rows } = await pool.query(
    `SELECT r.id, r.full_name, r.whatsapp_mobile, r.pass_type, r.pass_valid_until, a.account_code
       FROM pass_payment_intents i
       JOIN registrations r
         ON r.id = i.registration_id AND r.saas_account_id = i.saas_account_id
       JOIN saas_accounts a ON a.id = i.saas_account_id
      WHERE i.saas_account_id = $1
        AND i.status = 'verified'
        AND i.notes ILIKE '%Auto-renewed%'
        AND COALESCE(i.verified_at, i.created_at) > NOW() - INTERVAL '2 days'
        AND r.pass_valid_until >= ${INDIA_SQL_TODAY}
        AND ($2::int IS NULL OR r.id = $2)
        AND NOT EXISTS (
          SELECT 1
            FROM whatsapp_outbound o
           WHERE o.saas_account_id = i.saas_account_id
             AND RIGHT(regexp_replace(o.to_mobile, '\\D', '', 'g'), 10)
               = RIGHT(regexp_replace(r.whatsapp_mobile, '\\D', '', 'g'), 10)
             AND o.kind IN ('pass_issued', 'pass_issued_card', 'pass_invoice')
             AND o.status = 'sent'
             AND o.created_at > NOW() - INTERVAL '2 days'
        )`,
    [saasAccountId, registrationId ?? null],
  );

  for (const row of rows) {
    const until = formatPaymentDate(row.pass_valid_until);
    const mobile = String(row.whatsapp_mobile ?? '').trim();
    if (!until || !mobile) continue;
    await notifyPassIssued({
      mobile,
      fullName: String(row.full_name ?? '').trim(),
      passType: String(row.pass_type ?? ''),
      passValidUntil: until,
      registrationId: Number(row.id),
      accountCode: String(row.account_code ?? ''),
      saasAccountId,
      sendInvoice: true,
    }).catch((err) => {
      console.warn('[pass-auto-renew] missing pass notify failed', err);
      return { skipped: true as const };
    });
  }
}

/**
 * Verify pass payment screenshot: UPI first, then amount.
 * If the pass is expired or expires within 5 days and the amount matches the latest pass,
 * confirm the payment and issue the renewed pass (no Pass Payment step).
 * Otherwise staff confirms a new or different-amount payment on Pass Payment.
 */
export async function processPassPaymentInbound(params: {
  saasAccountId: number;
  fromMobileLast10: string;
  caption: string;
  relativeFilePath: string | null;
  inboundId: number;
  registrationId?: number | null;
  lockToAccount?: boolean;
}) {
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

  const inboundPool = await pool.query(
    `SELECT upi_details FROM pool_core_info WHERE saas_account_id = $1 LIMIT 1`,
    [params.saasAccountId],
  );
  let configuredUpi = String(inboundPool.rows[0]?.upi_details ?? '').trim();
  const platformPay = await pool.query(
    `SELECT upi_id FROM platform_payment_settings WHERE id = 1`,
  );
  const platformUpi = String(platformPay.rows[0]?.upi_id ?? '').trim();
  const found = extractPaymentAmounts(textBlob);
  const transactionId = extractTransactionId(textBlob) ?? '';
  const detected = found[0] ?? null;

  if (paymentIsToPlatformUpi(textBlob, platformUpi, configuredUpi)) {
    await pool.query(
      `UPDATE whatsapp_inbound
          SET ocr_upi_ok = $1,
              ocr_amount = $2,
              ocr_transaction_id = $3
        WHERE id = $4`,
      [false, detected, transactionId, params.inboundId],
    );
    await replyText(
      params.saasAccountId,
      params.fromMobileLast10,
      [
        'This screenshot is a SwimIT platform / account payment, not a pool pass payment.',
        platformUpi ? `Paid to: ${platformUpi}` : '',
        configuredUpi
          ? `To buy or renew a pass, pay the pass amount to *${configuredUpi}* and send that screenshot.`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
      'pass_payment_platform_upi',
    );
    return true;
  }

  const target = await resolvePassIssueTarget({
    fromMobileLast10: params.fromMobileLast10,
    textBlob,
  });
  const lockToAccount = params.lockToAccount === true;
  let saasAccountId = params.saasAccountId;
  let registrationId = params.registrationId ?? null;
  let upiOk = false;

  if (target.ok) {
    const lockedMismatch =
      lockToAccount &&
      (target.saasAccountId !== params.saasAccountId ||
        (params.registrationId != null && target.registrationId !== params.registrationId));
    if (lockedMismatch) {
      upiOk = false;
    } else {
      saasAccountId = target.saasAccountId;
      registrationId = target.registrationId;
      configuredUpi = target.configuredUpi;
      upiOk = true;
      if (saasAccountId !== params.saasAccountId || registrationId !== params.registrationId) {
        await pool.query(
          `UPDATE whatsapp_inbound
              SET saas_account_id = $1,
                  registration_id = $2
            WHERE id = $3`,
          [saasAccountId, registrationId, params.inboundId],
        );
      }
    }
  } else if (!lockToAccount && (target.reason === 'not_swimmer' || target.reason === 'ambiguous')) {
    await pool.query(
      `UPDATE whatsapp_inbound
          SET ocr_upi_ok = $1,
              ocr_amount = $2,
              ocr_transaction_id = $3
        WHERE id = $4`,
      [false, detected, transactionId, params.inboundId],
    );
    await replyText(
      params.saasAccountId,
      params.fromMobileLast10,
      target.reason === 'ambiguous'
        ? 'This payment could not be matched to a single pool, so a pass was not issued. Please contact the pool office.'
        : [
            'This payment does not match a swimmer at the pool for that UPI ID, so a pass was not issued.',
            target.matchedUpi ? `Paid to: ${target.matchedUpi}` : '',
            'The WhatsApp number must be in that pool\'s swimmer list, and the screenshot must show that pool\'s UPI ID.',
          ]
            .filter(Boolean)
            .join('\n'),
      'pass_payment_tenant_mismatch',
    );
    return true;
  } else {
    upiOk = false;
    if (registrationId) {
      const ownSwimmer = await pool.query(
        `SELECT id FROM registrations
          WHERE id = $1 AND saas_account_id = $2
            AND RIGHT(regexp_replace(COALESCE(whatsapp_mobile, ''), '\\D', '', 'g'), 10) = $3
          LIMIT 1`,
        [registrationId, saasAccountId, params.fromMobileLast10],
      );
      if (!ownSwimmer.rows[0]) registrationId = null;
    }
  }

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
    [saasAccountId, params.fromMobileLast10, registrationId],
  );

  await pool.query(
    `UPDATE whatsapp_inbound
        SET ocr_upi_ok = $1,
            ocr_amount = $2,
            ocr_transaction_id = $3
      WHERE id = $4`,
    [upiOk, detected, transactionId, params.inboundId],
  );

  const inboundMeta = await pool.query<{ created_at: Date | string }>(
    `SELECT created_at FROM whatsapp_inbound WHERE id = $1`,
    [params.inboundId],
  );
  const sendDate = inboundMeta.rows[0]?.created_at
    ? indiaTodayIso(new Date(inboundMeta.rows[0].created_at))
    : indiaTodayIso();

  const foundAmounts = [...found];

  if (transactionId) {
    const platformTxn = await pool.query(
      `SELECT id FROM saas_package_renewals
       WHERE LOWER(TRIM(COALESCE(transaction_id, ''))) = LOWER(TRIM($1))
         AND status = 'verified'
       LIMIT 1`,
      [transactionId],
    );
    if (platformTxn.rows[0]) {
      await replyText(
        saasAccountId,
        params.fromMobileLast10,
        'This transaction was already used for a SwimIT account / package payment, so it cannot issue a pass.',
        'pass_payment_platform_txn',
      );
      return true;
    }
  }

  if (upiOk && registrationId) {
    const autoHandled = await maybeAutoRenewFromScreenshot({
      saasAccountId,
      registrationId,
      fromMobileLast10: params.fromMobileLast10,
      inboundId: params.inboundId,
      upiOk,
      configuredUpi,
      foundAmounts,
      transactionId,
      paymentDate: sendDate,
      textBlob,
      intentSavedAt: pending.rows[0]?.created_at ?? null,
      hasPendingIntent: Boolean(pending.rows[0]),
    });
    if (autoHandled) return true;
  }

  if (registrationId && transactionId) {
    const alreadyPaid = await pool.query(
      `SELECT id FROM pass_payments
       WHERE saas_account_id = $1 AND registration_id = $2
         AND LOWER(TRIM(COALESCE(transaction_id, ''))) = LOWER(TRIM($3))
       LIMIT 1`,
      [saasAccountId, registrationId, transactionId],
    );
    if (alreadyPaid.rows[0]) {
      await pool.query(
        `UPDATE pass_payment_intents
            SET status = 'verified',
                verified_at = NOW(),
                inbound_id = $1,
                transaction_id = COALESCE(NULLIF($2, ''), transaction_id),
                notes = 'Already issued from this transaction'
          WHERE saas_account_id = $3
            AND registration_id = $4
            AND status = 'pending'`,
        [params.inboundId, transactionId, saasAccountId, registrationId],
      );
      const shot = String(params.relativeFilePath ?? '').trim();
      if (shot) {
        await pool.query(
          `UPDATE pass_payments
              SET screenshot_path = COALESCE(NULLIF(TRIM(screenshot_path), ''), $1)
            WHERE id = $2 AND saas_account_id = $3`,
          [shot, alreadyPaid.rows[0].id, saasAccountId],
        );
      }
      return true;
    }
  }

  if (!pending.rows[0]) {
    return Boolean(registrationId);
  }

  const intent = pending.rows[0] as Record<string, unknown>;
  const intentId = Number(intent.id);
  const expected = Number(intent.expected_amount);
  const alreadyMatched = String(intent.notes ?? '').includes('Screenshot matched');
  if (alreadyMatched) {
    if (transactionId) {
      await pool.query(
        `UPDATE pass_payment_intents
            SET transaction_id = COALESCE(NULLIF($1, ''), transaction_id)
          WHERE id = $2 AND status = 'pending'`,
        [transactionId, intentId],
      );
    }
    if (upiOk && registrationId) {
      await maybeAutoRenewFromScreenshot({
        saasAccountId,
        registrationId,
        fromMobileLast10: params.fromMobileLast10,
        inboundId: params.inboundId,
        upiOk,
        configuredUpi,
        foundAmounts,
        transactionId: transactionId || String(intent.transaction_id ?? '').trim(),
        paymentDate: sendDate,
        notifyMismatch: false,
      });
    }
    return true;
  }
  const sameInbound = Number(intent.inbound_id) === params.inboundId;
  const alreadyUpiMismatch = String(intent.notes ?? '').includes('UPI ID not found');
  const alreadyAmountMismatch = String(intent.notes ?? '').includes('Amount not');

  if (!upiOk) {
    await pool.query(
      `UPDATE pass_payment_intents
          SET inbound_id = $1,
              detected_amount = $2,
              transaction_id = COALESCE(NULLIF($3, ''), transaction_id),
              notes = $4
        WHERE id = $5 AND status = 'pending'`,
      [
        params.inboundId,
        detected,
        transactionId,
        configuredUpi
          ? `UPI ID not found in screenshot. Expected payment to ${configuredUpi}`
          : 'Pool UPI ID could not be verified',
        intentId,
      ],
    );
    if (!sameInbound || !alreadyUpiMismatch) {
      await replyText(
        saasAccountId,
        params.fromMobileLast10,
        [
          'We received your payment screenshot, but the UPI ID did not match.',
          configuredUpi ? `Please pay to *${configuredUpi}* and send the screenshot again.` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        'pass_payment_mismatch',
      );
    }
    return true;
  }

  const amountOk = amountsMatch(expected, found);
  if (!amountOk) {
    const partialCandidates = found.filter((a) => a > 0 && a < expected - 0.01);
    const partialAmount =
      partialCandidates.length > 0 ? Math.max(...partialCandidates) : null;
    if (partialAmount != null && transactionId && registrationId) {
      const recorded = await recordPartialPaymentFromIntent({
        saasAccountId,
        registrationId,
        intentId,
        inboundId: params.inboundId,
        intent,
        partialAmount,
        transactionId,
        expectedAmount: expected,
      });
      if (recorded) {
        if (!sameInbound || !alreadyAmountMismatch) {
          await replyText(
            saasAccountId,
            params.fromMobileLast10,
            [
              'We received your payment screenshot. The UPI ID matched.',
              `Amount received: ₹${partialAmount.toLocaleString('en-IN')}`,
              `Remaining balance: ₹${money(Math.max(0, expected - partialAmount)).toLocaleString('en-IN')}`,
              'Please pay the remaining amount and send the screenshot again, or contact the pool office.',
            ].join('\n'),
            'pass_payment_partial',
          );
        }
        return true;
      }
    }
    await pool.query(
      `UPDATE pass_payment_intents
          SET inbound_id = $1,
              detected_amount = $2,
              transaction_id = COALESCE(NULLIF($3, ''), transaction_id),
              notes = $4
        WHERE id = $5 AND status = 'pending'`,
      [
        params.inboundId,
        detected,
        transactionId,
        found.length
          ? `Amount not matched. Expected ₹${expected}, found: ${found.join(', ')}`
          : `Amount not found. Expected ₹${expected}`,
        intentId,
      ],
    );
    if (!sameInbound || !alreadyAmountMismatch) {
      await replyText(
        saasAccountId,
        params.fromMobileLast10,
        [
          'We received your payment screenshot. The UPI ID matched, but the amount did not.',
          `Please pay *₹${expected.toLocaleString('en-IN')}* and send the screenshot again.`,
        ].join('\n'),
        'pass_payment_mismatch',
      );
    }
    return true;
  }

  const matchedAmount = found.find((a) => Math.abs(a - expected) <= 1) ?? expected;
  const dateCheck = validateFullPaymentScreenshotDate({
    textBlob,
    screenshotReceivedDate: sendDate,
    intentSavedAt: intent.created_at as Date | string | null | undefined,
  });
  if (!dateCheck.ok) {
    await pool.query(
      `UPDATE pass_payment_intents
          SET inbound_id = $1,
              detected_amount = $2,
              transaction_id = COALESCE(NULLIF($3, ''), transaction_id),
              notes = $4
        WHERE id = $5 AND status = 'pending'`,
      [params.inboundId, matchedAmount, transactionId, dateCheck.note, intentId],
    );
    const alreadyDateMismatch = String(intent.notes ?? '').includes('Payment date');
    if (!sameInbound || !alreadyDateMismatch) {
      await replyText(
        saasAccountId,
        params.fromMobileLast10,
        [
          'We received your payment screenshot. Amount and UPI ID matched, but the payment date could not be verified.',
          dateCheck.note,
          'Please send a fresh screenshot from today\'s payment, or contact the pool office.',
        ].join('\n'),
        'pass_payment_mismatch',
      );
    }
    return true;
  }

  await pool.query(
    `UPDATE pass_payment_intents
        SET inbound_id = $1,
            detected_amount = $2,
            transaction_id = COALESCE(NULLIF($3, ''), transaction_id),
            notes = 'Screenshot matched'
      WHERE id = $4 AND status = 'pending'`,
    [params.inboundId, matchedAmount, transactionId, intentId],
  );

  if (registrationId) {
    const autoIssued = await maybeAutoRenewFromScreenshot({
      saasAccountId,
      registrationId,
      fromMobileLast10: params.fromMobileLast10,
      inboundId: params.inboundId,
      upiOk: true,
      configuredUpi,
      foundAmounts,
      transactionId,
      paymentDate: sendDate,
      textBlob,
      intentSavedAt: intent.created_at as Date | string | null | undefined,
      notifyMismatch: false,
    });
    if (autoIssued) return true;

    const issued = await issuePassFromPendingIntent({
      saasAccountId,
      registrationId,
      inboundId: params.inboundId,
      transactionId,
      paymentDate: dateCheck.paymentDate,
    });
    if (issued.issued) return true;
  }

  if (!alreadyMatched) {
    await replyText(
      saasAccountId,
      params.fromMobileLast10,
      transactionId
        ? [
            'Payment received. Thank you!',
            '',
            `Amount: ₹${expected.toLocaleString('en-IN')}`,
            `Transaction ID: ${transactionId}`,
            'Your pass will be issued shortly.',
          ].join('\n')
        : [
            'We received your payment screenshot. Amount and UPI ID matched.',
            'Please send a screenshot that clearly shows the UPI transaction ID / UTR so we can issue your pass.',
          ].join('\n'),
      'pass_payment_received',
    );
    await pool.query(`UPDATE whatsapp_inbound SET payment_notice_sent = TRUE WHERE id = $1`, [
      params.inboundId,
    ]);
  }

  return true;
}

export async function applyLatestScreenshotToIntent(params: {
  saasAccountId: number;
  registrationId: number;
}) {
  const inbound = await pool.query(
    `SELECT id, ocr_upi_ok, ocr_amount, ocr_transaction_id, payment_notice_sent, caption, file_path
       FROM whatsapp_inbound
      WHERE saas_account_id = $1
        AND registration_id = $2
        AND file_path IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    [params.saasAccountId, params.registrationId],
  );
  const row = inbound.rows[0] as
    | {
        id: number;
        ocr_upi_ok: boolean | null;
        ocr_amount: string | number | null;
        ocr_transaction_id: string | null;
        payment_notice_sent: boolean | null;
        caption: string | null;
        file_path: string | null;
      }
    | undefined;
  if (!row) return;

  const intent = await pool.query(
    `SELECT id, from_mobile, expected_amount, notes
       FROM pass_payment_intents
      WHERE saas_account_id = $1 AND registration_id = $2 AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1`,
    [params.saasAccountId, params.registrationId],
  );
  if (!intent.rows[0]) return;

  await processPassPaymentInbound({
    saasAccountId: params.saasAccountId,
    fromMobileLast10: String(intent.rows[0].from_mobile ?? '')
      .replace(/\D/g, '')
      .slice(-10),
    caption: String(row.caption ?? ''),
    relativeFilePath: row.file_path,
    inboundId: Number(row.id),
    registrationId: params.registrationId,
    lockToAccount: true,
  });
}

export async function getPassPaymentScreenshot(params: {
  saasAccountId: number;
  registrationId: number;
}): Promise<PassScreenshotStatus> {
  await completePendingScreenshotAutoRenews({
    saasAccountId: params.saasAccountId,
    registrationId: params.registrationId,
  });
  const inbound = await pool.query(
    `SELECT ocr_upi_ok, ocr_amount, ocr_transaction_id
       FROM whatsapp_inbound
      WHERE saas_account_id = $1
        AND registration_id = $2
        AND file_path IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    [params.saasAccountId, params.registrationId],
  );
  const inboundTxn = String(inbound.rows[0]?.ocr_transaction_id ?? '').trim();
  if (inboundTxn) {
    const paid = await pool.query(
      `SELECT amount, transaction_id
         FROM pass_payments
        WHERE saas_account_id = $1 AND registration_id = $2
          AND LOWER(TRIM(COALESCE(transaction_id, ''))) = LOWER(TRIM($3))
        LIMIT 1`,
      [params.saasAccountId, params.registrationId, inboundTxn],
    );
    if (paid.rows[0]) {
      const amount = Number(paid.rows[0].amount);
      return {
        upiOk: true,
        amountMatched: true,
        issued: true,
        transactionId: inboundTxn,
        detectedAmount: Number.isFinite(amount) ? amount : null,
        expectedAmount: Number.isFinite(amount) ? amount : null,
      };
    }
  }

  const verified = await pool.query(
    `SELECT transaction_id, detected_amount, expected_amount, notes
       FROM pass_payment_intents
      WHERE saas_account_id = $1 AND registration_id = $2 AND status = 'verified'
        AND (
          notes ILIKE '%Auto-renewed%'
          OR notes ILIKE '%Already issued%'
        )
        AND COALESCE(verified_at, created_at) > NOW() - INTERVAL '2 days'
      ORDER BY COALESCE(verified_at, created_at) DESC
      LIMIT 1`,
    [params.saasAccountId, params.registrationId],
  );
  if (verified.rows[0]) {
    return {
      ...screenshotStatusFromRow(verified.rows[0] as Record<string, unknown>),
      upiOk: true,
      amountMatched: true,
      issued: true,
    };
  }

  const { rows } = await pool.query(
    `SELECT transaction_id, detected_amount, expected_amount, notes
       FROM pass_payment_intents
      WHERE saas_account_id = $1 AND registration_id = $2 AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1`,
    [params.saasAccountId, params.registrationId],
  );
  if (rows[0]) {
    return screenshotStatusFromRow(rows[0] as Record<string, unknown>);
  }

  const w = inbound.rows[0];
  return {
    upiOk: w?.ocr_upi_ok === true,
    amountMatched: false,
    transactionId: inboundTxn,
    detectedAmount: w?.ocr_amount == null ? null : Number(w.ocr_amount),
    expectedAmount: null,
  };
}
