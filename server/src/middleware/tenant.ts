import type { NextFunction, Request, Response } from 'express';
import { pool } from '../db/pool.js';

declare module 'express-serve-static-core' {
  interface Request {
    saasAccountId?: number;
  }
}

/** Resolve and validate X-Saas-Account-Id for tenant-scoped APIs. */
export async function requireTenant(req: Request, res: Response, next: NextFunction) {
  const raw = req.header('x-saas-account-id');
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({
      error: 'Account context required. Sign in via your account login URL (e.g. /srktnk).',
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
    if (rows[0].status === 'Suspended') {
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
