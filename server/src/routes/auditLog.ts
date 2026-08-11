import type { Request, Response } from 'express';
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { resolveActor } from '../auditLog.js';
import { pageKeysForPackage } from '../packageFeatures.js';
import { tenantId } from '../middleware/tenant.js';

export const auditLogRouter = Router();

async function accountAllowsActivityLog(accountId: number) {
  const { rows } = await pool.query<{
    modules: string | null;
    package_name: string | null;
    feature_keys: string[] | null;
  }>(
    `SELECT p.modules, p.package_name, p.feature_keys
     FROM saas_accounts a
     LEFT JOIN service_packages p ON p.id = a.service_package_id
     WHERE a.id = $1
     LIMIT 1`,
    [accountId],
  );
  const keys = pageKeysForPackage({
    modules: rows[0]?.modules,
    packageName: rows[0]?.package_name,
    featureKeys: rows[0]?.feature_keys,
  });
  return keys.includes('activity-log');
}

function mapRow(row: {
  id: number;
  actor_user_id: number | null;
  actor_user_name: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  summary: string;
  details: unknown;
  created_at: Date | string;
}) {
  return {
    id: row.id,
    actorUserId: row.actor_user_id == null ? null : Number(row.actor_user_id),
    actorUserName: String(row.actor_user_name ?? 'Unknown'),
    action: String(row.action),
    entityType: String(row.entity_type),
    entityId: row.entity_id == null ? null : String(row.entity_id),
    entityLabel: row.entity_label == null ? null : String(row.entity_label),
    summary: String(row.summary ?? ''),
    details: row.details ?? null,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  };
}

async function isPlatformAccount(accountId: number) {
  const { rows } = await pool.query<{ account_code: string | null }>(
    `SELECT account_code FROM saas_accounts WHERE id = $1`,
    [accountId],
  );
  return String(rows[0]?.account_code ?? '').toLowerCase() === 'swimit';
}

/** Users with activity-log in their package (admins or granted staff) can view the log. */
async function canViewAudit(req: Request) {
  await resolveActor(req);
  if (!req.actorUserId) return false;
  const accountId = tenantId(req);
  if (!(await accountAllowsActivityLog(accountId))) return false;
  const { rows } = await pool.query<{
    is_account_admin: boolean;
    menu_access: string[] | null;
  }>(
    `SELECT COALESCE(is_account_admin, false) AS is_account_admin, menu_access
     FROM app_users
     WHERE id = $1 AND saas_account_id = $2`,
    [req.actorUserId, accountId],
  );
  if (!rows[0]) return false;
  if (rows[0].is_account_admin) return true;
  const access = Array.isArray(rows[0].menu_access) ? rows[0].menu_access : [];
  return access.includes('activity-log');
}

/** Platform staff on swimit with Accounts access (or admin). */
async function canViewPlatformAudit(req: Request, platformAccountId: number) {
  await resolveActor(req);
  if (!req.actorUserId) return false;
  const { rows } = await pool.query<{
    is_account_admin: boolean;
    menu_access: string[] | null;
  }>(
    `SELECT COALESCE(is_account_admin, false) AS is_account_admin, menu_access
     FROM app_users
     WHERE id = $1 AND saas_account_id = $2`,
    [req.actorUserId, platformAccountId],
  );
  if (!rows[0]) return false;
  if (rows[0].is_account_admin) return true;
  const access = Array.isArray(rows[0].menu_access) ? rows[0].menu_access : [];
  return access.includes('accounts');
}

async function listAuditLogs(accountId: number, req: Request) {
  const from = String(req.query.from ?? '').trim().slice(0, 10);
  const to = String(req.query.to ?? '').trim().slice(0, 10);
  const action = String(req.query.action ?? '').trim().toLowerCase();
  const entityType = String(req.query.entityType ?? '').trim();
  const q = String(req.query.q ?? '').trim();
  const limitRaw = Number(req.query.limit ?? 200);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.trunc(limitRaw), 1), 500)
    : 200;

  const params: unknown[] = [accountId];
  const where: string[] = ['saas_account_id = $1'];

  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    params.push(from);
    where.push(`created_at >= $${params.length}::date`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    params.push(to);
    where.push(`created_at < ($${params.length}::date + INTERVAL '1 day')`);
  }
  if (
    ['create', 'update', 'delete', 'activate', 'deactivate', 'login', 'approve', 'deny'].includes(
      action,
    )
  ) {
    params.push(action);
    where.push(`action = $${params.length}`);
  }
  if (entityType) {
    params.push(entityType);
    where.push(`entity_type = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    where.push(
      `(actor_user_name ILIKE $${params.length}
        OR summary ILIKE $${params.length}
        OR COALESCE(entity_label, '') ILIKE $${params.length}
        OR COALESCE(entity_id, '') ILIKE $${params.length})`,
    );
  }

  params.push(limit);
  const { rows } = await pool.query(
    `SELECT id, actor_user_id, actor_user_name, action, entity_type, entity_id,
            entity_label, summary, details, created_at
     FROM account_audit_logs
     WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC, id DESC
     LIMIT $${params.length}`,
    params,
  );
  return rows.map(mapRow);
}

auditLogRouter.get('/', async (req, res) => {
  try {
    const accountId = tenantId(req);
    if (!(await canViewAudit(req))) {
      res.status(403).json({ error: 'Only account admins can view the activity log' });
      return;
    }
    res.json(await listAuditLogs(accountId, req));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load activity log' });
  }
});

/**
 * Platform staff: view a pool account's activity log.
 * Session tenant must be swimit (X-Saas-Account-Id); target is query targetAccountId.
 */
auditLogRouter.get('/platform', async (req: Request, res: Response) => {
  try {
    const platformAccountId = tenantId(req);
    if (!(await isPlatformAccount(platformAccountId))) {
      res.status(403).json({ error: 'Platform access required' });
      return;
    }
    if (!(await canViewPlatformAudit(req, platformAccountId))) {
      res.status(403).json({ error: 'Accounts access required to view activity logs' });
      return;
    }

    const targetAccountId = Number(
      req.query.targetAccountId ?? req.query.accountId ?? '',
    );
    if (!Number.isFinite(targetAccountId) || targetAccountId <= 0) {
      res.status(400).json({ error: 'targetAccountId is required' });
      return;
    }

    const target = await pool.query<{ id: number; account_code: string | null; account_name: string }>(
      `SELECT id, account_code, account_name FROM saas_accounts WHERE id = $1`,
      [targetAccountId],
    );
    if (!target.rows[0]) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const rows = await listAuditLogs(targetAccountId, req);
    res.json({
      account: {
        id: Number(target.rows[0].id),
        accountCode: String(target.rows[0].account_code ?? ''),
        accountName: String(target.rows[0].account_name ?? ''),
      },
      rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load activity log' });
  }
});
