import { Router } from 'express';
import { pool } from '../db/pool.js';

type PackageBody = {
  packageName?: string;
  description?: string;
  price?: number | string;
  billingPeriod?: string;
  maxPools?: number | string;
  maxUsers?: number | string;
  maxActiveSwimmers?: number | string | null;
  trialDays?: number | string;
  modules?: string;
  supportLevel?: string;
  features?: string;
  isActive?: boolean;
};

const BILLING_PERIODS = ['Month', 'Year'] as const;
const MODULES = ['core', 'full'] as const;
const SUPPORT_LEVELS = ['whatsapp', 'priority', 'onboarding'] as const;

const PACKAGE_SELECT = `SELECT id, package_name, description, price, billing_period, max_pools, max_users,
              max_active_swimmers, trial_days, modules, support_level, features, is_active, created_at
       FROM service_packages`;

function mapRow(row: Record<string, unknown>) {
  const maxActiveSwimmers =
    row.max_active_swimmers == null || row.max_active_swimmers === ''
      ? null
      : Number(row.max_active_swimmers);
  return {
    id: Number(row.id),
    packageName: String(row.package_name ?? ''),
    description: String(row.description ?? ''),
    price: Number(row.price ?? 0),
    billingPeriod: String(row.billing_period ?? 'Month'),
    maxPools: Number(row.max_pools ?? 1),
    maxUsers: Number(row.max_users ?? 5),
    maxActiveSwimmers: Number.isFinite(maxActiveSwimmers as number) ? maxActiveSwimmers : null,
    trialDays: Number(row.trial_days ?? 0),
    modules: String(row.modules ?? 'core'),
    supportLevel: String(row.support_level ?? 'whatsapp'),
    features: String(row.features ?? ''),
    isActive: row.is_active !== false,
    createdAt: row.created_at,
  };
}

function parseOptionalSwimmerLimit(value: unknown) {
  if (value === undefined || value === null || value === '' || value === 'unlimited') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  if (n === 0) return null;
  return n;
}

function buildFeatures(body: PackageBody, maxActiveSwimmers: number | null, trialDays: number) {
  const custom = String(body.features ?? '').trim();
  if (custom) return custom;
  const modules = String(body.modules ?? 'core').trim() || 'core';
  const support = String(body.supportLevel ?? 'whatsapp').trim() || 'whatsapp';
  const swimmers = maxActiveSwimmers == null ? 'unlimited' : String(maxActiveSwimmers);
  const parts = [`swimmers:${swimmers}`, `modules:${modules}`, `support:${support}`];
  if (trialDays > 0) parts.push(`trial_days:${trialDays}`);
  return parts.join('; ');
}

function validate(body: PackageBody) {
  if (!body.packageName?.trim()) return 'Package name is required';
  const price = Number(body.price);
  if (Number.isNaN(price) || price < 0) return 'Enter a valid price';
  const period = String(body.billingPeriod ?? '').trim();
  if (!(BILLING_PERIODS as readonly string[]).includes(period)) {
    return 'Billing period must be Month or Year';
  }
  const maxPools = Number(body.maxPools ?? 1);
  const maxUsers = Number(body.maxUsers ?? 5);
  if (!Number.isFinite(maxPools) || maxPools < 1) return 'Max pools must be at least 1';
  if (!Number.isFinite(maxUsers) || maxUsers < 1) return 'Max users must be at least 1';
  const swimmers = parseOptionalSwimmerLimit(body.maxActiveSwimmers);
  if (swimmers === undefined) return 'Enter a valid active swimmer limit (or leave blank for unlimited)';
  const trialDays = Number(body.trialDays ?? 0);
  if (!Number.isFinite(trialDays) || trialDays < 0) return 'Trial days must be 0 or more';
  const modules = String(body.modules ?? 'core').trim();
  if (!(MODULES as readonly string[]).includes(modules)) return 'Modules must be core or full';
  const support = String(body.supportLevel ?? 'whatsapp').trim();
  if (!(SUPPORT_LEVELS as readonly string[]).includes(support)) {
    return 'Support must be whatsapp, priority, or onboarding';
  }
  return null;
}

function packageValues(body: PackageBody) {
  const maxActiveSwimmers = parseOptionalSwimmerLimit(body.maxActiveSwimmers) ?? null;
  const trialDays = Number(body.trialDays ?? 0);
  const modules = String(body.modules ?? 'core').trim() || 'core';
  const supportLevel = String(body.supportLevel ?? 'whatsapp').trim() || 'whatsapp';
  return [
    body.packageName!.trim(),
    String(body.description ?? '').trim(),
    Number(body.price),
    String(body.billingPeriod).trim(),
    Number(body.maxPools ?? 1),
    Number(body.maxUsers ?? 5),
    maxActiveSwimmers,
    trialDays,
    modules,
    supportLevel,
    buildFeatures(body, maxActiveSwimmers, trialDays),
    body.isActive !== false,
  ];
}

export const servicePackagesRouter = Router();

servicePackagesRouter.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `${PACKAGE_SELECT}
       ORDER BY
         CASE WHEN trial_days > 0 THEN 0 ELSE 1 END,
         price ASC,
         id ASC`,
    );
    res.json(rows.map(mapRow));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load service packages' });
  }
});

servicePackagesRouter.post('/', async (req, res) => {
  try {
    const body = req.body as PackageBody;
    const error = validate(body);
    if (error) {
      res.status(400).json({ error });
      return;
    }

    const { rows } = await pool.query(
      `INSERT INTO service_packages
       (package_name, description, price, billing_period, max_pools, max_users,
        max_active_swimmers, trial_days, modules, support_level, features, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, package_name, description, price, billing_period, max_pools, max_users,
                 max_active_swimmers, trial_days, modules, support_level, features, is_active, created_at`,
      packageValues(body),
    );
    res.status(201).json(mapRow(rows[0]));
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : '';
    if (message.includes('unique') || message.includes('duplicate')) {
      res.status(400).json({ error: 'A package with this name already exists' });
      return;
    }
    res.status(500).json({ error: 'Failed to create service package' });
  }
});

servicePackagesRouter.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid package id' });
      return;
    }
    const body = req.body as PackageBody;
    const error = validate(body);
    if (error) {
      res.status(400).json({ error });
      return;
    }

    const values = packageValues(body);
    const { rows } = await pool.query(
      `UPDATE service_packages
       SET package_name = $1,
           description = $2,
           price = $3,
           billing_period = $4,
           max_pools = $5,
           max_users = $6,
           max_active_swimmers = $7,
           trial_days = $8,
           modules = $9,
           support_level = $10,
           features = $11,
           is_active = $12
       WHERE id = $13
       RETURNING id, package_name, description, price, billing_period, max_pools, max_users,
                 max_active_swimmers, trial_days, modules, support_level, features, is_active, created_at`,
      [...values, id],
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'Service package not found' });
      return;
    }
    res.json(mapRow(rows[0]));
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : '';
    if (message.includes('unique') || message.includes('duplicate')) {
      res.status(400).json({ error: 'A package with this name already exists' });
      return;
    }
    res.status(500).json({ error: 'Failed to update service package' });
  }
});

servicePackagesRouter.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid package id' });
      return;
    }
    const result = await pool.query(`DELETE FROM service_packages WHERE id = $1`, [id]);
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Service package not found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete service package' });
  }
});
