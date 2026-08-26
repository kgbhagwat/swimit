import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { pool } from './db/pool.js';
import { clipMenuAccessForLoginType } from './menuAccess.js';
import { noteLiveSession } from './sessionPresence.js';

const COOKIE_NAME = 'swimit_session';
const CSRF_COOKIE_NAME = 'swimit_csrf';
const SESSION_HOURS = 12;
let schemaReady: Promise<void> | null = null;

export type AuthContext = {
  sessionId: string;
  accountId: number;
  accountCode: string;
  userId: number | null;
  userName: string;
  actorUserId: number | null;
  actorUserName: string;
  isAccountAdmin: boolean;
  menuAccess: string[];
  kind: 'account' | 'platform' | 'impersonation';
};

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
    publicTenantAccess?: boolean;
  }
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function authSecret() {
  const configured = String(process.env.AUTH_SESSION_SECRET ?? '').trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SESSION_SECRET is required in production');
  }
  return 'development-only-change-me';
}

export async function ensureAuthSessionsTable() {
  authSecret();
  if (!schemaReady) {
    schemaReady = pool
      .query(`
        CREATE TABLE IF NOT EXISTS auth_sessions (
          id UUID PRIMARY KEY,
          token_hash TEXT NOT NULL UNIQUE,
          csrf_hash TEXT NOT NULL,
          saas_account_id INT NOT NULL REFERENCES saas_accounts(id) ON DELETE CASCADE,
          user_id INT REFERENCES app_users(id) ON DELETE CASCADE,
          actor_user_id INT REFERENCES app_users(id) ON DELETE CASCADE,
          session_kind TEXT NOT NULL DEFAULT 'account',
          expires_at TIMESTAMPTZ NOT NULL,
          revoked_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_auth_sessions_token
          ON auth_sessions (token_hash) WHERE revoked_at IS NULL;
        ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      `)
      .then(() => undefined)
      .catch((err) => {
        schemaReady = null;
        throw err;
      });
  }
  await schemaReady;
}

function cookieValue(req: Request) {
  const raw = String(req.headers.cookie ?? '');
  for (const part of raw.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE_NAME) return decodeURIComponent(rest.join('='));
  }
  return '';
}

export function setSessionCookie(
  res: Response,
  token: string,
  expiresAt: Date,
  csrfToken?: string,
) {
  const secure = process.env.NODE_ENV === 'production';
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/',
    expires: expiresAt,
  });
  if (csrfToken) setCsrfCookie(res, csrfToken, expiresAt);
}

export function setCsrfCookie(res: Response, csrfToken: string, expiresAt?: Date) {
  res.cookie(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });
  res.clearCookie(CSRF_COOKIE_NAME, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });
}

export async function createAuthSession(params: {
  accountId: number;
  userId?: number | null;
  actorUserId?: number | null;
  kind: AuthContext['kind'];
}) {
  await ensureAuthSessionsTable();
  const id = randomUUID();
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO auth_sessions
       (id, token_hash, csrf_hash, saas_account_id, user_id, actor_user_id, session_kind, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      hash(token),
      hash(csrfToken),
      params.accountId,
      params.userId ?? null,
      params.actorUserId ?? null,
      params.kind,
      expiresAt,
    ],
  );
  return { id, token, csrfToken, expiresAt };
}

export async function revokeRequestSession(req: Request) {
  const token = cookieValue(req);
  if (!token) return;
  await ensureAuthSessionsTable();
  await pool.query(
    `UPDATE auth_sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL`,
    [hash(token)],
  );
}

export async function rotateSessionCsrf(sessionId: string) {
  const csrfToken = randomBytes(24).toString('base64url');
  await pool.query(`UPDATE auth_sessions SET csrf_hash = $1 WHERE id = $2`, [
    hash(csrfToken),
    sessionId,
  ]);
  return csrfToken;
}

export async function loadAuth(req: Request): Promise<AuthContext | null> {
  if (req.auth) return req.auth;
  const token = cookieValue(req);
  if (!token) return null;
  await ensureAuthSessionsTable();
  const { rows } = await pool.query(
    `SELECT s.id, s.saas_account_id, s.user_id, s.actor_user_id, s.session_kind,
            s.csrf_hash, a.account_code, a.status, a.login_session_timeout_minutes,
            u.user_name, u.is_account_admin, u.menu_access, u.login_type, u.saas_account_id AS user_account_id,
            actor.user_name AS actor_user_name, actor.is_account_admin AS actor_is_admin,
            actor_account.account_code AS actor_account_code
     FROM auth_sessions s
     JOIN saas_accounts a ON a.id = s.saas_account_id
     LEFT JOIN app_users u ON u.id = s.user_id
     LEFT JOIN app_users actor ON actor.id = s.actor_user_id
     LEFT JOIN saas_accounts actor_account ON actor_account.id = actor.saas_account_id
     WHERE s.token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > NOW()
       AND s.last_seen_at > NOW() -
         (LEAST(GREATEST(COALESCE(a.login_session_timeout_minutes, 30), 5), 720)
          * INTERVAL '1 minute')
     LIMIT 1`,
    [hash(token)],
  );
  const row = rows[0];
  if (!row) return null;
  const kind = String(row.session_kind) as AuthContext['kind'];
  const impersonating =
    kind === 'impersonation' &&
    row.actor_is_admin === true &&
    String(row.actor_account_code ?? '').toLowerCase() === 'swimit';
  const normalUserValid =
    Number(row.user_id) > 0 && Number(row.user_account_id) === Number(row.saas_account_id);
  if (!impersonating && !normalUserValid) return null;
  if (String(row.status) === 'Suspended' && !impersonating) return null;

  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const supplied = String(req.header('x-csrf-token') ?? '');
    const suppliedHash = Buffer.from(hash(supplied));
    const expectedHash = Buffer.from(String(row.csrf_hash));
    if (
      !supplied ||
      suppliedHash.length !== expectedHash.length ||
      !timingSafeEqual(suppliedHash, expectedHash)
    ) {
      return null;
    }
  }

  req.auth = {
    sessionId: String(row.id),
    accountId: Number(row.saas_account_id),
    accountCode: String(row.account_code ?? ''),
    userId: normalUserValid ? Number(row.user_id) : null,
    userName: normalUserValid ? String(row.user_name ?? '') : '',
    actorUserId: impersonating ? Number(row.actor_user_id) : Number(row.user_id),
    actorUserName: impersonating
      ? String(row.actor_user_name ?? 'Platform admin')
      : String(row.user_name ?? ''),
    isAccountAdmin: impersonating || row.is_account_admin === true,
    menuAccess: clipMenuAccessForLoginType(
      Array.isArray(row.menu_access) ? row.menu_access.map(String) : [],
      row.login_type,
      impersonating || row.is_account_admin === true,
    ),
    kind,
  };
  noteLiveSession(req.auth.sessionId);
  void pool.query(`UPDATE auth_sessions SET last_seen_at = NOW() WHERE id = $1`, [row.id]);
  return req.auth;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = await loadAuth(req);
    if (!auth) {
      res.status(401).json({ error: 'Your session is invalid or expired. Please sign in again.' });
      return;
    }
    next();
  } catch (err) {
    console.error('Session validation failed', err);
    res.status(500).json({ error: 'Failed to validate session' });
  }
}

export async function requirePlatformAuth(req: Request, res: Response, next: NextFunction) {
  await requireAuth(req, res, () => {
    if (
      req.auth?.kind !== 'platform' ||
      req.auth.accountCode.toLowerCase() !== 'swimit' ||
      !req.auth.isAccountAdmin
    ) {
      res.status(403).json({ error: 'Platform administrator access is required' });
      return;
    }
    next();
  });
}

/** SwimIT SaaS staff (account code swimit), including non-admin users with a granted page. */
export function requirePlatformPageAccess(...pageKeys: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    void requireAuth(req, res, () => {
      const code = String(req.auth?.accountCode ?? '').toLowerCase();
      const platformStaff =
        code === 'swimit' &&
        (req.auth?.kind === 'platform' || req.auth?.isAccountAdmin);
      if (!platformStaff) {
        res.status(403).json({ error: 'Platform access is required' });
        return;
      }
      if (
        req.auth?.isAccountAdmin ||
        pageKeys.some((key) => req.auth?.menuAccess.includes(key))
      ) {
        next();
        return;
      }
      res.status(403).json({ error: 'Your user account does not have access to this feature' });
    });
  };
}

export function requireAnyPageAccess(...pageKeys: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (
      req.publicTenantAccess ||
      req.auth?.isAccountAdmin ||
      pageKeys.some((key) => req.auth?.menuAccess.includes(key))
    ) {
      next();
      return;
    }
    res.status(403).json({ error: 'Your user account does not have access to this feature' });
  };
}

type PublicToken = { accountId: number; accountCode: string; exp: number };

export function createPublicAccessToken(accountId: number, accountCode: string) {
  const payload: PublicToken = {
    accountId,
    accountCode: accountCode.toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', authSecret()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyPublicAccessToken(raw: string): PublicToken | null {
  const [encoded, signature] = raw.split('.');
  if (!encoded || !signature) return null;
  const expected = createHmac('sha256', authSecret()).update(encoded).digest();
  const supplied = Buffer.from(signature, 'base64url');
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as PublicToken;
    if (!payload.accountId || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

