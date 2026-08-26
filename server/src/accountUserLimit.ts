import type { PoolClient } from 'pg';
import { pool } from './db/pool.js';

/** Hard ceiling for logins on one pool account (admin, coach, and staff). */
export const MAX_USERS_PER_ACCOUNT = 10;

type Db = Pick<PoolClient, 'query'>;

export async function accountUserCapacity(accountId: number, db: Db = pool) {
  const countRes = await db.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM app_users WHERE saas_account_id = $1`,
    [accountId],
  );
  const pkg = await db.query<{ max_users: number | null }>(
    `SELECT p.max_users
       FROM saas_accounts a
       LEFT JOIN service_packages p ON p.id = a.service_package_id
      WHERE a.id = $1
      LIMIT 1`,
    [accountId],
  );
  const packageMaxRaw = Number(pkg.rows[0]?.max_users);
  const packageMax =
    Number.isFinite(packageMaxRaw) && packageMaxRaw >= 1
      ? packageMaxRaw
      : MAX_USERS_PER_ACCOUNT;
  return {
    count: Number(countRes.rows[0]?.n ?? 0),
    max: Math.min(packageMax, MAX_USERS_PER_ACCOUNT),
  };
}

export function accountUserLimitMessage(max: number) {
  return `This account already has the maximum of ${max} users (including admin and coach).`;
}
