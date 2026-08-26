import type { NextFunction, Request, Response } from 'express';
import { editAccessKey } from './menuAccess.js';

export function hasPageAccess(req: Request, ...pageKeys: string[]): boolean {
  if (req.auth?.isAccountAdmin) return true;
  const access = req.auth?.menuAccess ?? [];
  return pageKeys.some((key) => access.includes(key));
}

export function hasEditAccess(req: Request, pageKey: 'swimmers' | 'coaches'): boolean {
  if (req.auth?.isAccountAdmin) return true;
  const access = req.auth?.menuAccess ?? [];
  return access.includes(pageKey) && access.includes(editAccessKey(pageKey));
}

function deny(res: Response, status: number, error: string) {
  res.status(status).json({ error });
}

export function requirePages(...pageKeys: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.publicTenantAccess || !req.auth) {
      deny(res, 401, 'A signed-in session is required.');
      return;
    }
    if (hasPageAccess(req, ...pageKeys)) {
      next();
      return;
    }
    deny(res, 403, 'Your user account does not have access to this feature');
  };
}

export function requireEditAccess(pageKey: 'swimmers' | 'coaches') {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.publicTenantAccess || !req.auth) {
      deny(res, 401, 'A signed-in session is required.');
      return;
    }
    if (hasEditAccess(req, pageKey)) {
      next();
      return;
    }
    deny(res, 403, 'You do not have permission to edit these records');
  };
}

export function requirePagesOrEdit(
  pageKeys: string[],
  editPage: 'swimmers' | 'coaches',
) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.publicTenantAccess || !req.auth) {
      deny(res, 401, 'A signed-in session is required.');
      return;
    }
    if (hasPageAccess(req, ...pageKeys) || hasEditAccess(req, editPage)) {
      next();
      return;
    }
    deny(res, 403, 'Your user account does not have access to this feature');
  };
}

/** Open registration/staff forms may use a public token instead of a login. */
export function allowPublicOrPages(...pageKeys: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.publicTenantAccess) {
      next();
      return;
    }
    requirePages(...pageKeys)(req, res, next);
  };
}

export function requireAccountAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.publicTenantAccess || !req.auth) {
    deny(res, 401, 'A signed-in session is required.');
    return;
  }
  if (!req.auth.isAccountAdmin) {
    deny(res, 403, 'Only the account administrator can do this');
    return;
  }
  next();
}

export function isPassPaymentPatch(body: Record<string, unknown>): boolean {
  return (
    body.passType !== undefined ||
    body.passValidUntil !== undefined ||
    body.paymentMode !== undefined ||
    body.transactionId !== undefined ||
    body.testResult !== undefined ||
    body.upgradePaymentId !== undefined
  );
}
