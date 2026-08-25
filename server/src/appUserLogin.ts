import { pool } from './db/pool.js';
import { last10Digits, normalizeEmail } from './mobileUniqueness.js';

const LOGIN_USER_SELECT = `id, user_name, mobile, email, password_hash, menu_access, must_change_password,
              is_account_admin, saas_account_id, created_at, login_type`;

function loginMatchers(loginRaw: string) {
  const loginId = String(loginRaw ?? '').trim();
  const email = loginId.includes('@') ? normalizeEmail(loginId) : '';
  const digits = last10Digits(loginId);
  const mobile = !email && digits.length === 10 ? digits : '';
  return { loginId, email, mobile };
}

/** Match an account user by user name, registered email, or 10-digit mobile. */
export async function findAppUserByLogin(accountId: number, loginRaw: string) {
  const { loginId, email, mobile } = loginMatchers(loginRaw);
  if (!loginId) return null;

  const { rows } = await pool.query(
    `SELECT ${LOGIN_USER_SELECT}
     FROM app_users
     WHERE saas_account_id = $1
       AND (
         LOWER(TRIM(user_name)) = LOWER($2)
         OR ($3 <> '' AND LOWER(TRIM(email)) = $3)
         OR ($4 <> '' AND RIGHT(regexp_replace(mobile, '\\D', '', 'g'), 10) = $4)
       )
     ORDER BY
       CASE
         WHEN LOWER(TRIM(user_name)) = LOWER($2) THEN 0
         WHEN $3 <> '' AND LOWER(TRIM(email)) = $3 THEN 1
         ELSE 2
       END,
       id ASC
     LIMIT 1`,
    [accountId, loginId, email, mobile],
  );
  return rows[0] ?? null;
}
