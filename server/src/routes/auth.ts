import { Router } from 'express';
import {
  clearSessionCookie,
  createAuthSession,
  requireAuth,
  requirePlatformAuth,
  revokeRequestSession,
  rotateSessionCsrf,
  setCsrfCookie,
  setSessionCookie,
} from '../authSessions.js';
import { pool } from '../db/pool.js';

export const authRouter = Router();

authRouter.get('/session', requireAuth, async (req, res) => {
  const auth = req.auth!;
  const csrfToken = await rotateSessionCsrf(auth.sessionId);
  setCsrfCookie(res, csrfToken);
  res.json({ auth, csrfToken });
});

authRouter.post('/logout', requireAuth, async (req, res) => {
  await revokeRequestSession(req);
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.post('/impersonate/:accountId', requirePlatformAuth, async (req, res) => {
  try {
    const accountId = Number(req.params.accountId);
    const { rows } = await pool.query(
      `SELECT a.id, a.account_name, a.account_code, a.status,
              COALESCE(p.modules, 'core') AS modules, p.feature_keys,
              a.login_session_timeout_minutes, p.package_name
       FROM saas_accounts a
       LEFT JOIN service_packages p ON p.id = a.service_package_id
       WHERE a.id = $1 AND LOWER(a.account_code) <> 'swimit'
       LIMIT 1`,
      [accountId],
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    const actorUserId = req.auth!.userId;
    if (!actorUserId) {
      res.status(403).json({ error: 'Platform administrator is required' });
      return;
    }
    const session = await createAuthSession({
      accountId,
      actorUserId,
      kind: 'impersonation',
    });
    await revokeRequestSession(req);
    setSessionCookie(res, session.token, session.expiresAt, session.csrfToken);
    res.json({
      account: {
        id: Number(rows[0].id),
        accountName: String(rows[0].account_name ?? ''),
        accountCode: String(rows[0].account_code ?? ''),
        status: String(rows[0].status ?? ''),
        modules: String(rows[0].modules ?? 'core'),
        featureKeys: Array.isArray(rows[0].feature_keys) ? rows[0].feature_keys.map(String) : [],
        packageName: String(rows[0].package_name ?? ''),
        loginSessionTimeoutMinutes: Number(rows[0].login_session_timeout_minutes ?? 30),
      },
      user: {
        id: actorUserId,
        userName: `${req.auth!.userName} (Platform)`,
        mobile: '',
        mustChangePassword: false,
        isAccountAdmin: true,
        menuAccess: [],
        isPlatformImpersonation: true,
      },
      csrfToken: session.csrfToken,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to enter account' });
  }
});

authRouter.post('/impersonation/exit', requireAuth, async (req, res) => {
  try {
    if (req.auth?.kind !== 'impersonation' || !req.auth.actorUserId) {
      res.status(403).json({ error: 'No platform impersonation session is active' });
      return;
    }
    const { rows } = await pool.query(
      `SELECT u.id, u.user_name, u.menu_access, u.is_account_admin,
              a.id AS account_id, a.account_name, a.account_code
       FROM app_users u
       JOIN saas_accounts a ON a.id = u.saas_account_id
       WHERE u.id = $1 AND LOWER(a.account_code) = 'swimit'
       LIMIT 1`,
      [req.auth.actorUserId],
    );
    if (!rows[0]) {
      res.status(403).json({ error: 'Platform account is no longer available' });
      return;
    }
    const session = await createAuthSession({
      accountId: Number(rows[0].account_id),
      userId: Number(rows[0].id),
      kind: 'platform',
    });
    await revokeRequestSession(req);
    setSessionCookie(res, session.token, session.expiresAt, session.csrfToken);
    res.json({
      platform: {
        accountCode: String(rows[0].account_code),
        accountId: Number(rows[0].account_id),
        accountName: String(rows[0].account_name),
        userId: Number(rows[0].id),
        userName: String(rows[0].user_name),
        menuAccess: Array.isArray(rows[0].menu_access) ? rows[0].menu_access.map(String) : [],
        isAccountAdmin: rows[0].is_account_admin === true,
        csrfToken: session.csrfToken,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to return to platform' });
  }
});

