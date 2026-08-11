import { Router } from 'express';
import { pool } from '../db/pool.js';
import {
  defaultFeatureKeysForModules,
  PACKAGE_FEATURE_DEFS,
  pageKeysForPackage,
  sanitizeFeatureKeys,
} from '../packageFeatures.js';

type PackageBody = {
  packageName?: string;
  description?: string;
  price?: number | string;
  discountedRate?: number | string | null;
  billingPeriod?: string;
  maxPools?: number | string;
  maxUsers?: number | string;
  maxActiveSwimmers?: number | string | null;
  trialDays?: number | string;
  modules?: string;
  supportLevel?: string;
  features?: string;
  featureKeys?: unknown;
  isActive?: boolean;
};

const BILLING_PERIODS = ['Month', 'Year'] as const;
const MODULES = ['core', 'full'] as const;
const SUPPORT_LEVELS = ['whatsapp', 'priority', 'onboarding'] as const;

const PACKAGE_SELECT = `SELECT id, package_name, description, price, discounted_rate, billing_period,
              max_pools, max_users, max_active_swimmers, trial_days, modules, support_level,
              features, feature_keys, is_active, created_at
       FROM service_packages`;

const PACKAGE_RETURNING = `id, package_name, description, price, discounted_rate, billing_period, max_pools,
                 max_users, max_active_swimmers, trial_days, modules, support_level, features,
                 feature_keys, is_active, created_at`;

function parseDiscountedRate(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  if (n === 0) return null;
  return Math.round(n * 100) / 100;
}

function mapRow(row: Record<string, unknown>) {
  const maxActiveSwimmers =
    row.max_active_swimmers == null || row.max_active_swimmers === ''
      ? null
      : Number(row.max_active_swimmers);
  const discountedRaw =
    row.discounted_rate == null || row.discounted_rate === ''
      ? null
      : Number(row.discounted_rate);
  const discountedRate =
    discountedRaw != null && Number.isFinite(discountedRaw) && discountedRaw > 0
      ? discountedRaw
      : null;
  const modules = String(row.modules ?? 'core');
  const packageName = String(row.package_name ?? '');
  const featureKeys = sanitizeFeatureKeys(row.feature_keys);
  return {
    id: Number(row.id),
    packageName,
    description: String(row.description ?? ''),
    price: Number(row.price ?? 0),
    discountedRate,
    billingPeriod: String(row.billing_period ?? 'Month'),
    maxPools: Number(row.max_pools ?? 1),
    maxUsers: Number(row.max_users ?? 5),
    maxActiveSwimmers: Number.isFinite(maxActiveSwimmers as number) ? maxActiveSwimmers : null,
    trialDays: Number(row.trial_days ?? 0),
    modules,
    supportLevel: String(row.support_level ?? 'whatsapp'),
    features: String(row.features ?? ''),
    featureKeys:
      featureKeys.length > 0
        ? featureKeys
        : defaultFeatureKeysForModules(modules, packageName),
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

function resolveFeatureKeys(body: PackageBody, modules: string, packageName: string) {
  const selected = sanitizeFeatureKeys(body.featureKeys);
  if (selected.length > 0) return selected;
  return defaultFeatureKeysForModules(modules, packageName);
}

function validate(body: PackageBody) {
  if (!body.packageName?.trim()) return 'Package name is required';
  const price = Number(body.price);
  if (Number.isNaN(price) || price < 0) return 'Enter a valid price';
  const discountedRate = parseDiscountedRate(body.discountedRate);
  if (discountedRate === undefined) return 'Enter a valid discounted rate (or leave blank)';
  if (discountedRate != null && discountedRate > price) {
    return 'Discounted rate cannot be greater than price';
  }
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
  if (body.featureKeys !== undefined && !Array.isArray(body.featureKeys)) {
    return 'Feature list must be an array of feature keys';
  }
  return null;
}

function packageValues(body: PackageBody) {
  const maxActiveSwimmers = parseOptionalSwimmerLimit(body.maxActiveSwimmers) ?? null;
  const trialDays = Number(body.trialDays ?? 0);
  const packageName = body.packageName!.trim();
  let modules = String(body.modules ?? 'core').trim() || 'core';
  const supportLevel = String(body.supportLevel ?? 'whatsapp').trim() || 'whatsapp';
  const discountedRate = parseDiscountedRate(body.discountedRate) ?? null;
  const featureKeys = resolveFeatureKeys(body, modules, packageName);
  // Keep modules aligned with selected features for pricing highlights.
  const hasFullFeature = featureKeys.some((id) =>
    PACKAGE_FEATURE_DEFS.some((f) => f.id === id && f.level === 'full'),
  );
  if (hasFullFeature) modules = 'full';
  else if (sanitizeFeatureKeys(body.featureKeys).length > 0) modules = 'core';
  return [
    packageName,
    String(body.description ?? '').trim(),
    Number(body.price),
    discountedRate,
    String(body.billingPeriod).trim(),
    Number(body.maxPools ?? 1),
    Number(body.maxUsers ?? 5),
    maxActiveSwimmers,
    trialDays,
    modules,
    supportLevel,
    buildFeatures({ ...body, modules }, maxActiveSwimmers, trialDays),
    featureKeys,
    body.isActive !== false,
  ];
}

async function syncAccountAdminsForPackage(packageId: number, featureKeys: string[], modules: string, packageName: string) {
  const packageMenuKeys = pageKeysForPackage({ modules, packageName, featureKeys });
  await pool.query(
    `UPDATE app_users u
     SET menu_access = $1
     FROM saas_accounts a
     WHERE a.id = u.saas_account_id
       AND a.service_package_id = $2
       AND COALESCE(u.is_account_admin, FALSE) = TRUE`,
    [packageMenuKeys, packageId],
  );
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
       (package_name, description, price, discounted_rate, billing_period, max_pools, max_users,
        max_active_swimmers, trial_days, modules, support_level, features, feature_keys, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::text[], $14)
       RETURNING ${PACKAGE_RETURNING}`,
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
           discounted_rate = $4,
           billing_period = $5,
           max_pools = $6,
           max_users = $7,
           max_active_swimmers = $8,
           trial_days = $9,
           modules = $10,
           support_level = $11,
           features = $12,
           feature_keys = $13::text[],
           is_active = $14
       WHERE id = $15
       RETURNING ${PACKAGE_RETURNING}`,
      [...values, id],
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'Service package not found' });
      return;
    }
    const mapped = mapRow(rows[0]);
    await syncAccountAdminsForPackage(
      id,
      mapped.featureKeys,
      mapped.modules,
      mapped.packageName,
    );
    res.json(mapped);
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
