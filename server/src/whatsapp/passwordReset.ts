import { pool } from '../db/pool.js';
import { generateTempPassword, hashPassword } from '../password.js';
import { sendWhatsAppText } from './client.js';
import { getWhatsAppConfig } from './config.js';
import { notifyLoginCredentials } from './notify.js';

const SESSION_MINUTES = 15;
const RESET_COOLDOWN = '10 minutes';

const ASK_EMAIL =
  'Please send the email ID registered on your SwimIT login.';
const NO_LOGIN =
  'No SwimIT login was found for this WhatsApp number.';
const INVALID_EMAIL = 'Please send a valid email address.';
const EMAIL_MISMATCH =
  'That email does not match a SwimIT login for this WhatsApp number. Please send the registered email ID.';
const TOO_SOON =
  'A new password was already sent recently. Please wait a few minutes and try again.';

function isPasswordKeyword(text: string) {
  return /^(password|passwd|पासवर्ड)[\s!.]*$/i.test(String(text ?? '').trim());
}

function extractEmail(text: string) {
  const match = String(text ?? '')
    .trim()
    .toLowerCase()
    .match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match ? match[0] : null;
}

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

async function reply(mobile: string, body: string, kind: string, saasAccountId?: number | null) {
  try {
    const result = await sendWhatsAppText(mobile, body);
    await logOutbound({
      saasAccountId,
      toMobile: mobile,
      kind,
      body,
      status: result.skipped ? 'skipped' : 'sent',
    });
    return !result.skipped;
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
    return false;
  }
}

async function loadSession(fromMobileLast10: string) {
  const { rows } = await pool.query<{ from_mobile: string }>(
    `SELECT from_mobile
       FROM whatsapp_password_resets
      WHERE from_mobile = $1 AND expires_at > NOW()
      LIMIT 1`,
    [fromMobileLast10],
  );
  return Boolean(rows[0]);
}

async function startSession(fromMobileLast10: string) {
  await pool.query(
    `INSERT INTO whatsapp_password_resets (from_mobile, expires_at)
     VALUES ($1, NOW() + ($2::int || ' minutes')::interval)
     ON CONFLICT (from_mobile)
     DO UPDATE SET created_at = NOW(),
                   expires_at = NOW() + ($2::int || ' minutes')::interval`,
    [fromMobileLast10, SESSION_MINUTES],
  );
}

async function clearSession(fromMobileLast10: string) {
  await pool.query(`DELETE FROM whatsapp_password_resets WHERE from_mobile = $1`, [
    fromMobileLast10,
  ]);
}

async function findLoginByMobile(fromMobileLast10: string) {
  const { rows } = await pool.query<{ id: number; saas_account_id: number }>(
    `SELECT u.id, u.saas_account_id
       FROM app_users u
       JOIN saas_accounts a ON a.id = u.saas_account_id
      WHERE RIGHT(regexp_replace(COALESCE(u.mobile, ''), '\\D', '', 'g'), 10) = $1
        AND a.status IS DISTINCT FROM 'Suspended'
      ORDER BY u.id ASC
      LIMIT 1`,
    [fromMobileLast10],
  );
  return rows[0] ?? null;
}

/**
 * WhatsApp login reset: "password" → ask email → match mobile+email → new temp password.
 * Returns true when this message was consumed (do not run Hi/pass handlers).
 */
export async function replyIfWhatsAppPasswordReset(params: {
  fromMobileLast10: string;
  text: string;
}): Promise<boolean> {
  const text = String(params.text ?? '').trim();
  const mobile = params.fromMobileLast10;
  if (!mobile || mobile.length < 10) return false;

  if (isPasswordKeyword(text)) {
    const login = await findLoginByMobile(mobile);
    if (!login) {
      await reply(mobile, NO_LOGIN, 'password_reset_none');
      return true;
    }
    await startSession(mobile);
    await reply(mobile, ASK_EMAIL, 'password_reset_ask_email', login.saas_account_id);
    return true;
  }

  const awaiting = await loadSession(mobile);
  if (!awaiting) return false;

  const email = extractEmail(text);
  if (!email) {
    await reply(mobile, INVALID_EMAIL, 'password_reset_invalid_email');
    return true;
  }

  const recent = await pool.query(
    `SELECT 1
       FROM whatsapp_outbound
      WHERE RIGHT(regexp_replace(to_mobile, '\\D', '', 'g'), 10) = $1
        AND kind = 'password_reset_credentials'
        AND status = 'sent'
        AND created_at > NOW() - $2::interval
      LIMIT 1`,
    [mobile, RESET_COOLDOWN],
  );
  if (recent.rows[0]) {
    await clearSession(mobile);
    await reply(mobile, TOO_SOON, 'password_reset_cooldown');
    return true;
  }

  const { rows } = await pool.query<{
    id: number;
    user_name: string;
    mobile: string | null;
    email: string | null;
    saas_account_id: number;
    account_name: string;
    account_code: string;
  }>(
    `SELECT u.id, u.user_name, u.mobile, u.email, u.saas_account_id,
            a.account_name, a.account_code
       FROM app_users u
       JOIN saas_accounts a ON a.id = u.saas_account_id
      WHERE RIGHT(regexp_replace(COALESCE(u.mobile, ''), '\\D', '', 'g'), 10) = $1
        AND LOWER(TRIM(u.email)) = $2
        AND a.status IS DISTINCT FROM 'Suspended'
      ORDER BY u.id ASC
      LIMIT 1`,
    [mobile, email],
  );
  const user = rows[0];
  if (!user) {
    await reply(mobile, EMAIL_MISMATCH, 'password_reset_mismatch');
    return true;
  }

  const temporaryPassword = generateTempPassword(8);
  const passwordHash = await hashPassword(temporaryPassword);
  await pool.query(
    `UPDATE app_users
        SET password_hash = $1, must_change_password = TRUE
      WHERE id = $2 AND saas_account_id = $3`,
    [passwordHash, Number(user.id), Number(user.saas_account_id)],
  );
  await pool.query(
    `UPDATE auth_sessions SET revoked_at = NOW()
      WHERE user_id = $1 AND revoked_at IS NULL`,
    [Number(user.id)],
  );

  const origin = String(getWhatsAppConfig().publicAppUrl || process.env.CORS_ORIGIN || '').replace(
    /\/$/,
    '',
  );
  const accountCode = String(user.account_code ?? '').trim();
  const loginUrl = origin && accountCode ? `${origin}/${accountCode}` : accountCode || origin;

  const sent = await notifyLoginCredentials({
    mobile: String(user.mobile ?? mobile).trim() || mobile,
    accountName: String(user.account_name ?? 'SwimIT'),
    accountCode,
    loginUrl,
    userName: String(user.user_name ?? ''),
    temporaryPassword,
    saasAccountId: Number(user.saas_account_id),
  });

  await logOutbound({
    saasAccountId: Number(user.saas_account_id),
    toMobile: mobile,
    kind: 'password_reset_credentials',
    body: sent.ok && !('skipped' in sent && sent.skipped) ? 'sent' : sent.ok ? 'skipped' : sent.error,
    status: sent.ok && !('skipped' in sent && sent.skipped) ? 'sent' : sent.ok ? 'skipped' : 'failed',
    error: sent.ok ? undefined : sent.error,
  });

  await clearSession(mobile);
  if (sent.ok && !('skipped' in sent && sent.skipped)) return true;

  await reply(
    mobile,
    [
      `Your SwimIT password was reset.`,
      `Code: ${accountCode}`,
      `User: ${String(user.user_name ?? '')}`,
      `Temporary password: ${temporaryPassword}`,
      'Please update it after first sign-in.',
    ].join('\n'),
    'password_reset_credentials_text',
    Number(user.saas_account_id),
  );
  return true;
}
