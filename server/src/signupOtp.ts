import { createHash, randomInt } from 'crypto';
import { pool } from './db/pool.js';
import { isEmailDeliveryConfigured, sendOtpEmail } from './email.js';
import { isValidMobile, sanitizeMobile } from './mobileValidation.js';
import { getWhatsAppConfig } from './whatsapp/config.js';
import { notifySignupOtp } from './whatsapp/notify.js';

export type SignupOtpChannel = 'email' | 'mobile';

const OTP_TTL_MS = 10 * 60 * 1000;
const VERIFY_WINDOW_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function hashOtp(code: string) {
  return createHash('sha256').update(`swimIT.signup.otp:${code}`).digest('hex');
}

function generateOtpCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function exposeDevCode() {
  return (
    process.env.NODE_ENV !== 'production' ||
    String(process.env.OTP_DEV_RETURN_CODE ?? '').trim() === '1'
  );
}

function normalizeEmail(value: string) {
  return String(value ?? '').trim().toLowerCase();
}

function isValidEmailAddress(value: string) {
  const email = normalizeEmail(value);
  return email.includes('@') && email.includes('.') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizeSignupDestination(channel: SignupOtpChannel, value: string) {
  if (channel === 'email') {
    const email = normalizeEmail(value);
    if (!isValidEmailAddress(email)) return { error: 'Enter a valid email address' as const };
    return { destination: email };
  }
  const mobile = sanitizeMobile(value);
  if (!isValidMobile(mobile)) return { error: 'Enter a valid 10-digit mobile number' as const };
  return { destination: mobile };
}

export async function sendSignupOtp(params: {
  channel: SignupOtpChannel;
  destination: string;
}) {
  const code = generateOtpCode();
  const codeHash = hashOtp(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await pool.query(
    `DELETE FROM signup_otps
     WHERE channel = $1 AND destination = $2 AND verified_at IS NULL`,
    [params.channel, params.destination],
  );

  await pool.query(
    `INSERT INTO signup_otps (channel, destination, code_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [params.channel, params.destination, codeHash, expiresAt.toISOString()],
  );

  if (params.channel === 'email') {
    if (!isEmailDeliveryConfigured()) {
      return {
        ok: true as const,
        skipped: true as const,
        message: 'Email delivery is not configured. Use the code shown for testing.',
        ...(exposeDevCode() ? { devCode: code } : {}),
      };
    }
    const sent = await sendOtpEmail({ to: params.destination, code });
    if (!sent.ok) return { ok: false as const, error: sent.error };
    if (sent.skipped) {
      return {
        ok: true as const,
        skipped: true as const,
        message: 'Email delivery skipped. Use the code shown for testing.',
        ...(exposeDevCode() ? { devCode: code } : {}),
      };
    }
    return {
      ok: true as const,
      skipped: false as const,
      message: 'OTP sent to your email.',
      ...(exposeDevCode() ? { devCode: code } : {}),
    };
  }

  const wa = getWhatsAppConfig();
  if (!wa.enabled) {
    return {
      ok: true as const,
      skipped: true as const,
      message: 'WhatsApp is not configured. Use the code shown for testing.',
      ...(exposeDevCode() ? { devCode: code } : {}),
    };
  }

  const sent = await notifySignupOtp({ mobile: params.destination, code });
  if (!sent.ok) return { ok: false as const, error: sent.error };
  if (sent.skipped) {
    return {
      ok: true as const,
      skipped: true as const,
      message: 'WhatsApp delivery skipped. Use the code shown for testing.',
      ...(exposeDevCode() ? { devCode: code } : {}),
    };
  }
  return {
    ok: true as const,
    skipped: false as const,
    message: 'OTP sent to your WhatsApp.',
    ...(exposeDevCode() ? { devCode: code } : {}),
  };
}

export async function verifySignupOtp(params: {
  channel: SignupOtpChannel;
  destination: string;
  code: string;
}) {
  const code = String(params.code ?? '').trim();
  if (!/^\d{6}$/.test(code)) {
    return { ok: false as const, error: 'Enter the 6-digit OTP' };
  }

  const { rows } = await pool.query(
    `SELECT id, code_hash, expires_at, verified_at, attempts
     FROM signup_otps
     WHERE channel = $1 AND destination = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [params.channel, params.destination],
  );
  const row = rows[0] as
    | {
        id: number;
        code_hash: string;
        expires_at: string | Date;
        verified_at: string | Date | null;
        attempts: number;
      }
    | undefined;

  if (!row) return { ok: false as const, error: 'Request an OTP first' };
  if (row.verified_at) return { ok: true as const, alreadyVerified: true as const };
  if (Number(row.attempts) >= MAX_ATTEMPTS) {
    return { ok: false as const, error: 'Too many incorrect attempts. Request a new OTP.' };
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false as const, error: 'OTP expired. Request a new one.' };
  }

  if (row.code_hash !== hashOtp(code)) {
    await pool.query(`UPDATE signup_otps SET attempts = attempts + 1 WHERE id = $1`, [row.id]);
    return { ok: false as const, error: 'Incorrect OTP' };
  }

  await pool.query(`UPDATE signup_otps SET verified_at = NOW() WHERE id = $1`, [row.id]);
  return { ok: true as const, alreadyVerified: false as const };
}

export async function assertSignupContactsVerified(email: string, mobile: string) {
  const emailNorm = normalizeEmail(email);
  const mobileNorm = sanitizeMobile(mobile);
  const since = new Date(Date.now() - VERIFY_WINDOW_MS).toISOString();

  const emailOk = await pool.query(
    `SELECT 1 FROM signup_otps
     WHERE channel = 'email' AND destination = $1 AND verified_at IS NOT NULL AND verified_at >= $2
     LIMIT 1`,
    [emailNorm, since],
  );
  if ((emailOk.rowCount ?? 0) === 0) {
    return { ok: false as const, error: 'Please verify your email with the OTP sent to your inbox' };
  }

  const mobileOk = await pool.query(
    `SELECT 1 FROM signup_otps
     WHERE channel = 'mobile' AND destination = $1 AND verified_at IS NOT NULL AND verified_at >= $2
     LIMIT 1`,
    [mobileNorm, since],
  );
  if ((mobileOk.rowCount ?? 0) === 0) {
    return {
      ok: false as const,
      error: 'Please verify your mobile with the OTP sent on WhatsApp',
    };
  }

  return { ok: true as const };
}
