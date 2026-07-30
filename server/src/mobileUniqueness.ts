import { pool } from './db/pool.js';

export function last10Digits(mobile: string) {
  return String(mobile ?? '').replace(/\D/g, '').slice(-10);
}

export function normalizeEmail(email: string) {
  return String(email ?? '').trim().toLowerCase();
}

/**
 * Uniqueness is per role within one account only.
 * Same mobile/email may be user + swimmer + staff in the same account,
 * and may also be reused in another account.
 *
 * For swimmers: only adult (18+) contacts conflict. Under-18 may share
 * a parent's WhatsApp mobile and email with siblings (or the parent).
 */
export async function isMobileTakenInAccount(params: {
  accountId: number;
  mobile: string;
  kind: 'user' | 'swimmer' | 'staff';
  excludeId?: number;
}): Promise<boolean> {
  const last10 = last10Digits(params.mobile);
  if (last10.length !== 10) return false;

  const excludeId = params.excludeId ?? null;

  if (params.kind === 'user') {
    const { rows } = await pool.query(
      `SELECT id FROM app_users
       WHERE saas_account_id = $1
         AND RIGHT(regexp_replace(mobile, '\\D', '', 'g'), 10) = $2
         AND ($3::int IS NULL OR id <> $3)
       LIMIT 1`,
      [params.accountId, last10, excludeId],
    );
    return Boolean(rows[0]);
  }

  if (params.kind === 'swimmer') {
    const { rows } = await pool.query(
      `SELECT id FROM registrations
       WHERE saas_account_id = $1
         AND RIGHT(regexp_replace(whatsapp_mobile, '\\D', '', 'g'), 10) = $2
         AND COALESCE(is_adult, FALSE) = TRUE
         AND ($3::int IS NULL OR id <> $3)
       LIMIT 1`,
      [params.accountId, last10, excludeId],
    );
    return Boolean(rows[0]);
  }

  const { rows } = await pool.query(
    `SELECT id FROM staff_registrations
     WHERE saas_account_id = $1
       AND RIGHT(regexp_replace(whatsapp_mobile, '\\D', '', 'g'), 10) = $2
       AND ($3::int IS NULL OR id <> $3)
     LIMIT 1`,
    [params.accountId, last10, excludeId],
  );
  return Boolean(rows[0]);
}

export async function isEmailTakenInAccount(params: {
  accountId: number;
  email: string;
  kind: 'user' | 'swimmer' | 'staff';
  excludeId?: number;
}): Promise<boolean> {
  const email = normalizeEmail(params.email);
  if (!email) return false;

  const excludeId = params.excludeId ?? null;

  if (params.kind === 'user') {
    const { rows } = await pool.query(
      `SELECT id FROM app_users
       WHERE saas_account_id = $1
         AND LOWER(TRIM(email)) = $2
         AND TRIM(email) <> ''
         AND ($3::int IS NULL OR id <> $3)
       LIMIT 1`,
      [params.accountId, email, excludeId],
    );
    return Boolean(rows[0]);
  }

  if (params.kind === 'swimmer') {
    const { rows } = await pool.query(
      `SELECT id FROM registrations
       WHERE saas_account_id = $1
         AND LOWER(TRIM(email)) = $2
         AND COALESCE(is_adult, FALSE) = TRUE
         AND ($3::int IS NULL OR id <> $3)
       LIMIT 1`,
      [params.accountId, email, excludeId],
    );
    return Boolean(rows[0]);
  }

  const { rows } = await pool.query(
    `SELECT id FROM staff_registrations
     WHERE saas_account_id = $1
       AND LOWER(TRIM(email)) = $2
       AND ($3::int IS NULL OR id <> $3)
     LIMIT 1`,
    [params.accountId, email, excludeId],
  );
  return Boolean(rows[0]);
}

export function duplicateMobileMessage(kind: 'user' | 'swimmer' | 'staff') {
  if (kind === 'user') return 'This mobile number is already used by another user in this account';
  if (kind === 'swimmer') {
    return 'This WhatsApp mobile is already used by another adult swimmer in this account';
  }
  return 'This WhatsApp mobile is already used by another staff member in this account';
}

export function duplicateEmailMessage(kind: 'user' | 'swimmer' | 'staff') {
  if (kind === 'user') return 'This email is already used by another user in this account';
  if (kind === 'swimmer') {
    return 'This email is already used by another adult swimmer in this account';
  }
  return 'This email is already used by another staff member in this account';
}
