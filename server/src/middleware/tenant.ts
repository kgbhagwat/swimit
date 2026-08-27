import type { NextFunction, Request, Response } from 'express';
import { pool } from '../db/pool.js';
import { loadAuth, verifyPublicAccessToken } from '../authSessions.js';

declare module 'express-serve-static-core' {
  interface Request {
    saasAccountId?: number;
  }
}

/** Resolve tenant only from a server session or restricted public-form token. */
export async function requireTenant(req: Request, res: Response, next: NextFunction) {
  const path = String(req.originalUrl || req.url || '');
  let id = 0;
  try {
    const publicToken = verifyPublicAccessToken(String(req.header('x-public-access-token') ?? ''));
    const publicRoute =
      (req.method === 'GET' &&
        (path.startsWith('/api/pool-core-info') ||
          path.startsWith('/api/pool-website') ||
          path.startsWith('/api/form-info') ||
          path.startsWith('/api/batches'))) ||
      (req.method === 'POST' &&
        (path === '/api/registrations' ||
          path.startsWith('/api/registrations?') ||
          path === '/api/staff-registrations' ||
          path.startsWith('/api/staff-registrations?')));
    if (publicToken && publicRoute) {
      id = publicToken.accountId;
      req.publicTenantAccess = true;
    } else {
      const auth = await loadAuth(req);
      if (auth) id = auth.accountId;
    }
  } catch (err) {
    console.error('Failed to validate account session', err);
    res.status(500).json({ error: 'Failed to validate account session' });
    return;
  }
  if (!Number.isFinite(id) || id <= 0) {
    res.status(401).json({
      error: 'A valid account session is required.',
    });
    return;
  }

  try {
    const { rows } = await pool.query<{ id: number; status: string }>(
      `SELECT id, status FROM saas_accounts WHERE id = $1`,
      [id],
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    if (rows[0].status === 'Suspended' && req.auth?.kind !== 'impersonation') {
      res.status(403).json({ error: 'This account is suspended' });
      return;
    }
    req.saasAccountId = Number(rows[0].id);
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to resolve account' });
  }
}

export function tenantId(req: Request): number {
  const id = req.saasAccountId;
  if (!id) throw new Error('Missing saas account context');
  return id;
}
