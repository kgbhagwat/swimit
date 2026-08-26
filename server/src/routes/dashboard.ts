import { Router } from 'express';
import { pool } from '../db/pool.js';
import { parsePaging } from '../db/paging.js';
import { getDashboardSnapshot } from '../dashboardSnapshotHost.js';
import { parseDashboardAsOfDate } from '../dashboardSnapshot.js';
import { tenantId } from '../middleware/tenant.js';
import { INDIA_SQL_TODAY } from '../indiaDate.js';

const ACTIVE_ON_DATE_SQL = `
(
  ($2::date = ${INDIA_SQL_TODAY} AND COALESCE(is_active, TRUE) = TRUE)
  OR (
    $2::date <> ${INDIA_SQL_TODAY}
    AND created_at::date <= $2::date
    AND pass_valid_until IS NOT NULL
    AND pass_valid_until >= $2::date
    AND (inactive_at IS NULL OR inactive_at::date > $2::date)
  )
)
`;

function dateOnly(value: unknown): string | null {
  if (value == null || value === '') return null;
  const text = String(value);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const date = value instanceof Date ? value : new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function mapSwimmerDetail(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    fullName: String(row.full_name ?? '').trim() || '—',
    mobile: String(row.whatsapp_mobile ?? '').trim(),
    batch: String(row.batch ?? '').trim() || '—',
    coach: String(row.coach ?? '').trim() || '—',
    passType: String(row.pass_type ?? '').trim() || '—',
    passValidUntil: dateOnly(row.pass_valid_until),
    createdAt: dateOnly(row.created_at),
  };
}

const SWIMMER_DETAIL_SELECT = `id, full_name, whatsapp_mobile, batch, coach, pass_type, pass_valid_until, created_at`;
const DASHBOARD_DETAIL_KINDS = ['active', 'present', 'expiring', 'users', 'admissions', 'renewals'] as const;
type DashboardDetailKind = (typeof DASHBOARD_DETAIL_KINDS)[number];

async function queryPaged(
  sql: string,
  params: unknown[],
  paging: ReturnType<typeof parsePaging>,
) {
  const body = sql.replace(/\s+LIMIT\s+\d+\s*$/i, '').trim();
  const { rows } = await pool.query(`${body} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [
    ...params,
    paging.pageSize,
    paging.offset,
  ]);
  return rows;
}

export const dashboardRouter = Router();

dashboardRouter.get('/', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const asOf = parseDashboardAsOfDate(req.query.date);
    const snapshot = await getDashboardSnapshot(accountId, asOf);
    res.json(snapshot);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

dashboardRouter.get('/details', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const asOf = parseDashboardAsOfDate(req.query.date);
    const kind = String(req.query.kind ?? '').trim() as DashboardDetailKind;
    const paging = parsePaging(req.query);
    if (!DASHBOARD_DETAIL_KINDS.includes(kind)) {
      res.status(400).json({ error: 'Invalid dashboard detail kind' });
      return;
    }

    if (kind === 'users') {
      const count = await pool.query<{ total: string | number }>(
        `SELECT COUNT(*)::int AS total
         FROM app_users
         WHERE saas_account_id = $1
           AND mobile IS NOT NULL
           AND TRIM(mobile) <> ''
           AND created_at::date <= $2::date`,
        [accountId, asOf],
      );
      const rows = await queryPaged(
        `SELECT id, user_name, mobile, email, is_account_admin, created_at
         FROM app_users
         WHERE saas_account_id = $1
           AND mobile IS NOT NULL
           AND TRIM(mobile) <> ''
           AND created_at::date <= $2::date
         ORDER BY LOWER(user_name) ASC, id ASC`,
        [accountId, asOf],
        paging,
      );
      res.json({
        kind,
        asOf,
        total: Number(count.rows[0]?.total ?? 0),
        page: paging.page,
        pageSize: paging.pageSize,
        rows: rows.map((row) => ({
          id: Number(row.id),
          userName: String(row.user_name ?? '').trim() || '—',
          mobile: String(row.mobile ?? '').trim(),
          email: String(row.email ?? '').trim(),
          isAccountAdmin: row.is_account_admin === true,
          createdAt: dateOnly(row.created_at),
        })),
      });
      return;
    }

    const notice = await pool.query<{ days: number }>(
      `SELECT GREATEST(1, LEAST(9, COALESCE(pass_expiry_notice_days, 3))) AS days
       FROM pool_core_info
       WHERE saas_account_id = $1`,
      [accountId],
    );
    const noticeDays = Number(notice.rows[0]?.days ?? 3);

    let listSql = '';
    let listParams: unknown[] = [accountId, asOf];
    if (kind === 'present') {
      listSql = `
         SELECT ${SWIMMER_DETAIL_SELECT}
         FROM registrations r
         WHERE r.saas_account_id = $1
           AND EXISTS (
             SELECT 1
             FROM swimmer_attendance a
             WHERE a.saas_account_id = r.saas_account_id
               AND a.registration_id = r.id
               AND a.attendance_date = $2::date
           )
         ORDER BY LOWER(r.full_name) ASC, r.id ASC`;
    } else if (kind === 'admissions') {
      listSql = `
         SELECT ${SWIMMER_DETAIL_SELECT}
         FROM registrations
         WHERE saas_account_id = $1
           AND created_at::date = $2::date
         ORDER BY LOWER(full_name) ASC, id ASC`;
    } else if (kind === 'renewals') {
      listSql = `
         SELECT ${SWIMMER_DETAIL_SELECT}
         FROM registrations r
         WHERE r.saas_account_id = $1
           AND EXISTS (
             SELECT 1
             FROM pass_payments p
             WHERE p.saas_account_id = r.saas_account_id
               AND p.registration_id = r.id
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
               )
           )
         ORDER BY LOWER(r.full_name) ASC, r.id ASC`;
    } else if (kind === 'expiring') {
      listSql = `
         SELECT ${SWIMMER_DETAIL_SELECT}
         FROM registrations
         WHERE saas_account_id = $1
           AND ${ACTIVE_ON_DATE_SQL}
           AND pass_valid_until IS NOT NULL
           AND pass_valid_until >= $2::date
           AND pass_valid_until <= ($2::date + ($3::int * INTERVAL '1 day'))
         ORDER BY pass_valid_until ASC, LOWER(full_name) ASC, id ASC`;
      listParams = [accountId, asOf, noticeDays];
    } else {
      listSql = `
         SELECT ${SWIMMER_DETAIL_SELECT}
         FROM registrations
         WHERE saas_account_id = $1
           AND ${ACTIVE_ON_DATE_SQL}
         ORDER BY LOWER(full_name) ASC, id ASC`;
    }

    const countSql = `SELECT COUNT(*)::int AS total FROM (${listSql.replace(/ORDER BY[\s\S]*$/i, '')}) q`;
    const count = await pool.query<{ total: string | number }>(countSql, listParams);
    const rows = await queryPaged(listSql, listParams, paging);

    res.json({
      kind,
      asOf,
      total: Number(count.rows[0]?.total ?? 0),
      page: paging.page,
      pageSize: paging.pageSize,
      rows: rows.map((row) => mapSwimmerDetail(row as Record<string, unknown>)),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load dashboard details' });
  }
});
