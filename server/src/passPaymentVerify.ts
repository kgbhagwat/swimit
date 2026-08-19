import { pool } from './db/pool.js';
import {
  amountsMatch,
  extractPaymentAmounts,
  extractTransactionId,
  ocrImageForAmount,
  upiIdPresentInText,
  uploadAbsolutePath,
} from './paymentAmount.js';
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

export type PassScreenshotStatus = {
  upiOk: boolean;
  amountMatched: boolean;
  transactionId: string;
  detectedAmount: number | null;
  expectedAmount: number | null;
};

function screenshotStatusFromRow(row: Record<string, unknown> | undefined): PassScreenshotStatus {
  const expected = row?.expected_amount == null ? null : Number(row.expected_amount);
  const detected = row?.detected_amount == null ? null : Number(row.detected_amount);
  const notes = String(row?.notes ?? '');
  const matched = notes.includes('Screenshot matched');
  const upiFailed = notes.includes('UPI ID not found');
  const amountFailed = notes.includes('Amount not');
  return {
    upiOk: matched || (Boolean(notes) && !upiFailed),
    amountMatched: matched && !amountFailed,
    transactionId: String(row?.transaction_id ?? '').trim(),
    detectedAmount: Number.isFinite(detected as number) ? detected : null,
    expectedAmount: Number.isFinite(expected as number) ? expected : null,
  };
}

/**
 * Verify pass payment screenshot: UPI first, then amount.
 * On match, save the transaction ID and send a payment-received WhatsApp.
 * Does not issue the pass — staff confirms it on Pass Payment.
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
  const transactionId = extractTransactionId(textBlob) ?? '';
  const detected = found[0] ?? null;

  await pool.query(
    `UPDATE whatsapp_inbound
        SET ocr_upi_ok = $1,
            ocr_amount = $2,
            ocr_transaction_id = $3
      WHERE id = $4`,
    [upiOk, detected, transactionId, params.inboundId],
  );

  if (!pending.rows[0]) {
    return Boolean(params.registrationId);
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
    return true;
  }
  if (Number(intent.inbound_id) === params.inboundId && String(intent.notes ?? '').trim()) {
    return true;
  }

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
    await replyText(
      params.saasAccountId,
      params.fromMobileLast10,
      [
        'We received your payment screenshot, but the UPI ID did not match.',
        configuredUpi ? `Please pay to *${configuredUpi}* and send the screenshot again.` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      'pass_payment_mismatch',
    );
    return true;
  }

  const amountOk = amountsMatch(expected, found);
  if (!amountOk) {
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
    await replyText(
      params.saasAccountId,
      params.fromMobileLast10,
      [
        'We received your payment screenshot. The UPI ID matched, but the amount did not.',
        `Please pay *₹${expected.toLocaleString('en-IN')}* and send the screenshot again.`,
      ].join('\n'),
      'pass_payment_mismatch',
    );
    return true;
  }

  const matchedAmount = found.find((a) => Math.abs(a - expected) <= 1) ?? expected;
  await pool.query(
    `UPDATE pass_payment_intents
        SET inbound_id = $1,
            detected_amount = $2,
            transaction_id = COALESCE(NULLIF($3, ''), transaction_id),
            notes = 'Screenshot matched'
      WHERE id = $4 AND status = 'pending'`,
    [params.inboundId, matchedAmount, transactionId, intentId],
  );

  if (!alreadyMatched) {
    await replyText(
      params.saasAccountId,
      params.fromMobileLast10,
      [
        'Payment received. Thank you!',
        '',
        `Amount: ₹${expected.toLocaleString('en-IN')}`,
        transactionId ? `Transaction ID: ${transactionId}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
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
  });
}

export async function getPassPaymentScreenshot(params: {
  saasAccountId: number;
  registrationId: number;
}): Promise<PassScreenshotStatus> {
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

  const inbound = await pool.query(
    `SELECT ocr_upi_ok, ocr_amount, ocr_transaction_id
       FROM whatsapp_inbound
      WHERE saas_account_id = $1 AND registration_id = $2 AND file_path IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    [params.saasAccountId, params.registrationId],
  );
  const w = inbound.rows[0];
  return {
    upiOk: w?.ocr_upi_ok === true,
    amountMatched: false,
    transactionId: String(w?.ocr_transaction_id ?? '').trim(),
    detectedAmount: w?.ocr_amount == null ? null : Number(w.ocr_amount),
    expectedAmount: null,
  };
}
