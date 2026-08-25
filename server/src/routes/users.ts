import { Router } from 'express';
import { recordAudit } from '../auditLog.js';
import { pool } from '../db/pool.js';
import { menuAccessForLoginType, parseLoginType } from '../menuAccess.js';
import { pageKeysForPackage } from '../packageFeatures.js';
import { duplicateEmailMessage, duplicateMobileMessage, isEmailTakenInAccount, isMobileTakenInAccount } from '../mobileUniqueness.js';
import { isValidMobile, MOBILE_INVALID_MSG, sanitizeMobile } from '../mobileValidation.js';
import { generateTempPassword, hashPassword, passwordPolicyError } from '../password.js';
import { tenantId } from '../middleware/tenant.js';
import { notifyLoginCredentials } from '../whatsapp/notify.js';

const USER_SELECT = `id, user_name, mobile, email, menu_access, must_change_password, is_account_admin,
              saas_account_id, created_at, login_geo_mode, login_radius_km, login_type`;

function mapUser(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    userName: String(row.user_name ?? ''),
    mobile: String(row.mobile ?? ''),
    email: String(row.email ?? ''),
    menuAccess: Array.isArray(row.menu_access)
      ? row.menu_access.map(String)
      : [],
    mustChangePassword: row.must_change_password === true,
    isAccountAdmin: row.is_account_admin === true,
    saasAccountId: row.saas_account_id == null ? null : Number(row.saas_account_id),
    createdAt: row.created_at,
    loginType: parseLoginType(row.login_type),
  };
}

function isValidEmail(value: string) {
  const email = value.trim();
  return email.includes('@') && email.includes('.') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function loginOriginFromRequest(req: { get: (name: string) => string | undefined }) {
  return String(
    req.get('origin') || process.env.PUBLIC_APP_URL || process.env.CORS_ORIGIN || 'http://localhost:5173',
  ).replace(/\/$/, '');
}

async function packageMenuKeysForAccount(accountId: number) {
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
  return pageKeysForPackage({
    modules: rows[0]?.modules ?? 'core',
    packageName: rows[0]?.package_name ?? '',
    featureKeys: rows[0]?.feature_keys,
  });
}

export const usersRouter = Router();

usersRouter.get('/', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const { rows } = await pool.query(
      `SELECT ${USER_SELECT}
       FROM app_users
       WHERE saas_account_id = $1
       ORDER BY created_at DESC, id DESC`,
      [accountId],
    );
    res.json(rows.map(mapUser));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

const SESSION_TIMEOUT_ALLOWED = new Set([0, 15, 30, 60, 120, 240, 480]);

function parseSessionTimeoutMinutes(value: unknown): number | null {
  const minutes = Math.round(Number(value));
  if (!Number.isFinite(minutes) || !SESSION_TIMEOUT_ALLOWED.has(minutes)) return null;
  return minutes;
}

usersRouter.get('/session-timeout', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const { rows } = await pool.query<{ login_session_timeout_minutes: number | null }>(
      `SELECT COALESCE(login_session_timeout_minutes, 30) AS login_session_timeout_minutes
       FROM saas_accounts WHERE id = $1 LIMIT 1`,
      [accountId],
    );
    res.json({ minutes: Number(rows[0]?.login_session_timeout_minutes ?? 30) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load session timeout' });
  }
});

usersRouter.put('/session-timeout', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const minutes = parseSessionTimeoutMinutes((req.body as { minutes?: unknown })?.minutes);
    if (minutes == null) {
      res.status(400).json({ error: 'Choose a valid login session timeout' });
      return;
    }
    await pool.query(
      `UPDATE saas_accounts SET login_session_timeout_minutes = $1 WHERE id = $2`,
      [minutes, accountId],
    );
    res.json({ minutes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save session timeout' });
  }
});

usersRouter.get('/:id', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }
    const { rows } = await pool.query(
      `SELECT ${USER_SELECT}
       FROM app_users
       WHERE id = $1 AND saas_account_id = $2`,
      [id, accountId],
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(mapUser(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load user' });
  }
});

usersRouter.post('/', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const body = req.body as {
      userName?: string;
      mobile?: string;
      email?: string;
      menuAccess?: unknown;
      loginType?: unknown;
    };

    const userName = String(body.userName ?? '').trim();
    const mobile = sanitizeMobile(body.mobile);
    const email = String(body.email ?? '').trim().toLowerCase();
    const packageKeys = await packageMenuKeysForAccount(accountId);
    const loginType = parseLoginType(body.loginType);
    const menuAccess = menuAccessForLoginType(body.menuAccess, loginType, packageKeys);
    const password = generateTempPassword(8);

    if (!userName) {
      res.status(400).json({ error: 'User Name is required' });
      return;
    }
    if (!isValidMobile(mobile)) {
      res.status(400).json({ error: MOBILE_INVALID_MSG });
      return;
    }
    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Enter a valid email address' });
      return;
    }

    const nameExisting = await pool.query(
      `SELECT id FROM app_users
       WHERE saas_account_id = $1 AND LOWER(user_name) = LOWER($2)
       LIMIT 1`,
      [accountId, userName],
    );
    if (nameExisting.rows[0]) {
      res.status(400).json({ error: 'User Name already exists' });
      return;
    }

    const warnings: string[] = [];
    if (await isMobileTakenInAccount({ accountId, mobile, kind: 'user' })) {
      res.status(400).json({ error: duplicateMobileMessage('user') });
      return;
    }
    if (await isEmailTakenInAccount({ accountId, email, kind: 'user' })) {
      res.status(400).json({ error: duplicateEmailMessage('user') });
      return;
    }

    const passwordHash = await hashPassword(password);
    const { rows } = await pool.query(
      `INSERT INTO app_users
       (saas_account_id, user_name, mobile, email, password_hash, menu_access, must_change_password,
        login_geo_mode, login_radius_km, login_type)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8, $9)
       RETURNING ${USER_SELECT}`,
      [
        accountId,
        userName,
        mobile,
        email,
        passwordHash,
        menuAccess,
        'pool_only',
        null,
        loginType,
      ],
    );

    const account = await pool.query(
      `SELECT account_name, account_code FROM saas_accounts WHERE id = $1`,
      [accountId],
    );
    const accountName = String(account.rows[0]?.account_name ?? 'SwimIT');
    const accountCode = String(account.rows[0]?.account_code ?? '');
    const loginUrl = accountCode
      ? `${loginOriginFromRequest(req)}/${accountCode}`
      : loginOriginFromRequest(req);

    const whatsapp = await notifyLoginCredentials({
      mobile,
      accountName,
      accountCode,
      loginUrl,
      userName,
      temporaryPassword: password,
      saasAccountId: accountId,
    });

    let deliveryNote =
      'A random 8-character password was generated. User must change it on first login.';
    let whatsappOk = false;
    if (whatsapp.ok && whatsapp.skipped) {
      deliveryNote += ' WhatsApp is not configured on the server, so nothing was sent.';
    } else if (whatsapp.ok) {
      whatsappOk = true;
      deliveryNote += ' Login details were sent on WhatsApp.';
    } else {
      deliveryNote += ` WhatsApp send failed: ${whatsapp.error}`;
    }

    const created = mapUser(rows[0]);
    await recordAudit(req, {
      action: 'create',
      entityType: 'app_user',
      entityId: created.id,
      entityLabel: created.userName,
      summary: 'Created app user',
      details: {
        userName: created.userName,
        mobile: created.mobile,
        menuAccess: created.menuAccess,
        loginType: created.loginType,
      },
    });
    res.status(201).json({
      ...created,
      temporaryPassword: password,
      warnings,
      deliveryNote,
      whatsappOk,
      whatsappError: whatsapp.ok ? null : whatsapp.error,
    });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : '';
    if (message.toLowerCase().includes('unique') || message.toLowerCase().includes('duplicate')) {
      res.status(400).json({
        error: 'User Name, Mobile No., or Email already exists in this account',
      });
      return;
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});

usersRouter.patch('/:id/password', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }

    const body = req.body as { password?: string };
    let password = String(body.password ?? '').trim();
    if (!password) {
      password = generateTempPassword(8);
    } else {
      const policyError = passwordPolicyError(password);
      if (policyError) {
        res.status(400).json({ error: policyError });
        return;
      }
    }

    const passwordHash = await hashPassword(password);
    const { rows } = await pool.query(
      `UPDATE app_users
       SET password_hash = $1,
           must_change_password = TRUE
       WHERE id = $2 AND saas_account_id = $3
       RETURNING ${USER_SELECT}`,
      [passwordHash, id, accountId],
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const account = await pool.query(
      `SELECT account_name, account_code FROM saas_accounts WHERE id = $1`,
      [accountId],
    );
    const accountName = String(account.rows[0]?.account_name ?? 'SwimIT');
    const accountCode = String(account.rows[0]?.account_code ?? '');
    const loginUrl = accountCode
      ? `${loginOriginFromRequest(req)}/${accountCode}`
      : loginOriginFromRequest(req);
    const userName = String(rows[0].user_name ?? '');
    const mobile = String(rows[0].mobile ?? '');

    let deliveryNote = 'A new random password was generated.';
    let whatsappOk = false;
    let whatsappError: string | null = null;

    if (mobile) {
      const whatsapp = await notifyLoginCredentials({
        mobile,
        accountName,
        accountCode,
        loginUrl,
        userName,
        temporaryPassword: password,
        saasAccountId: accountId,
      });
      if (whatsapp.ok && whatsapp.skipped) {
        deliveryNote += ' WhatsApp is not configured on the server, so nothing was sent.';
      } else if (whatsapp.ok) {
        whatsappOk = true;
        deliveryNote += ' Password was sent on WhatsApp.';
      } else {
        whatsappError = whatsapp.error;
        deliveryNote += ` WhatsApp send failed: ${whatsapp.error}`;
      }
    }

    const user = mapUser(rows[0]);
    await recordAudit(req, {
      action: 'update',
      entityType: 'app_user',
      entityId: user.id,
      entityLabel: user.userName,
      summary: 'Reset app user password',
      details: { userName: user.userName },
    });
    res.json({
      ok: true,
      user,
      temporaryPassword: password,
      deliveryNote,
      whatsappOk,
      whatsappError,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

usersRouter.patch('/:id/access', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }

    const body = req.body as {
      menuAccess?: unknown;
      loginType?: unknown;
    };
    const current = await pool.query<{ is_account_admin: boolean; login_type: string }>(
      `SELECT COALESCE(is_account_admin, FALSE) AS is_account_admin, login_type
       FROM app_users WHERE id = $1 AND saas_account_id = $2`,
      [id, accountId],
    );
    if (!current.rows[0]) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const isAdmin = current.rows[0].is_account_admin === true;
    const loginType = isAdmin
      ? 'normal'
      : body.loginType !== undefined
        ? parseLoginType(body.loginType)
        : parseLoginType(current.rows[0].login_type);
    const packageKeys = await packageMenuKeysForAccount(accountId);
    const menuAccess = menuAccessForLoginType(body.menuAccess, loginType, packageKeys, isAdmin);
    const { rows } = await pool.query(
      `UPDATE app_users
       SET menu_access = $1,
           login_type = $2
       WHERE id = $3 AND saas_account_id = $4
       RETURNING ${USER_SELECT}`,
      [menuAccess, loginType, id, accountId],
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const updated = mapUser(rows[0]);
    await recordAudit(req, {
      action: 'update',
      entityType: 'app_user',
      entityId: updated.id,
      entityLabel: updated.userName,
      summary: 'Updated app user menu access',
      details: {
        userName: updated.userName,
        menuAccess: updated.menuAccess,
        loginType: updated.loginType,
      },
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save menu access' });
  }
});

usersRouter.delete('/:id', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }

    const existing = await pool.query(
      `SELECT id, user_name, is_account_admin FROM app_users
       WHERE id = $1 AND saas_account_id = $2`,
      [id, accountId],
    );
    if (!existing.rows[0]) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (existing.rows[0].is_account_admin === true) {
      res.status(400).json({ error: 'Cannot remove the account admin user' });
      return;
    }

    await pool.query(`DELETE FROM app_users WHERE id = $1 AND saas_account_id = $2`, [
      id,
      accountId,
    ]);
    await recordAudit(req, {
      action: 'delete',
      entityType: 'app_user',
      entityId: id,
      entityLabel: String(existing.rows[0].user_name ?? ''),
      summary: 'Deleted app user',
      details: { userName: existing.rows[0].user_name },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove user' });
  }
});
