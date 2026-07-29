import { Router } from 'express';
import { pool } from '../db/pool.js';
import { sanitizeMenuAccess } from '../menuAccess.js';
import { duplicateEmailMessage, duplicateMobileMessage, isEmailTakenInAccount, isMobileTakenInAccount } from '../mobileUniqueness.js';
import { generateTempPassword, hashPassword } from '../password.js';
import { tenantId } from '../middleware/tenant.js';
import { notifyLoginCredentials } from '../whatsapp/notify.js';

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

export const usersRouter = Router();

usersRouter.get('/', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const { rows } = await pool.query(
      `SELECT id, user_name, mobile, email, menu_access, must_change_password, is_account_admin,
              saas_account_id, created_at
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

usersRouter.get('/:id', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }
    const { rows } = await pool.query(
      `SELECT id, user_name, mobile, email, menu_access, must_change_password, is_account_admin,
              saas_account_id, created_at
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
    };

    const userName = String(body.userName ?? '').trim();
    const mobile = String(body.mobile ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const menuAccess = sanitizeMenuAccess(body.menuAccess);
    const password = generateTempPassword(8);

    if (!userName) {
      res.status(400).json({ error: 'User Name is required' });
      return;
    }
    if (!/^\d{10}$/.test(mobile)) {
      res.status(400).json({ error: 'Enter a valid 10-digit mobile number' });
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
       (saas_account_id, user_name, mobile, email, password_hash, menu_access, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       RETURNING id, user_name, mobile, email, menu_access, must_change_password, is_account_admin,
                 saas_account_id, created_at`,
      [accountId, userName, mobile, email, passwordHash, menuAccess],
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

    res.status(201).json({
      ...mapUser(rows[0]),
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
    } else if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    const passwordHash = await hashPassword(password);
    const { rows } = await pool.query(
      `UPDATE app_users
       SET password_hash = $1,
           must_change_password = TRUE
       WHERE id = $2 AND saas_account_id = $3
       RETURNING id, user_name, mobile, email, menu_access, must_change_password, is_account_admin,
                 saas_account_id, created_at`,
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

    res.json({
      ok: true,
      user: mapUser(rows[0]),
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

    const menuAccess = sanitizeMenuAccess((req.body as { menuAccess?: unknown }).menuAccess);
    const { rows } = await pool.query(
      `UPDATE app_users
       SET menu_access = $1
       WHERE id = $2 AND saas_account_id = $3
       RETURNING id, user_name, mobile, email, menu_access, must_change_password, is_account_admin,
                 saas_account_id, created_at`,
      [menuAccess, id, accountId],
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(mapUser(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save menu access' });
  }
});
