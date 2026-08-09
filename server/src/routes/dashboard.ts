import { Router } from 'express';
import { pool } from '../db/pool.js';
import { tenantId } from '../middleware/tenant.js';

type NamedCount = { name: string; count: number };

function toNamedCounts(rows: Array<{ name: string | null; count: string | number }>): NamedCount[] {
  return rows.map((row) => ({
    name: String(row.name ?? '').trim() || 'Unassigned',
    count: Number(row.count ?? 0),
  }));
}

function todayLocalIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseAsOfDate(raw: unknown): string {
  const value = String(raw ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return todayLocalIso();
}

async function deactivateExpiredPasses(accountId: number) {
  try {
    await pool.query(
      `UPDATE registrations
       SET is_active = FALSE,
           inactive_at = COALESCE(inactive_at, CURRENT_TIMESTAMP)
       WHERE saas_account_id = $1
         AND COALESCE(is_active, TRUE) = TRUE
         AND pass_valid_until IS NOT NULL
         AND pass_valid_until < CURRENT_DATE`,
      [accountId],
    );
  } catch (err) {
    console.warn('[dashboard] deactivateExpiredPasses failed', err);
  }
}

export const dashboardRouter = Router();

dashboardRouter.get('/', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const asOf = parseAsOfDate(req.query.date);
    await deactivateExpiredPasses(accountId);

    const notice = await pool.query<{ days: number }>(
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
      poolInfo,
    ] = await Promise.all([
      pool.query<{
        active: string | number;
        expiring_soon: string | number;
      }>(
        `SELECT
           COUNT(*) FILTER (
             WHERE (
               ($2::date = CURRENT_DATE AND COALESCE(is_active, TRUE) = TRUE)
               OR (
                 $2::date <> CURRENT_DATE
                 AND created_at::date <= $2::date
                 AND pass_valid_until IS NOT NULL
                 AND pass_valid_until >= $2::date
                 AND (inactive_at IS NULL OR inactive_at::date > $2::date)
               )
             )
           )::int AS active,
           COUNT(*) FILTER (
             WHERE (
               ($2::date = CURRENT_DATE AND COALESCE(is_active, TRUE) = TRUE)
               OR (
                 $2::date <> CURRENT_DATE
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
      pool.query<{ count: string | number }>(
        `SELECT COUNT(DISTINCT registration_id)::int AS count
         FROM swimmer_attendance
         WHERE saas_account_id = $1
           AND attendance_date = $2::date`,
        [accountId, asOf],
      ),
      pool.query<{
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
      pool.query<{ count: string | number }>(
        `SELECT COUNT(*)::int AS count
         FROM app_users
         WHERE saas_account_id = $1
           AND mobile IS NOT NULL
           AND TRIM(mobile) <> ''
           AND created_at::date <= $2::date`,
        [accountId, asOf],
      ),
      pool.query<{ name: string | null; count: string | number }>(
        `SELECT NULLIF(TRIM(batch), '') AS name, COUNT(*)::int AS count
         FROM registrations
         WHERE saas_account_id = $1
           AND (
             ($2::date = CURRENT_DATE AND COALESCE(is_active, TRUE) = TRUE)
             OR (
               $2::date <> CURRENT_DATE
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
      pool.query<{ name: string | null; count: string | number }>(
        `SELECT NULLIF(TRIM(coach), '') AS name, COUNT(*)::int AS count
         FROM registrations
         WHERE saas_account_id = $1
           AND (
             ($2::date = CURRENT_DATE AND COALESCE(is_active, TRUE) = TRUE)
             OR (
               $2::date <> CURRENT_DATE
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
      pool.query<{ name: string | null; count: string | number }>(
        `SELECT NULLIF(TRIM(pass_type), '') AS name, COUNT(*)::int AS count
         FROM registrations
         WHERE saas_account_id = $1
           AND (
             ($2::date = CURRENT_DATE AND COALESCE(is_active, TRUE) = TRUE)
             OR (
               $2::date <> CURRENT_DATE
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
      pool.query<{ name: string | null; count: string | number }>(
        `SELECT NULLIF(TRIM(batch), '') AS name, COUNT(*)::int AS count
         FROM registrations
         WHERE saas_account_id = $1
           AND created_at::date = $2::date
         GROUP BY 1
         ORDER BY count DESC, name ASC NULLS LAST`,
        [accountId, asOf],
      ),
      pool.query<{ name: string | null; count: string | number }>(
        `SELECT NULLIF(TRIM(coach), '') AS name, COUNT(*)::int AS count
         FROM registrations
         WHERE saas_account_id = $1
           AND created_at::date = $2::date
         GROUP BY 1
         ORDER BY count DESC, name ASC NULLS LAST`,
        [accountId, asOf],
      ),
      pool.query<{ name: string | null; count: string | number }>(
        `SELECT NULLIF(TRIM(pass_type), '') AS name, COUNT(*)::int AS count
         FROM registrations
         WHERE saas_account_id = $1
           AND created_at::date = $2::date
         GROUP BY 1
         ORDER BY count DESC, name ASC NULLS LAST`,
        [accountId, asOf],
      ),
      pool.query<{ count: string | number }>(
        `SELECT COUNT(*)::int AS count
         FROM registrations
         WHERE saas_account_id = $1
           AND created_at::date = $2::date`,
        [accountId, asOf],
      ),
      pool.query<{ pool_name: string | null; city: string | null }>(
        `SELECT pci.pool_name, a.city
         FROM saas_accounts a
         LEFT JOIN pool_core_info pci ON pci.saas_account_id = a.id
         WHERE a.id = $1`,
        [accountId],
      ),
    ]);

    let waterQuality: Array<{
      recordDate: string;
      phLevel: number;
      freeChlorine: number;
      totalAlkalinity: number;
      calciumHardness: number;
    }> = [];
    try {
      const wq = await pool.query<{
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
      console.warn('[dashboard] water quality series unavailable', wqErr);
    }

    const active = Number(swimmerStats.rows[0]?.active ?? 0);
    const expiringSoon = Number(swimmerStats.rows[0]?.expiring_soon ?? 0);
    const cash = Number(paymentOnDate.rows[0]?.cash ?? 0);
    const online = Number(paymentOnDate.rows[0]?.online ?? 0);
    const total = Number(paymentOnDate.rows[0]?.total ?? 0);

    res.json({
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
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});
