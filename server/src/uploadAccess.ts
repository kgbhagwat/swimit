import type { NextFunction, Request, Response } from 'express';
import path from 'node:path';
import { loadAuth } from './authSessions.js';
import { pool } from './db/pool.js';

function sanitizeUploadRelative(urlPath: string, root: string): string | null {
  let decoded = String(urlPath ?? '');
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    return null;
  }
  const rel = decoded.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!rel || rel.includes('\0')) return null;
  const parts = rel.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..')) return null;
  if (rel.toLowerCase().endsWith('.enc')) return null;
  const abs = path.resolve(root, ...parts);
  const rootAbs = path.resolve(root);
  const prefix = rootAbs.endsWith(path.sep) ? rootAbs : `${rootAbs}${path.sep}`;
  if (abs !== rootAbs && !abs.startsWith(prefix)) return null;
  return parts.join('/');
}

async function isPublicUpload(relativePath: string): Promise<boolean> {
  const { rows } = await pool.query<{ ok: boolean }>(
    `SELECT (
         EXISTS (
           SELECT 1 FROM pool_core_info
            WHERE pool_logo_path = $1 OR payment_qr_path = $1
         )
         OR EXISTS (
           SELECT 1 FROM platform_payment_settings
            WHERE payment_qr_path = $1
         )
       ) AS ok`,
    [relativePath],
  );
  return rows[0]?.ok === true;
}

async function uploadOwnedByAccount(accountId: number, relativePath: string): Promise<boolean> {
  const base = path.posix.basename(relativePath);
  const { rows } = await pool.query<{ ok: boolean }>(
    `SELECT (
         EXISTS (
           SELECT 1 FROM registrations
            WHERE saas_account_id = $1
              AND (swimmer_photo_path = $2 OR identity_photo_path = $2)
         )
         OR EXISTS (
           SELECT 1 FROM staff_registrations
            WHERE saas_account_id = $1
              AND (
                staff_photo_path = $2
                OR identity_photo_path = $2
                OR lifeguard_photo_path = $2
                OR certificate_photo_1 = $2
                OR certificate_photo_2 = $2
                OR certificate_photo_3 = $2
              )
         )
         OR EXISTS (
           SELECT 1 FROM pool_core_info
            WHERE saas_account_id = $1
              AND (pool_logo_path = $2 OR payment_qr_path = $2)
         )
         OR EXISTS (
           SELECT 1 FROM whatsapp_inbound
            WHERE saas_account_id = $1 AND file_path = $2
         )
         OR EXISTS (
           SELECT 1 FROM pass_payments
            WHERE saas_account_id = $1 AND screenshot_path = $2
         )
         OR EXISTS (
           SELECT 1 FROM support_ticket_messages
            WHERE saas_account_id = $1
              AND (attachment_path = $2 OR attachment_path = $3)
         )
       ) AS ok`,
    [accountId, relativePath, base],
  );
  return rows[0]?.ok === true;
}

function canReadSupportAcrossAccounts(req: Request): boolean {
  const auth = req.auth;
  if (!auth) return false;
  if (auth.accountCode.toLowerCase() !== 'swimit') return false;
  if (auth.kind !== 'platform' && !auth.isAccountAdmin) return false;
  return auth.isAccountAdmin || auth.menuAccess.includes('accounts');
}

function canReadPlatformPaymentScreenshots(req: Request): boolean {
  const auth = req.auth;
  if (!auth) return false;
  if (auth.accountCode.toLowerCase() !== 'swimit') return false;
  if (auth.kind !== 'platform' && !auth.isAccountAdmin) return false;
  return auth.isAccountAdmin || auth.menuAccess.includes('payment');
}

async function isPlatformPaymentScreenshot(relativePath: string): Promise<boolean> {
  const { rows } = await pool.query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM saas_package_renewals r
         LEFT JOIN whatsapp_inbound w ON w.id = r.inbound_id
        WHERE r.status = 'verified'
          AND (
            NULLIF(TRIM(r.screenshot_path), '') = $1
            OR NULLIF(TRIM(w.file_path), '') = $1
            OR (
              NULLIF(TRIM(r.transaction_id), '') IS NOT NULL
              AND EXISTS (
                SELECT 1
                  FROM whatsapp_inbound wi
                 WHERE wi.saas_account_id = r.saas_account_id
                   AND wi.file_path = $1
                   AND LOWER(TRIM(wi.ocr_transaction_id)) = LOWER(TRIM(r.transaction_id))
              )
            )
          )
     ) AS ok`,
    [relativePath],
  );
  return rows[0]?.ok === true;
}

/** Serve logos/payment QRs publicly; other uploads require a session and tenant ownership. */
export function requireUploadAccess(uploadsRoot: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.status(405).end();
      return;
    }
    const relativePath = sanitizeUploadRelative(req.path, uploadsRoot);
    if (!relativePath) {
      res.status(404).end();
      return;
    }
    try {
      if (await isPublicUpload(relativePath)) {
        next();
        return;
      }
      const auth = await loadAuth(req);
      if (!auth) {
        res.status(401).json({ error: 'Sign in to view this file' });
        return;
      }
      if (relativePath.startsWith('support/') && canReadSupportAcrossAccounts(req)) {
        next();
        return;
      }
      if (
        canReadPlatformPaymentScreenshots(req) &&
        (await isPlatformPaymentScreenshot(relativePath))
      ) {
        next();
        return;
      }
      if (await uploadOwnedByAccount(auth.accountId, relativePath)) {
        next();
        return;
      }
      res.status(404).end();
    } catch (err) {
      console.error('Upload access check failed', err);
      res.status(500).json({ error: 'Failed to authorize file access' });
    }
  };
}
