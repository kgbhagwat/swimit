import type { Pool } from 'pg';
import { INDIA_SQL_TODAY, indiaTodayIso } from './indiaDate.js';

export type DashboardNamedCount = { name: string; count: number };

export type DashboardSnapshot = {
  asOf: string;
  poolName: string;
  city: string;
  summary: {
    activeUsers: number;
    activeSwimmers: number;
    presentToday: number;
    expiringSoon: number;
    expiryNoticeDays: number;
    newAdmissionsToday: number;
    renewalsToday: number;
  };
  paymentsToday: {
    cash: number;
    online: number;
    total: number;
    count: number;
  };
  activeBy: {
    batch: DashboardNamedCount[];
    coach: DashboardNamedCount[];
    passType: DashboardNamedCount[];
  };
  newAdmissionsBy: {
    batch: DashboardNamedCount[];
    coach: DashboardNamedCount[];
    passType: DashboardNamedCount[];
  };
  waterQuality: Array<{
    recordDate: string;
    phLevel: number;
    freeChlorine: number;
    totalAlkalinity: number;
    calciumHardness: number;
  }>;
};

function toNamedCounts(rows: Array<{ name: string | null; count: string | number }>): DashboardNamedCount[] {
  return rows.map((row) => ({
    name: String(row.name ?? '').trim() || 'Unassigned',
    count: Number(row.count ?? 0),
  }));
}

async function runQueryBatches<F extends ReadonlyArray<() => Promise<unknown>>>(
  factories: [...F],
  batchSize = 4,
): Promise<{ [K in keyof F]: F[K] extends () => Promise<infer R> ? R : never }> {
  const size = Math.max(1, batchSize);
  const results: unknown[] = [];
  for (let i = 0; i < factories.length; i += size) {
    const batch = factories.slice(i, i + size);
    results.push(...(await Promise.all(batch.map((fn) => fn()))));
  }
  return results as { [K in keyof F]: F[K] extends () => Promise<infer R> ? R : never };
}

async function deactivateExpiredPasses(db: Pool, accountId: number) {
  try {
    await db.query(
      `UPDATE registrations
       SET is_active = FALSE,
           inactive_at = COALESCE(inactive_at, CURRENT_TIMESTAMP)
       WHERE saas_account_id = $1
         AND COALESCE(is_active, TRUE) = TRUE
         AND pass_valid_until IS NOT NULL
         AND pass_valid_until < ${INDIA_SQL_TODAY}`,
      [accountId],
    );
  } catch (err) {
    console.warn('[dashboard-snapshot] deactivateExpiredPasses failed', err);
  }
}

export function parseDashboardAsOfDate(raw: unknown): string {
  const value = String(raw ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return indiaTodayIso();
}

/** Heavy dashboard KPI snapshot. Call from the snapshot worker, not the request thread. */
export async function buildDashboardSnapshot(
  db: Pool,
  accountId: number,
  asOf: string,
): Promise<DashboardSnapshot> {
  await deactivateExpiredPasses(db, accountId);

  const notice = await db.query<{ days: number }>(
    `SELECT GREATEST(1, LEAST(9, COALESCE(pass_expiry_notice_days, 3))) AS days
     FROM pool_core_info
     WHERE saas_account_id = $1`,
    [accountId],
  );
  const noticeDays = Number(notice.rows[0]?.days ?? 3);

  const [
    swimmerStats,
    presentOnDate,
    paymentOnDate,
    activeUsers,
    activeByBatch,
    activeByCoach,
    activeByPassType,
    newByBatch,
    newByCoach,
    newByPassType,
    newOnDate,
    renewalsOnDate,
    poolInfo,
  ] = await runQueryBatches([
    () =>
      db.query<{
        active: string | number;
        expiring_soon: string | number;
      }>(
        `SELECT
           COUNT(*) FILTER (
             WHERE (
               ($2::date = ${INDIA_SQL_TODAY} AND COALESCE(is_active, TRUE) = TRUE)
               OR (
                 $2::date <> ${INDIA_SQL_TODAY}
                 AND created_at::date <= $2::date
                 AND pass_valid_until IS NOT NULL
                 AND pass_valid_until >= $2::date
                 AND (inactive_at IS NULL OR inactive_at::date > $2::date)
               )
             )
           )::int AS active,
           COUNT(*) FILTER (
             WHERE (
               ($2::date = ${INDIA_SQL_TODAY} AND COALESCE(is_active, TRUE) = TRUE)
               OR (
                 $2::date <> ${INDIA_SQL_TODAY}
                 AND created_at::date <= $2::date
                 AND pass_valid_until IS NOT NULL
                 AND pass_valid_until >= $2::date
                 AND (inactive_at IS NULL OR inactive_at::date > $2::date)
               )
             )
               AND pass_valid_until IS NOT NULL
               AND pass_valid_until >= $2::date
               AND pass_valid_until <= ($2::date + ($3::int * INTERVAL '1 day'))
           )::int AS expiring_soon
         FROM registrations
         WHERE saas_account_id = $1`,
        [accountId, asOf, noticeDays],
      ),
    () =>
      db.query<{ count: string | number }>(
        `SELECT COUNT(DISTINCT registration_id)::int AS count
         FROM swimmer_attendance
         WHERE saas_account_id = $1
           AND attendance_date = $2::date`,
        [accountId, asOf],
      ),
    () =>
      db.query<{
        cash: string | number;
        online: string | number;
        total: string | number;
        count: string | number;
      }>(
        `SELECT
           COALESCE(SUM(amount) FILTER (WHERE LOWER(COALESCE(payment_mode, '')) = 'cash'), 0)::float AS cash,
           COALESCE(SUM(amount) FILTER (WHERE LOWER(COALESCE(payment_mode, '')) = 'online'), 0)::float AS online,
           COALESCE(SUM(amount), 0)::float AS total,
           COUNT(*)::int AS count
         FROM pass_payments
         WHERE saas_account_id = $1
           AND payment_date = $2::date`,
        [accountId, asOf],
      ),
    () =>
      db.query<{ count: string | number }>(
        `SELECT COUNT(*)::int AS count
         FROM app_users
         WHERE saas_account_id = $1
           AND mobile IS NOT NULL
           AND TRIM(mobile) <> ''
           AND created_at::date <= $2::date`,
        [accountId, asOf],
      ),
    () =>
      db.query<{ name: string | null; count: string | number }>(
        `SELECT NULLIF(TRIM(batch), '') AS name, COUNT(*)::int AS count
         FROM registrations
         WHERE saas_account_id = $1
           AND (
             ($2::date = ${INDIA_SQL_TODAY} AND COALESCE(is_active, TRUE) = TRUE)
             OR (
               $2::date <> ${INDIA_SQL_TODAY}
               AND created_at::date <= $2::date
               AND pass_valid_until IS NOT NULL
               AND pass_valid_until >= $2::date
               AND (inactive_at IS NULL OR inactive_at::date > $2::date)
             )
           )
         GROUP BY 1
         ORDER BY count DESC, name ASC NULLS LAST`,
        [accountId, asOf],
      ),
    () =>
      db.query<{ name: string | null; count: string | number }>(
        `SELECT NULLIF(TRIM(coach), '') AS name, COUNT(*)::int AS count
         FROM registrations
         WHERE saas_account_id = $1
           AND (
             ($2::date = ${INDIA_SQL_TODAY} AND COALESCE(is_active, TRUE) = TRUE)
             OR (
               $2::date <> ${INDIA_SQL_TODAY}
               AND created_at::date <= $2::date
               AND pass_valid_until IS NOT NULL
               AND pass_valid_until >= $2::date
               AND (inactive_at IS NULL OR inactive_at::date > $2::date)
             )
           )
         GROUP BY 1
         ORDER BY count DESC, name ASC NULLS LAST`,
        [accountId, asOf],
      ),
    () =>
      db.query<{ name: string | null; count: string | number }>(
        `SELECT NULLIF(TRIM(pass_type), '') AS name, COUNT(*)::int AS count
         FROM registrations
         WHERE saas_account_id = $1
           AND (
             ($2::date = ${INDIA_SQL_TODAY} AND COALESCE(is_active, TRUE) = TRUE)
             OR (
               $2::date <> ${INDIA_SQL_TODAY}
               AND created_at::date <= $2::date
               AND pass_valid_until IS NOT NULL
               AND pass_valid_until >= $2::date
               AND (inactive_at IS NULL OR inactive_at::date > $2::date)
             )
           )
         GROUP BY 1
         ORDER BY count DESC, name ASC NULLS LAST`,
        [accountId, asOf],
      ),
    () =>
      db.query<{ name: string | null; count: string | number }>(
        `SELECT NULLIF(TRIM(batch), '') AS name, COUNT(*)::int AS count
         FROM registrations
         WHERE saas_account_id = $1
           AND created_at::date = $2::date
         GROUP BY 1
         ORDER BY count DESC, name ASC NULLS LAST`,
        [accountId, asOf],
      ),
    () =>
      db.query<{ name: string | null; count: string | number }>(
        `SELECT NULLIF(TRIM(coach), '') AS name, COUNT(*)::int AS count
         FROM registrations
         WHERE saas_account_id = $1
           AND created_at::date = $2::date
         GROUP BY 1
         ORDER BY count DESC, name ASC NULLS LAST`,
        [accountId, asOf],
      ),
    () =>
      db.query<{ name: string | null; count: string | number }>(
        `SELECT NULLIF(TRIM(pass_type), '') AS name, COUNT(*)::int AS count
         FROM registrations
         WHERE saas_account_id = $1
           AND created_at::date = $2::date
         GROUP BY 1
         ORDER BY count DESC, name ASC NULLS LAST`,
        [accountId, asOf],
      ),
    () =>
      db.query<{ count: string | number }>(
        `SELECT COUNT(*)::int AS count
         FROM registrations
         WHERE saas_account_id = $1
           AND created_at::date = $2::date`,
        [accountId, asOf],
      ),
    () =>
      db.query<{ count: string | number }>(
        `SELECT COUNT(DISTINCT p.registration_id)::int AS count
         FROM pass_payments p
         WHERE p.saas_account_id = $1
           AND p.payment_date = $2::date
           AND EXISTS (
             SELECT 1
             FROM pass_payments prev
             WHERE prev.saas_account_id = p.saas_account_id
               AND prev.registration_id = p.registration_id
               AND (
                 prev.payment_date < p.payment_date
                 OR (prev.payment_date = p.payment_date AND prev.id < p.id)
               )
           )`,
        [accountId, asOf],
      ),
    () =>
      db.query<{ pool_name: string | null; city: string | null }>(
        `SELECT pci.pool_name, a.city
         FROM saas_accounts a
         LEFT JOIN pool_core_info pci ON pci.saas_account_id = a.id
         WHERE a.id = $1`,
        [accountId],
      ),
  ]);

  let waterQuality: DashboardSnapshot['waterQuality'] = [];
  try {
    const wq = await db.query<{
      record_date: string | Date;
      ph_level: string | number;
      free_chlorine: string | number;
      total_alkalinity: string | number;
      calcium_hardness: string | number;
    }>(
      `SELECT record_date, ph_level, free_chlorine, total_alkalinity, calcium_hardness
       FROM water_quality
       WHERE saas_account_id = $1
         AND record_date <= $2::date
       ORDER BY record_date DESC, id DESC
       LIMIT 7`,
      [accountId, asOf],
    );
    waterQuality = wq.rows
      .map((row) => ({
        recordDate:
          typeof row.record_date === 'string'
            ? row.record_date.slice(0, 10)
            : row.record_date.toISOString().slice(0, 10),
        phLevel: Number(row.ph_level),
        freeChlorine: Number(row.free_chlorine),
        totalAlkalinity: Number(row.total_alkalinity),
        calciumHardness: Number(row.calcium_hardness),
      }))
      .reverse();
  } catch (wqErr) {
    console.warn('[dashboard-snapshot] water quality series unavailable', wqErr);
  }

  const active = Number(swimmerStats.rows[0]?.active ?? 0);
  const expiringSoon = Number(swimmerStats.rows[0]?.expiring_soon ?? 0);
  const cash = Number(paymentOnDate.rows[0]?.cash ?? 0);
  const online = Number(paymentOnDate.rows[0]?.online ?? 0);
  const total = Number(paymentOnDate.rows[0]?.total ?? 0);

  return {
    asOf,
    poolName: String(poolInfo.rows[0]?.pool_name ?? '').trim() || 'Swimming pool',
    city: String(poolInfo.rows[0]?.city ?? '').trim(),
    summary: {
      activeUsers: Number(activeUsers.rows[0]?.count ?? 0),
      activeSwimmers: active,
      presentToday: Number(presentOnDate.rows[0]?.count ?? 0),
      expiringSoon,
      expiryNoticeDays: noticeDays,
      newAdmissionsToday: Number(newOnDate.rows[0]?.count ?? 0),
      renewalsToday: Number(renewalsOnDate.rows[0]?.count ?? 0),
    },
    paymentsToday: {
      cash,
      online,
      total,
      count: Number(paymentOnDate.rows[0]?.count ?? 0),
    },
    activeBy: {
      batch: toNamedCounts(activeByBatch.rows),
      coach: toNamedCounts(activeByCoach.rows),
      passType: toNamedCounts(activeByPassType.rows),
    },
    newAdmissionsBy: {
      batch: toNamedCounts(newByBatch.rows),
      coach: toNamedCounts(newByCoach.rows),
      passType: toNamedCounts(newByPassType.rows),
    },
    waterQuality,
  };
}
