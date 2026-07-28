import { pool } from '../db/pool.js';
import { getWhatsAppConfig } from './config.js';
import { sendWhatsAppImage, sendWhatsAppText } from './client.js';

async function logOutbound(params: {
  saasAccountId?: number | null;
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
        params.saasAccountId ?? null,
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

export async function notifyLoginCredentials(params: {
  mobile: string;
  accountName: string;
  accountCode: string;
  loginUrl: string;
  userName: string;
  temporaryPassword: string;
  saasAccountId?: number;
}) {
  const body = [
    `SwimIT login for ${params.accountName}`,
    '',
    `Account code: ${params.accountCode}`,
    `Login URL: ${params.loginUrl}`,
    `User name: ${params.userName}`,
    `Temporary password: ${params.temporaryPassword}`,
    '',
    'Please change the password after first login.',
  ].join('\n');

  try {
    const result = await sendWhatsAppText(params.mobile, body);
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: 'login_credentials',
      body,
      status: result.skipped ? 'skipped' : 'sent',
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed';
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: 'login_credentials',
      body,
      status: 'failed',
      error: message,
    });
    throw err;
  }
}

export async function notifyRegistrationConfirmation(params: {
  mobile: string;
  fullName: string;
  saasAccountId: number;
  poolName?: string;
}) {
  const atPool = params.poolName ? ` at ${params.poolName}` : '';
  const body = [
    `Hello ${params.fullName},`,
    '',
    `Your SwimIT registration${atPool} is confirmed.`,
    'Our desk will contact you for batch/pass activation if needed.',
  ].join('\n');

  try {
    const result = await sendWhatsAppText(params.mobile, body);
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: 'registration_confirmation',
      body,
      status: result.skipped ? 'skipped' : 'sent',
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed';
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: 'registration_confirmation',
      body,
      status: 'failed',
      error: message,
    });
    return { skipped: true as const, error: message };
  }
}

export async function notifyPassIssued(params: {
  mobile: string;
  fullName: string;
  passType: string;
  passValidUntil: string;
  registrationId: number;
  accountCode: string;
  saasAccountId: number;
}) {
  const cfg = getWhatsAppConfig();
  const passPath = `/${params.accountCode}/pass/${params.registrationId}`;
  const passUrl = cfg.publicAppUrl ? `${cfg.publicAppUrl}${passPath}` : passPath;
  const idPath = `/${params.accountCode}/id-card/${params.registrationId}`;
  const idUrl = cfg.publicAppUrl ? `${cfg.publicAppUrl}${idPath}` : idPath;

  const body = [
    `Hello ${params.fullName},`,
    '',
    'Your SwimIT pass is active.',
    `Pass type: ${params.passType}`,
    `Valid until: ${params.passValidUntil}`,
    '',
    `Digital pass: ${passUrl}`,
    `ID card: ${idUrl}`,
    '',
    'Show the QR at the gate for attendance.',
  ].join('\n');

  try {
    const result = await sendWhatsAppText(params.mobile, body);
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: 'pass_issued',
      body,
      status: result.skipped ? 'skipped' : 'sent',
    });

    // Public URL image for QR works when PUBLIC_APP_URL is reachable by Meta
    if (cfg.publicAppUrl && !result.skipped) {
      const qrApi = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(`SWIMIT:${params.registrationId}`)}`;
      try {
        await sendWhatsAppImage(params.mobile, qrApi, 'Your SwimIT pass QR');
      } catch (qrErr) {
        console.warn('[whatsapp] QR image send failed', qrErr);
      }
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed';
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: 'pass_issued',
      body,
      status: 'failed',
      error: message,
    });
    return { skipped: true as const, error: message };
  }
}

export async function notifyPassExpiring(params: {
  mobile: string;
  fullName: string;
  passType: string;
  passValidUntil: string;
  saasAccountId: number;
}) {
  const body = [
    `Hello ${params.fullName},`,
    '',
    'Your SwimIT pass is expiring soon.',
    `Pass type: ${params.passType || '—'}`,
    `Valid until: ${params.passValidUntil}`,
    '',
    'Please renew at the pool desk to continue entry.',
  ].join('\n');

  try {
    const result = await sendWhatsAppText(params.mobile, body);
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: 'pass_expiry',
      body,
      status: result.skipped ? 'skipped' : 'sent',
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed';
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: 'pass_expiry',
      body,
      status: 'failed',
      error: message,
    });
    return { skipped: true as const, error: message };
  }
}

export async function sendBroadcast(params: {
  mobiles: string[];
  message: string;
  saasAccountId: number;
}) {
  const results: { mobile: string; ok: boolean; error?: string }[] = [];
  for (const mobile of params.mobiles) {
    try {
      const result = await sendWhatsAppText(mobile, params.message);
      await logOutbound({
        saasAccountId: params.saasAccountId,
        toMobile: mobile,
        kind: 'broadcast',
        body: params.message,
        status: result.skipped ? 'skipped' : 'sent',
      });
      results.push({ mobile, ok: !result.skipped });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Send failed';
      await logOutbound({
        saasAccountId: params.saasAccountId,
        toMobile: mobile,
        kind: 'broadcast',
        body: params.message,
        status: 'failed',
        error,
      });
      results.push({ mobile, ok: false, error });
    }
  }
  return results;
}
