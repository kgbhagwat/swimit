import { Router } from 'express';
import { pool } from '../db/pool.js';
import { allowDuplicateAccountMobile } from '../envFlags.js';
import { ACCESS_PAGE_KEYS } from '../menuAccess.js';
import { hashPassword, generateTempPassword, verifyPassword } from '../password.js';
import { notifyLoginCredentials, notifyPackageRenewalPayment } from '../whatsapp/notify.js';
import {
  computeRenewalAmount,
  renewFromDate,
  addMonthsDateOnly,
} from '../paymentAmount.js';

type AccountBody = {
  accountName?: string;
  contactName?: string;
  mobile?: string;
  email?: string;
  city?: string;
  poolAddress?: string;
  accountCode?: string;
  servicePackageId?: number | string | null;
  status?: string;
  notes?: string;
};

const STATUSES = ['Trial', 'Active', 'Suspended'] as const;
const ACCOUNT_CODE_RE = /^[a-z0-9]{6}$/;

/** Normalize pg date / timestamp / string to YYYY-MM-DD. */
function toIsoDateOnly(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

function mapRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    accountName: String(row.account_name ?? ''),
    contactName: String(row.contact_name ?? ''),
    mobile: String(row.mobile ?? ''),
    email: String(row.email ?? ''),
    city: String(row.city ?? ''),
    poolAddress: String(row.pool_address ?? ''),
    accountCode: String(row.account_code ?? ''),
    servicePackageId: row.service_package_id == null ? null : Number(row.service_package_id),
    packageName: String(row.package_name ?? ''),
    status: String(row.status ?? 'Active'),
    notes: String(row.notes ?? ''),
    createdAt: row.created_at,
    activeSwimmers: Number(row.active_swimmers ?? 0),
    subscriptionExpiresAt: toIsoDateOnly(row.subscription_expires_at),
  };
}

function addCalendarMonths(from: Date, months: number) {
  const d = new Date(from);
  d.setMonth(d.getMonth() + months);
  return d;
}

function addCalendarYears(from: Date, years: number) {
  const d = new Date(from);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

function toDateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Subscription end from package trial days, or one billing period from open date. */
function computeSubscriptionExpiresAt(params: {
  openedAt?: Date;
  trialDays?: number;
  billingPeriod?: string;
}) {
  const opened = params.openedAt ?? new Date();
  const trialDays = Math.max(0, Number(params.trialDays ?? 0));
  if (trialDays > 0) {
    const d = new Date(opened);
    d.setDate(d.getDate() + trialDays);
    return toDateOnly(d);
  }
  const period = String(params.billingPeriod ?? 'Month').toLowerCase();
  if (period === 'year') return toDateOnly(addCalendarYears(opened, 1));
  return toDateOnly(addCalendarMonths(opened, 1));
}

/** Keep letters + digits, lowercase, max 6 chars. */
function normalizeAccountCode(value: unknown) {
  return String(value ?? '')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 6)
    .toLowerCase();
}

function normalizeEmail(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function validate(body: AccountBody, { requireCode = true } = {}) {
  if (!body.accountName?.trim()) return 'Account / pool name is required';
  if (!body.contactName?.trim()) return 'Contact name is required';
  const mobile = String(body.mobile ?? '').replace(/\D/g, '');
  if (!/^\d{10}$/.test(mobile)) return 'Enter a valid 10-digit mobile number';
  const email = normalizeEmail(body.email);
  if (!email) return 'Email is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address';
  if (requireCode) {
    const code = normalizeAccountCode(body.accountCode);
    if (!ACCOUNT_CODE_RE.test(code)) {
      return 'Enter a 6-character account code (small letters and numbers)';
    }
  }
  const status = String(body.status ?? 'Active').trim();
  if (!(STATUSES as readonly string[]).includes(status)) {
    return 'Status must be Trial, Active, or Suspended';
  }
  if (
    body.servicePackageId !== undefined &&
    body.servicePackageId !== null &&
    body.servicePackageId !== ''
  ) {
    const pkgId = Number(body.servicePackageId);
    if (!Number.isFinite(pkgId) || pkgId <= 0) return 'Select a valid service package';
  }
  return null;
}

async function findContactConflicts(
  client: { query: typeof pool.query },
  mobile: string,
  email: string,
  excludeId?: number,
) {
  const { rows } = await client.query(
    `SELECT id, mobile, email
     FROM saas_accounts
     WHERE (
       mobile = $1
       OR (TRIM(email) <> '' AND LOWER(TRIM(email)) = $2)
     )
       AND ($3::int IS NULL OR id <> $3)`,
    [mobile, email, excludeId ?? null],
  );

  let mobileConflict = false;
  let emailConflict = false;
  for (const row of rows) {
    if (String(row.mobile) === mobile) mobileConflict = true;
    if (email && String(row.email ?? '').trim().toLowerCase() === email) emailConflict = true;
  }
  return { mobileConflict, emailConflict };
}

function duplicateConflictMessage(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes('account_code')) {
    return 'Account code is not available. Try another.';
  }
  if (lower.includes('email')) {
    return 'An account with this email already exists';
  }
  if (lower.includes('mobile')) {
    return 'An account with this mobile number already exists';
  }
  return 'An account with this mobile number or email already exists';
}

const ACCOUNT_SELECT = `SELECT a.id, a.account_name, a.contact_name, a.mobile, a.email, a.city,
              a.pool_address, a.account_code, a.service_package_id, a.status, a.notes, a.created_at,
              p.package_name,
              COALESCE(
                a.subscription_expires_at,
                CASE
                  WHEN COALESCE(p.trial_days, 0) > 0
                    THEN (a.created_at::date + (p.trial_days || ' days')::interval)::date
                  WHEN LOWER(COALESCE(p.billing_period, 'Month')) = 'year'
                    THEN (a.created_at::date + INTERVAL '1 year')::date
                  WHEN a.service_package_id IS NOT NULL
                    THEN (a.created_at::date + INTERVAL '1 month')::date
                  ELSE NULL
                END
              ) AS subscription_expires_at,
              (
                SELECT COUNT(*)::int
                FROM registrations r
                WHERE r.saas_account_id = a.id AND COALESCE(r.is_active, TRUE) = TRUE
              ) AS active_swimmers
       FROM saas_accounts a
       LEFT JOIN service_packages p ON p.id = a.service_package_id`;

export const saasAccountsRouter = Router();

saasAccountsRouter.get('/check-code/:code', async (req, res) => {
  try {
    const code = normalizeAccountCode(req.params.code);
    if (!ACCOUNT_CODE_RE.test(code)) {
      res.json({
        code,
        available: false,
        reason: 'Use exactly 6 letters or numbers',
      });
      return;
    }
    const { rows } = await pool.query(
      `SELECT id FROM saas_accounts WHERE LOWER(account_code) = $1 LIMIT 1`,
      [code],
    );
    res.json({
      code,
      available: rows.length === 0,
      reason: rows.length === 0 ? 'Available' : 'Try another',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to check account code' });
  }
});

saasAccountsRouter.get('/by-code/:code', async (req, res) => {
  try {
    const code = normalizeAccountCode(req.params.code);
    if (!ACCOUNT_CODE_RE.test(code)) {
      res.status(400).json({ error: 'Account code must be 6 letters or numbers' });
      return;
    }
    const { rows } = await pool.query(`${ACCOUNT_SELECT} WHERE LOWER(a.account_code) = $1 LIMIT 1`, [
      code,
    ]);
    if (rows.length === 0) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    res.json(mapRow(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load account' });
  }
});

saasAccountsRouter.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(`${ACCOUNT_SELECT} ORDER BY a.created_at DESC, a.id DESC`);
    res.json(rows.map(mapRow));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load accounts' });
  }
});

saasAccountsRouter.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const body = req.body as AccountBody;
    const error = validate(body);
    if (error) {
      res.status(400).json({ error });
      return;
    }

    const mobile = String(body.mobile).replace(/\D/g, '');
    const email = normalizeEmail(body.email);
    const accountCode = normalizeAccountCode(body.accountCode);
    let packageId =
      body.servicePackageId === undefined ||
      body.servicePackageId === null ||
      body.servicePackageId === ''
        ? null
        : Number(body.servicePackageId);

    // Default new accounts to Trial when no package is selected.
    if (packageId == null || !Number.isFinite(packageId) || packageId <= 0) {
      const trial = await client.query(
        `SELECT id FROM service_packages WHERE LOWER(package_name) = 'trial' LIMIT 1`,
      );
      packageId = trial.rows[0] ? Number(trial.rows[0].id) : null;
    }

    let packageMeta: { trial_days?: number; billing_period?: string } | null = null;
    if (packageId != null) {
      const pkg = await client.query(
        `SELECT id, trial_days, billing_period FROM service_packages WHERE id = $1`,
        [packageId],
      );
      if (pkg.rowCount === 0) {
        res.status(400).json({ error: 'Selected service package was not found' });
        return;
      }
      packageMeta = pkg.rows[0] as { trial_days?: number; billing_period?: string };
    }

    const existing = await client.query(
      `SELECT id FROM saas_accounts WHERE LOWER(account_code) = $1 LIMIT 1`,
      [accountCode],
    );
    if ((existing.rowCount ?? 0) > 0) {
      res.status(400).json({ error: 'Account code is not available. Try another.' });
      return;
    }

    const conflicts = await findContactConflicts(client, mobile, email);
    const warnings: string[] = [];
    if (conflicts.emailConflict) {
      res.status(400).json({ error: 'An account with this email already exists' });
      return;
    }
    if (conflicts.mobileConflict) {
      if (allowDuplicateAccountMobile()) {
        warnings.push(
          'This mobile number is already used by another account. Allowed on staging only — production will block it.',
        );
      } else {
        res.status(400).json({ error: 'An account with this mobile number already exists' });
        return;
      }
    }

    const subscriptionExpiresAt =
      packageId == null
        ? null
        : computeSubscriptionExpiresAt({
            trialDays: Number(packageMeta?.trial_days ?? 0),
            billingPeriod: String(packageMeta?.billing_period ?? 'Month'),
          });

    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO saas_accounts
       (account_name, contact_name, mobile, email, city, pool_address, account_code,
        service_package_id, status, notes, subscription_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, account_name, contact_name, mobile, email, city, pool_address, account_code,
                 service_package_id, status, notes, created_at, subscription_expires_at`,
      [
        body.accountName!.trim(),
        body.contactName!.trim(),
        mobile,
        email,
        String(body.city ?? '').trim(),
        String(body.poolAddress ?? '').trim(),
        accountCode,
        packageId,
        String(body.status ?? 'Active').trim(),
        String(body.notes ?? '').trim(),
        subscriptionExpiresAt,
      ],
    );

    const created = rows[0];
    const accountId = Number(created.id);
    const adminPassword = generateTempPassword(8);
    const passwordHash = await hashPassword(adminPassword);
    const adminUserName = 'admin';

    const { rows: adminRows } = await client.query(
      `INSERT INTO app_users
       (user_name, mobile, email, password_hash, menu_access, saas_account_id, must_change_password, is_account_admin)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, TRUE)
       RETURNING id, user_name, mobile, email`,
      [adminUserName, mobile, email, passwordHash, [...ACCESS_PAGE_KEYS], accountId],
    );

    // Empty app shell for this account only (no shared / demo data)
    await client.query(
      `INSERT INTO pool_core_info (saas_account_id, pool_name, pool_address)
       VALUES ($1, $2, $3)`,
      [
        accountId,
        body.accountName!.trim(),
        String(body.poolAddress ?? '').trim(),
      ],
    );
    await client.query(`INSERT INTO holiday_settings (saas_account_id) VALUES ($1)`, [accountId]);

    await client.query('COMMIT');

    let packageName = '';
    if (created.service_package_id != null) {
      const pkg = await pool.query(`SELECT package_name FROM service_packages WHERE id = $1`, [
        created.service_package_id,
      ]);
      packageName = String(pkg.rows[0]?.package_name ?? '');
    }

    const account = mapRow({ ...created, package_name: packageName });
    const loginOrigin = String(req.get('origin') || process.env.CORS_ORIGIN || 'http://localhost:5173').replace(
      /\/$/,
      '',
    );
    const loginUrl = `${loginOrigin}/${accountCode}`;

    res.status(201).json({
      ...account,
      loginUrl,
      adminUser: {
        userName: String(adminRows[0].user_name),
        mobile: String(adminRows[0].mobile),
        temporaryPassword: adminPassword,
        mustChangePassword: true,
      },
      warnings,
      deliveryNote:
        'Temporary password is random (8 characters). They must change it on first login.',
    });

    void notifyLoginCredentials({
      mobile,
      accountName: account.accountName,
      accountCode,
      loginUrl,
      userName: adminUserName,
      temporaryPassword: adminPassword,
      saasAccountId: accountId,
    }).then((result) => {
      if (!result.ok) console.warn('[whatsapp] credentials notify failed', result.error);
      else if (result.skipped) console.info('[whatsapp] credentials skipped (not configured)');
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error(err);
    const message = err instanceof Error ? err.message : '';
    if (message.includes('unique') || message.includes('duplicate')) {
      res.status(400).json({ error: duplicateConflictMessage(message) });
      return;
    }
    res.status(500).json({ error: 'Failed to create account' });
  } finally {
    client.release();
  }
});

/** Reset account admin password to temporary "admin" and return credentials to resend. */
saasAccountsRouter.post('/:id/resend-credentials', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid account id' });
      return;
    }

    const { rows } = await pool.query(`${ACCOUNT_SELECT} WHERE a.id = $1`, [id]);
    if (!rows[0]) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const account = mapRow(rows[0]);
    if (!account.accountCode) {
      res.status(400).json({ error: 'Account has no login code' });
      return;
    }
    if (account.status === 'Suspended') {
      res.status(400).json({ error: 'Cannot resend credentials for a suspended account' });
      return;
    }

    const adminPassword = generateTempPassword(8);
    const passwordHash = await hashPassword(adminPassword);

    let admin = await pool.query(
      `SELECT id, user_name, mobile, email
       FROM app_users
       WHERE saas_account_id = $1 AND COALESCE(is_account_admin, FALSE) = TRUE
       ORDER BY id ASC
       LIMIT 1`,
      [id],
    );

    if (!admin.rows[0]) {
      admin = await pool.query(
        `INSERT INTO app_users
         (user_name, mobile, email, password_hash, menu_access, saas_account_id, must_change_password, is_account_admin)
         VALUES ('admin', $1, $2, $3, $4, $5, TRUE, TRUE)
         RETURNING id, user_name, mobile, email`,
        [account.mobile, account.email, passwordHash, [...ACCESS_PAGE_KEYS], id],
      );
    } else {
      await pool.query(
        `UPDATE app_users
         SET password_hash = $1,
             must_change_password = TRUE,
             user_name = COALESCE(NULLIF(TRIM(user_name), ''), 'admin')
         WHERE id = $2 AND saas_account_id = $3`,
        [passwordHash, Number(admin.rows[0].id), id],
      );
      admin = await pool.query(
        `SELECT id, user_name, mobile, email FROM app_users WHERE id = $1`,
        [Number(admin.rows[0].id)],
      );
    }

    const loginOrigin = String(req.get('origin') || process.env.CORS_ORIGIN || 'http://localhost:5173').replace(
      /\/$/,
      '',
    );
    const loginUrl = `${loginOrigin}/${account.accountCode}`;

    res.json({
      ...account,
      loginUrl,
      adminUser: {
        userName: String(admin.rows[0].user_name),
        mobile: String(admin.rows[0].mobile),
        temporaryPassword: adminPassword,
        mustChangePassword: true,
      },
      deliveryNote:
        'Admin password was reset to a new random 8-character password. WhatsApp send is attempted when configured.',
    });

    void notifyLoginCredentials({
      mobile: String(admin.rows[0].mobile ?? account.mobile),
      accountName: account.accountName,
      accountCode: account.accountCode,
      loginUrl,
      userName: String(admin.rows[0].user_name),
      temporaryPassword: adminPassword,
      saasAccountId: id,
    }).then((result) => {
      if (!result.ok) console.warn('[whatsapp] credentials notify failed', result.error);
    });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : '';
    if (message.includes('unique') || message.includes('duplicate')) {
      res.status(400).json({ error: 'Could not reset admin user (name or mobile conflict)' });
      return;
    }
    res.status(500).json({ error: 'Failed to resend account credentials' });
  }
});

saasAccountsRouter.patch('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid account id' });
      return;
    }
    const body = req.body as AccountBody;
    const error = validate(body, { requireCode: false });
    if (error) {
      res.status(400).json({ error });
      return;
    }

    const mobile = String(body.mobile).replace(/\D/g, '');
    const email = normalizeEmail(body.email);
    const accountCode = normalizeAccountCode(body.accountCode);
    const packageId =
      body.servicePackageId === undefined ||
      body.servicePackageId === null ||
      body.servicePackageId === ''
        ? null
        : Number(body.servicePackageId);

    if (accountCode && !ACCOUNT_CODE_RE.test(accountCode)) {
      res.status(400).json({ error: 'Enter a 6-character account code (small letters and numbers)' });
      return;
    }

    const conflicts = await findContactConflicts(pool, mobile, email, id);
    const warnings: string[] = [];
    if (conflicts.emailConflict) {
      res.status(400).json({ error: 'An account with this email already exists' });
      return;
    }
    if (conflicts.mobileConflict) {
      if (allowDuplicateAccountMobile()) {
        warnings.push(
          'This mobile number is already used by another account. Allowed on staging only — production will block it.',
        );
      } else {
        res.status(400).json({ error: 'An account with this mobile number already exists' });
        return;
      }
    }

    let subscriptionExpiresAt: string | null = null;
    if (packageId != null) {
      const pkg = await pool.query(
        `SELECT trial_days, billing_period FROM service_packages WHERE id = $1`,
        [packageId],
      );
      if (pkg.rowCount === 0) {
        res.status(400).json({ error: 'Selected service package was not found' });
        return;
      }
      const existing = await pool.query(`SELECT created_at FROM saas_accounts WHERE id = $1`, [id]);
      const openedAt = existing.rows[0]?.created_at
        ? new Date(String(existing.rows[0].created_at))
        : new Date();
      subscriptionExpiresAt = computeSubscriptionExpiresAt({
        openedAt,
        trialDays: Number(pkg.rows[0].trial_days ?? 0),
        billingPeriod: String(pkg.rows[0].billing_period ?? 'Month'),
      });
    }

    const { rows } = await pool.query(
      `UPDATE saas_accounts
       SET account_name = $1,
           contact_name = $2,
           mobile = $3,
           email = $4,
           city = $5,
           pool_address = $6,
           account_code = COALESCE(NULLIF($7, ''), account_code),
           service_package_id = $8,
           status = $9,
           notes = $10,
           subscription_expires_at = $11
       WHERE id = $12
       RETURNING id, account_name, contact_name, mobile, email, city, pool_address, account_code,
                 service_package_id, status, notes, created_at, subscription_expires_at`,
      [
        body.accountName!.trim(),
        body.contactName!.trim(),
        mobile,
        email,
        String(body.city ?? '').trim(),
        String(body.poolAddress ?? '').trim(),
        accountCode,
        packageId,
        String(body.status ?? 'Active').trim(),
        String(body.notes ?? '').trim(),
        subscriptionExpiresAt,
        id,
      ],
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const updated = rows[0];
    let packageName = '';
    if (updated.service_package_id != null) {
      const pkg = await pool.query(`SELECT package_name FROM service_packages WHERE id = $1`, [
        updated.service_package_id,
      ]);
      packageName = String(pkg.rows[0]?.package_name ?? '');
    }

    res.json({
      ...mapRow({ ...updated, package_name: packageName }),
      warnings,
    });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : '';
    if (message.includes('unique') || message.includes('duplicate')) {
      res.status(400).json({ error: duplicateConflictMessage(message) });
      return;
    }
    res.status(500).json({ error: 'Failed to update account' });
  }
});

saasAccountsRouter.post('/by-code/:code/login', async (req, res) => {
  try {
    const code = normalizeAccountCode(req.params.code);
    if (!ACCOUNT_CODE_RE.test(code)) {
      res.status(400).json({ error: 'Invalid account code' });
      return;
    }
    const body = req.body as { userName?: string; password?: string };
    const userName = String(body.userName ?? '').trim() || 'admin';
    const password = String(body.password ?? '');
    if (!password) {
      res.status(400).json({ error: 'Password is required' });
      return;
    }

    const { rows: accountRows } = await pool.query(
      `SELECT id, account_name, account_code, status
       FROM saas_accounts
       WHERE LOWER(account_code) = $1
       LIMIT 1`,
      [code],
    );
    if (!accountRows[0]) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    if (String(accountRows[0].status) === 'Suspended') {
      res.status(403).json({ error: 'This account is suspended' });
      return;
    }

    const accountId = Number(accountRows[0].id);
    const { rows: userRows } = await pool.query(
      `SELECT id, user_name, mobile, password_hash, menu_access, must_change_password,
              is_account_admin, saas_account_id, created_at
       FROM app_users
       WHERE saas_account_id = $1 AND LOWER(user_name) = LOWER($2)
       LIMIT 1`,
      [accountId, userName],
    );
    if (!userRows[0]) {
      res.status(401).json({ error: 'Invalid user name or password' });
      return;
    }

    const valid = await verifyPassword(password, String(userRows[0].password_hash));
    if (!valid) {
      res.status(401).json({ error: 'Invalid user name or password' });
      return;
    }

    res.json({
      account: {
        id: accountId,
        accountName: String(accountRows[0].account_name),
        accountCode: String(accountRows[0].account_code),
        status: String(accountRows[0].status),
      },
      user: {
        id: Number(userRows[0].id),
        userName: String(userRows[0].user_name),
        mobile: String(userRows[0].mobile),
        mustChangePassword: userRows[0].must_change_password === true,
        isAccountAdmin: userRows[0].is_account_admin === true,
        menuAccess: Array.isArray(userRows[0].menu_access)
          ? userRows[0].menu_access.map(String)
          : [],
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to log in' });
  }
});

saasAccountsRouter.post('/by-code/:code/change-password', async (req, res) => {
  try {
    const code = normalizeAccountCode(req.params.code);
    if (!ACCOUNT_CODE_RE.test(code)) {
      res.status(400).json({ error: 'Invalid account code' });
      return;
    }
    const body = req.body as {
      userId?: number | string;
      currentPassword?: string;
      newPassword?: string;
    };
    const userId = Number(body.userId);
    const currentPassword = String(body.currentPassword ?? '');
    const newPassword = String(body.newPassword ?? '');
    if (!Number.isFinite(userId) || userId <= 0) {
      res.status(400).json({ error: 'Invalid user' });
      return;
    }
    if (newPassword.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters' });
      return;
    }

    const { rows: accountRows } = await pool.query(
      `SELECT id FROM saas_accounts WHERE LOWER(account_code) = $1 LIMIT 1`,
      [code],
    );
    if (!accountRows[0]) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const { rows: userRows } = await pool.query(
      `SELECT id, user_name, mobile, password_hash, menu_access, must_change_password,
              is_account_admin, saas_account_id
       FROM app_users
       WHERE id = $1 AND saas_account_id = $2
       LIMIT 1`,
      [userId, Number(accountRows[0].id)],
    );
    if (!userRows[0]) {
      res.status(404).json({ error: 'User not found for this account' });
      return;
    }

    const valid = await verifyPassword(currentPassword, String(userRows[0].password_hash));
    if (!valid) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }

    if (currentPassword === newPassword) {
      res.status(400).json({ error: 'New password must be different from the temporary password' });
      return;
    }

    const passwordHash = await hashPassword(newPassword);
    const { rows } = await pool.query(
      `UPDATE app_users
       SET password_hash = $1,
           must_change_password = FALSE
       WHERE id = $2
       RETURNING id, user_name, mobile, menu_access, must_change_password, is_account_admin`,
      [passwordHash, userId],
    );

    res.json({
      ok: true,
      user: {
        id: Number(rows[0].id),
        userName: String(rows[0].user_name),
        mobile: String(rows[0].mobile),
        mustChangePassword: false,
        isAccountAdmin: rows[0].is_account_admin === true,
        menuAccess: Array.isArray(rows[0].menu_access) ? rows[0].menu_access.map(String) : [],
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

saasAccountsRouter.get('/by-code/:code/renew/pending', async (req, res) => {
  try {
    const code = normalizeAccountCode(req.params.code);
    if (!ACCOUNT_CODE_RE.test(code)) {
      res.status(400).json({ error: 'Invalid account code' });
      return;
    }
    const { rows: accountRows } = await pool.query(
      `${ACCOUNT_SELECT} WHERE LOWER(a.account_code) = $1 LIMIT 1`,
      [code],
    );
    if (!accountRows[0]) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    const account = mapRow(accountRows[0]);
    const { rows } = await pool.query(
      `SELECT r.*, p.package_name AS renew_package_name
       FROM saas_package_renewals r
       JOIN service_packages p ON p.id = r.renew_package_id
       WHERE r.saas_account_id = $1 AND r.status = 'pending'
       ORDER BY r.created_at DESC
       LIMIT 1`,
      [account.id],
    );
    const { rows: verifiedRows } = await pool.query(
      `SELECT r.*, p.package_name AS renew_package_name
       FROM saas_package_renewals r
       JOIN service_packages p ON p.id = r.renew_package_id
       WHERE r.saas_account_id = $1 AND r.status = 'verified'
       ORDER BY r.verified_at DESC NULLS LAST, r.id DESC
       LIMIT 1`,
      [account.id],
    );
    const pay = await pool.query(`SELECT payment_qr_path, upi_id FROM platform_payment_settings WHERE id = 1`);
    const mapRenewal = (row: Record<string, unknown>) => ({
      id: Number(row.id),
      renewPackageId: Number(row.renew_package_id),
      renewPackageName: String(row.renew_package_name ?? ''),
      months: Number(row.months),
      expectedAmount: Number(row.expected_amount),
      detectedAmount:
        row.detected_amount == null ? null : Number(row.detected_amount),
      renewFrom: String(row.renew_from).slice(0, 10),
      newExpiresAt: addMonthsDateOnly(
        String(row.renew_from).slice(0, 10),
        Number(row.months),
      ),
      transactionId: String(row.transaction_id ?? '').trim(),
      verifiedAt: row.verified_at ?? null,
      createdAt: row.created_at,
      status: String(row.status ?? ''),
    });
    res.json({
      account,
      pending: rows[0] ? mapRenewal(rows[0] as Record<string, unknown>) : null,
      latestVerified: verifiedRows[0]
        ? mapRenewal(verifiedRows[0] as Record<string, unknown>)
        : null,
      payment: {
        paymentQrPath: pay.rows[0]?.payment_qr_path
          ? String(pay.rows[0].payment_qr_path)
          : null,
        upiId: String(pay.rows[0]?.upi_id ?? ''),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load renewal status' });
  }
});

saasAccountsRouter.post('/by-code/:code/renew', async (req, res) => {
  try {
    const code = normalizeAccountCode(req.params.code);
    if (!ACCOUNT_CODE_RE.test(code)) {
      res.status(400).json({ error: 'Invalid account code' });
      return;
    }

    const body = req.body as {
      userId?: number | string;
      renewPackageId?: number | string;
      months?: number | string;
    };
    const userId = Number(body.userId);
    const renewPackageId = Number(body.renewPackageId);
    const months = Math.floor(Number(body.months));

    if (!Number.isFinite(userId) || userId <= 0) {
      res.status(400).json({ error: 'Invalid user' });
      return;
    }
    if (!Number.isFinite(renewPackageId) || renewPackageId <= 0) {
      res.status(400).json({ error: 'Select a package to renew' });
      return;
    }
    if (!Number.isFinite(months) || months < 1 || months > 36) {
      res.status(400).json({ error: 'Duration must be between 1 and 36 months' });
      return;
    }

    const { rows: accountRows } = await pool.query(
      `${ACCOUNT_SELECT} WHERE LOWER(a.account_code) = $1 LIMIT 1`,
      [code],
    );
    if (!accountRows[0]) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    const account = mapRow(accountRows[0]);

    const { rows: userRows } = await pool.query(
      `SELECT id, mobile, is_account_admin, user_name
       FROM app_users
       WHERE id = $1 AND saas_account_id = $2`,
      [userId, account.id],
    );
    if (!userRows[0]) {
      res.status(404).json({ error: 'User not found on this account' });
      return;
    }
    if (userRows[0].is_account_admin !== true) {
      res.status(403).json({ error: 'Only the account admin can renew the package' });
      return;
    }

    const mobile = String(userRows[0].mobile ?? '').replace(/\D/g, '').slice(-10);
    if (mobile.length !== 10) {
      res.status(400).json({ error: 'Admin mobile number is required for WhatsApp payment instructions' });
      return;
    }

    const { rows: pkgRows } = await pool.query(
      `SELECT id, package_name, price, billing_period, is_active, trial_days
       FROM service_packages WHERE id = $1`,
      [renewPackageId],
    );
    if (!pkgRows[0]) {
      res.status(400).json({ error: 'Selected package was not found' });
      return;
    }
    if (pkgRows[0].is_active === false) {
      res.status(400).json({ error: 'Selected package is not active' });
      return;
    }
    const pkgName = String(pkgRows[0].package_name ?? '').trim().toLowerCase();
    const pkgTrialDays = Number(pkgRows[0].trial_days ?? 0);
    if (pkgName === 'trial' || pkgTrialDays > 0) {
      res.status(400).json({ error: 'Trial cannot be selected for renewal. Choose a paid package.' });
      return;
    }

    const expectedAmount = computeRenewalAmount({
      price: Number(pkgRows[0].price),
      billingPeriod: String(pkgRows[0].billing_period ?? 'Month'),
      months,
    });
    if (expectedAmount <= 0) {
      res.status(400).json({ error: 'Selected package has no payable amount. Choose a paid package.' });
      return;
    }

    const renewFrom = renewFromDate(account.subscriptionExpiresAt);
    const newExpiresAt = addMonthsDateOnly(renewFrom, months);

    const pay = await pool.query(
      `SELECT payment_qr_path, upi_id FROM platform_payment_settings WHERE id = 1`,
    );
    const paymentQrPath = pay.rows[0]?.payment_qr_path
      ? String(pay.rows[0].payment_qr_path)
      : null;
    const upiId = String(pay.rows[0]?.upi_id ?? '').trim();
    if (!paymentQrPath && !upiId) {
      res.status(400).json({
        error: 'SaaS payment QR / UPI is not configured yet. Ask SwimIT to set Payment details.',
      });
      return;
    }

    await pool.query(
      `UPDATE saas_package_renewals
       SET status = 'cancelled', notes = 'Superseded by new renewal request'
       WHERE saas_account_id = $1 AND status = 'pending'`,
      [account.id],
    );

    const { rows: renewalRows } = await pool.query(
      `INSERT INTO saas_package_renewals
       (saas_account_id, requested_by_user_id, from_mobile, current_package_id,
        renew_package_id, months, expected_amount, renew_from, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, 'pending')
       RETURNING id, created_at`,
      [
        account.id,
        userId,
        mobile,
        account.servicePackageId,
        renewPackageId,
        months,
        expectedAmount,
        renewFrom,
      ],
    );

    const notify = await notifyPackageRenewalPayment({
      mobile,
      accountName: account.accountName,
      packageName: String(pkgRows[0].package_name),
      months,
      amount: expectedAmount,
      upiId,
      paymentQrPath,
      saasAccountId: account.id,
    });

    res.json({
      ok: true,
      renewal: {
        id: Number(renewalRows[0].id),
        renewPackageId,
        renewPackageName: String(pkgRows[0].package_name),
        months,
        expectedAmount,
        renewFrom,
        newExpiresAt,
        createdAt: renewalRows[0].created_at,
      },
      payment: {
        paymentQrPath,
        upiId,
      },
      whatsapp: notify,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to start package renewal' });
  }
});
