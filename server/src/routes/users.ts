import { Router } from 'express';
import { pool } from '../db/pool.js';
import { sanitizeMenuAccess } from '../menuAccess.js';
import { hashPassword } from '../password.js';
import { tenantId } from '../middleware/tenant.js';

function mapUser(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    userName: String(row.user_name ?? ''),
    mobile: String(row.mobile ?? ''),
    menuAccess: Array.isArray(row.menu_access)
      ? row.menu_access.map(String)
      : [],
    mustChangePassword: row.must_change_password === true,
    isAccountAdmin: row.is_account_admin === true,
    saasAccountId: row.saas_account_id == null ? null : Number(row.saas_account_id),
    createdAt: row.created_at,
  };
}

export const usersRouter = Router();

usersRouter.get('/', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const { rows } = await pool.query(
      `SELECT id, user_name, mobile, menu_access, must_change_password, is_account_admin,
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
      `SELECT id, user_name, mobile, menu_access, must_change_password, is_account_admin,
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
      password?: string;
      menuAccess?: unknown;
    };

    const userName = String(body.userName ?? '').trim();
    const mobile = String(body.mobile ?? '').trim();
    const password = String(body.password ?? '');
    const menuAccess = sanitizeMenuAccess(body.menuAccess);

    if (!userName) {
      res.status(400).json({ error: 'User Name is required' });
      return;
    }
    if (!/^\d{10}$/.test(mobile)) {
      res.status(400).json({ error: 'Enter a valid 10-digit mobile number' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    const existing = await pool.query(
      `SELECT id FROM app_users
       WHERE saas_account_id = $1
         AND (LOWER(user_name) = LOWER($2) OR mobile = $3)
       LIMIT 1`,
      [accountId, userName, mobile],
    );
    if (existing.rows[0]) {
      res.status(400).json({ error: 'User Name or Mobile No. already exists' });
      return;
    }

    const passwordHash = await hashPassword(password);
    const { rows } = await pool.query(
      `INSERT INTO app_users
       (saas_account_id, user_name, mobile, password_hash, menu_access, must_change_password)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING id, user_name, mobile, menu_access, must_change_password, is_account_admin,
                 saas_account_id, created_at`,
      [accountId, userName, mobile, passwordHash, menuAccess],
    );

    res.status(201).json(mapUser(rows[0]));
  } catch (err) {
    console.error(err);
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

    const password = String((req.body as { password?: string }).password ?? '');
    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    const passwordHash = await hashPassword(password);
    const { rows } = await pool.query(
      `UPDATE app_users
       SET password_hash = $1,
           must_change_password = FALSE
       WHERE id = $2 AND saas_account_id = $3
       RETURNING id, user_name, mobile, menu_access, must_change_password, is_account_admin,
                 saas_account_id, created_at`,
      [passwordHash, id, accountId],
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ ok: true, user: mapUser(rows[0]) });
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
       RETURNING id, user_name, mobile, menu_access, must_change_password, is_account_admin,
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
