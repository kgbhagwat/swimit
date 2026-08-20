import type { Request } from 'express';
import { Router } from 'express';
import { resolveActor } from '../auditLog.js';
import { pool } from '../db/pool.js';
import {
  decideRemoteLoginRequest,
  getRemoteLoginStatus,
} from '../remoteLogin.js';

export const remoteLoginRouter = Router();

remoteLoginRouter.get('/status', async (req, res) => {
  try {
    const requestId = Number(req.query.requestId);
    const statusToken = String(req.query.statusToken ?? '').trim();
    if (!Number.isFinite(requestId) || requestId <= 0 || !statusToken) {
      res.status(400).json({ error: 'requestId and statusToken are required' });
      return;
    }
    const status = await getRemoteLoginStatus(requestId, statusToken);
    if (!status) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    res.json(status);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load remote login status' });
  }
});

/** Public approve/deny via emailed/WhatsApp token link. */
remoteLoginRouter.post('/decide', async (req, res) => {
  try {
    const body = req.body as { token?: string; decision?: string };
    const token = String(body.token ?? '').trim();
    const decision = String(body.decision ?? '').trim().toLowerCase();
    if (!token || (decision !== 'approve' && decision !== 'deny')) {
      res.status(400).json({ error: 'token and decision (approve|deny) are required' });
      return;
    }
    const result = await decideRemoteLoginRequest({
      req,
      approvalToken: token,
      decision: decision as 'approve' | 'deny',
      decidedByUserName: 'Admin (link)',
    });
    if (!result.ok) {
      res.status(result.statusCode).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to decide remote login request' });
  }
});

async function canDecideAsAdmin(req: Request, targetAccountId: number) {
  const rawUserId = Number(req.auth?.actorUserId);
  if (!Number.isFinite(rawUserId) || rawUserId <= 0) return false;

  const { rows } = await pool.query<{
    id: number;
    is_account_admin: boolean;
    saas_account_id: number;
    account_code: string | null;
  }>(
    `SELECT u.id, COALESCE(u.is_account_admin, FALSE) AS is_account_admin,
            u.saas_account_id, a.account_code
     FROM app_users u
     JOIN saas_accounts a ON a.id = u.saas_account_id
     WHERE u.id = $1
     LIMIT 1`,
    [rawUserId],
  );
  if (!rows[0]?.is_account_admin) return false;
  const actorAccountId = Number(rows[0].saas_account_id);
  if (actorAccountId === targetAccountId) return true;
  return String(rows[0].account_code ?? '').toLowerCase() === 'swimit';
}

remoteLoginRouter.post('/requests/:id/decide', async (req, res) => {
  try {
    const requestId = Number(req.params.id);
    const decision = String((req.body as { decision?: string }).decision ?? '')
      .trim()
      .toLowerCase();
    if (!Number.isFinite(requestId) || requestId <= 0) {
      res.status(400).json({ error: 'Invalid request id' });
      return;
    }
    if (decision !== 'approve' && decision !== 'deny') {
      res.status(400).json({ error: 'decision must be approve or deny' });
      return;
    }

    const { rows } = await pool.query<{ saas_account_id: number }>(
      `SELECT saas_account_id FROM remote_login_requests WHERE id = $1`,
      [requestId],
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'Remote login request not found' });
      return;
    }
    const accountId = Number(rows[0].saas_account_id);
    const allowed = await canDecideAsAdmin(req, accountId);
    if (!allowed) {
      res.status(403).json({ error: 'Only an account or platform admin can decide' });
      return;
    }

    await resolveActor(req, accountId);
    const result = await decideRemoteLoginRequest({
      req,
      requestId,
      decision: decision as 'approve' | 'deny',
      decidedByUserId: req.actorUserId ?? null,
      decidedByUserName: req.actorUserName ?? 'Admin',
    });
    if (!result.ok) {
      res.status(result.statusCode).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to decide remote login request' });
  }
});
