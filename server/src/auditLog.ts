import type { Request } from 'express';
import { pool } from './db/pool.js';

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'activate'
  | 'deactivate'
  | 'login'
  | 'approve'
  | 'deny';

export type AuditInput = {
  action: AuditAction;
  entityType: string;
  entityId?: string | number | null;
  entityLabel?: string | null;
  summary: string;
  details?: unknown;
  /** Override tenant; used for platform (swimit) logs from unscoped routes. */
  saasAccountId?: number;
  /** Optional actor override (e.g. login before session headers exist). */
  actorUserId?: number | null;
  actorUserName?: string | null;
};

declare module 'express-serve-static-core' {
  interface Request {
    actorUserId?: number | null;
    actorUserName?: string | null;
  }
}

async function lookupPlatformAccountId() {
  const { rows } = await pool.query<{ id: number }>(
    `SELECT id FROM saas_accounts WHERE LOWER(account_code) = 'swimit' LIMIT 1`,
  );
  return rows[0] ? Number(rows[0].id) : null;
}

/** Resolve signed-in user from X-User-Id against the given account. */
export async function resolveActor(req: Request, accountId?: number) {
  const tenant = accountId ?? req.saasAccountId;
  if (!tenant) {
    req.actorUserId = null;
    req.actorUserName = null;
    return;
  }
  if (
    req.actorUserId !== undefined &&
    req.actorUserId !== null &&
    req.saasAccountId === tenant
  ) {
    return;
  }
  req.actorUserId = null;
  req.actorUserName = null;
  const raw = req.header('x-user-id');
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0) return;
  try {
    const { rows } = await pool.query<{ id: number; user_name: string }>(
      `SELECT id, user_name
       FROM app_users
       WHERE id = $1 AND saas_account_id = $2`,
      [id, tenant],
    );
    if (rows[0]) {
      req.actorUserId = Number(rows[0].id);
      req.actorUserName = String(rows[0].user_name ?? '');
    }
  } catch (err) {
    console.error('Failed to resolve audit actor', err);
  }
}

/** Persist an account activity row. Never throws to the caller. */
export async function recordAudit(req: Request, input: AuditInput) {
  try {
    const accountId = input.saasAccountId ?? req.saasAccountId;
    if (!accountId) return;
    if (input.actorUserId !== undefined || input.actorUserName !== undefined) {
      req.actorUserId = input.actorUserId ?? null;
      req.actorUserName = input.actorUserName?.trim() || 'Unknown';
    } else {
      await resolveActor(req, accountId);
    }
    const entityId =
      input.entityId === undefined || input.entityId === null || input.entityId === ''
        ? null
        : String(input.entityId);
    const detailsJson =
      input.details === undefined ? null : JSON.stringify(input.details ?? null);
    await pool.query(
      `INSERT INTO account_audit_logs
         (saas_account_id, actor_user_id, actor_user_name, action, entity_type,
          entity_id, entity_label, summary, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [
        accountId,
        req.actorUserId ?? null,
        req.actorUserName || 'Unknown',
        input.action,
        input.entityType,
        entityId,
        input.entityLabel?.trim() || null,
        input.summary.trim() || `${input.action} ${input.entityType}`,
        detailsJson,
      ],
    );
  } catch (err) {
    console.error('Failed to write audit log', err);
  }
}

/** Write to the SwimIT platform (swimit) activity log. */
export async function recordPlatformAudit(req: Request, input: Omit<AuditInput, 'saasAccountId'>) {
  const platformId = await lookupPlatformAccountId();
  if (!platformId) return;
  await recordAudit(req, { ...input, saasAccountId: platformId });
}
