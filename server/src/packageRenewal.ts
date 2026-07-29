import { pool } from './db/pool.js';
import { pageKeysForModules } from './menuAccess.js';
import {
  addMonthsDateOnly,
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

/**
 * After an inbound image is saved, if this mobile has a pending package renewal,
 * OCR/caption-check amount + UPI and upgrade the account when they match.
 */
export async function processPackageRenewalInbound(params: {
  saasAccountId: number;
  fromMobileLast10: string;
  caption: string;
  relativeFilePath: string | null;
  inboundId: number;
}) {
  const pending = await pool.query(
    `SELECT r.*, p.package_name AS renew_package_name
     FROM saas_package_renewals r
     JOIN service_packages p ON p.id = r.renew_package_id
     WHERE r.saas_account_id = $1
       AND r.status = 'pending'
       AND RIGHT(regexp_replace(r.from_mobile, '\\D', '', 'g'), 10) = $2
     ORDER BY r.created_at DESC
     LIMIT 1`,
    [params.saasAccountId, params.fromMobileLast10],
  );
  if (!pending.rows[0]) return;

  const renewal = pending.rows[0] as Record<string, unknown>;
  const renewalId = Number(renewal.id);
  const expected = Number(renewal.expected_amount);
  const renewPackageName = String(renewal.renew_package_name ?? '');
  const months = Number(renewal.months);
  const renewFrom = String(renewal.renew_from).slice(0, 10);
  const renewPackageId = Number(renewal.renew_package_id);

  let textBlob = String(params.caption ?? '');
  if (params.relativeFilePath) {
    try {
      const abs = uploadAbsolutePath(params.relativeFilePath);
      const ocrText = await ocrImageForAmount(abs);
      if (ocrText) textBlob = `${textBlob}\n${ocrText}`;
    } catch (err) {
      console.warn('[renewal] OCR skipped', err);
    }
  }

  const paySettings = await pool.query(
    `SELECT upi_id FROM platform_payment_settings WHERE id = 1`,
  );
  const configuredUpi = String(paySettings.rows[0]?.upi_id ?? '').trim();
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
          : `Amount not found in screenshot/caption. Expected ₹${expected}`,
      );
    }
    if (!upiOk) {
      reasons.push(
        configuredUpi
          ? `UPI ID not found in screenshot. Expected payment to ${configuredUpi}`
          : 'UPI ID could not be verified',
      );
    }

    await pool.query(
      `UPDATE saas_package_renewals
       SET inbound_id = $1,
           detected_amount = $2,
           transaction_id = COALESCE(NULLIF($3, ''), transaction_id),
           notes = $4
       WHERE id = $5 AND status = 'pending'`,
      [params.inboundId, detected, transactionId, reasons.join(' | '), renewalId],
    );

    await replyText(
      params.saasAccountId,
      params.fromMobileLast10,
      [
        'We received your payment screenshot, but could not confirm it yet.',
        ...reasons,
        '',
        'Please pay the exact amount to the SwimIT UPI / QR and send the payment screenshot again.',
      ].join('\n'),
      'package_renewal_mismatch',
    );
    return;
  }

  const newExpires = addMonthsDateOnly(renewFrom, months);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE saas_package_renewals
       SET status = 'verified',
           inbound_id = $1,
           detected_amount = $2,
           transaction_id = $3,
           verified_at = NOW(),
           notes = 'Payment verified'
       WHERE id = $4 AND status = 'pending'
       RETURNING id`,
      [params.inboundId, detected ?? expected, transactionId, renewalId],
    );
    if ((updated.rowCount ?? 0) === 0) {
      await client.query('ROLLBACK');
      return;
    }

    await client.query(
      `UPDATE saas_accounts
       SET service_package_id = $1,
           status = 'Active',
           subscription_expires_at = $2::date
       WHERE id = $3`,
      [renewPackageId, newExpires, params.saasAccountId],
    );

    const pkg = await client.query<{ modules: string | null; package_name: string | null }>(
      `SELECT modules, package_name FROM service_packages WHERE id = $1`,
      [renewPackageId],
    );
    const packageMenuKeys = pageKeysForModules(
      pkg.rows[0]?.modules,
      pkg.rows[0]?.package_name,
    );
    await client.query(
      `UPDATE app_users
       SET menu_access = $1
       WHERE saas_account_id = $2 AND COALESCE(is_account_admin, FALSE) = TRUE`,
      [packageMenuKeys, params.saasAccountId],
    );

    await client.query(
      `UPDATE saas_package_renewals
       SET status = 'cancelled', notes = 'Superseded by verified renewal'
       WHERE saas_account_id = $1 AND status = 'pending' AND id <> $2`,
      [params.saasAccountId, renewalId],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await replyText(
    params.saasAccountId,
    params.fromMobileLast10,
    [
      'Payment confirmation: payment received. Thank you!',
      '',
      `Package: ${renewPackageName}`,
      `Duration: ${months} month${months === 1 ? '' : 's'}`,
      `Amount: ₹${expected.toLocaleString('en-IN')}`,
      transactionId ? `Transaction ID: ${transactionId}` : '',
      `Valid from: ${renewFrom}`,
      `Valid until: ${newExpires}`,
    ]
      .filter(Boolean)
      .join('\n'),
    'package_renewal_verified',
  );
}
