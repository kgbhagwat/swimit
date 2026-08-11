import type { MenuPageKey } from './menuCatalog';
import { resolvePackageModules } from './menuCatalog';

export type PackageFeatureDef = {
  id: string;
  label: string;
  level: 'core' | 'full';
  pageKeys: MenuPageKey[];
};

/** Catalog of package features platform users can toggle (keep in sync with server). */
export const PACKAGE_FEATURE_DEFS: readonly PackageFeatureDef[] = [
  {
    id: 'registration',
    label: 'Registration & staff forms',
    level: 'core',
    pageKeys: ['register', 'staff-register'],
  },
  {
    id: 'batches',
    label: 'Batches & pass types',
    level: 'core',
    pageKeys: ['batches', 'pass-types'],
  },
  {
    id: 'pass-ops',
    label: 'Pass payment & scanner',
    level: 'core',
    pageKeys: ['pass-payment', 'pass-scanner'],
  },
  {
    id: 'swimmer-info',
    label: "Swimmer list & attendance",
    level: 'core',
    pageKeys: ['swimmers', 'attendance-sheet', 'coaches'],
  },
  {
    id: 'pool-core',
    label: 'Pool core info',
    level: 'core',
    pageKeys: ['pool-core-info'],
  },
  {
    id: 'coach-payment',
    label: 'Coach payment',
    level: 'full',
    pageKeys: ['coach-payment'],
  },
  {
    id: 'pool-expenses',
    label: 'Pool expenses',
    level: 'full',
    pageKeys: ['pool-expenses'],
  },
  {
    id: 'water-quality',
    label: 'Water quality',
    level: 'full',
    pageKeys: ['water-quality'],
  },
  {
    id: 'balance-sheet',
    label: 'Balance sheet',
    level: 'full',
    pageKeys: ['balance-sheet'],
  },
  {
    id: 'payment-details',
    label: 'Payment details',
    level: 'full',
    pageKeys: ['payment-details'],
  },
  {
    id: 'holiday-management',
    label: 'Holiday management',
    level: 'full',
    pageKeys: ['holiday-management'],
  },
  {
    id: 'user-management',
    label: 'User management & access',
    level: 'full',
    pageKeys: ['create-user'],
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp Broadcast messaging',
    level: 'full',
    pageKeys: ['whatsapp'],
  },
  {
    id: 'activity-log',
    label: 'Activity log',
    level: 'full',
    pageKeys: ['activity-log'],
  },
] as const;

const FEATURE_ID_SET = new Set(PACKAGE_FEATURE_DEFS.map((f) => f.id));

export function sanitizeFeatureKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const item of value) {
    const key = String(item ?? '').trim();
    if (FEATURE_ID_SET.has(key)) unique.add(key);
  }
  return [...unique];
}

export function defaultFeatureKeysForModules(
  modules?: string | null,
  packageName?: string | null,
): string[] {
  const full = resolvePackageModules(modules, packageName) === 'full';
  return PACKAGE_FEATURE_DEFS.filter((f) => full || f.level === 'core').map((f) => f.id);
}

export function resolvedFeatureKeys(opts: {
  modules?: string | null;
  packageName?: string | null;
  featureKeys?: unknown;
}): string[] {
  const selected = sanitizeFeatureKeys(opts.featureKeys);
  return selected.length > 0
    ? selected
    : defaultFeatureKeysForModules(opts.modules, opts.packageName);
}

/** Menu page keys allowed for a service package (custom features or modules fallback). */
export function pageKeysForPackage(opts: {
  modules?: string | null;
  packageName?: string | null;
  featureKeys?: unknown;
}): MenuPageKey[] {
  const ids = resolvedFeatureKeys(opts);
  const pages = new Set<MenuPageKey>(['dashboard']);
  for (const def of PACKAGE_FEATURE_DEFS) {
    if (!ids.includes(def.id)) continue;
    for (const pageKey of def.pageKeys) pages.add(pageKey);
  }
  return [...pages];
}
