import type { AccessPageKey } from './menuAccess.js';

export type PackageFeatureDef = {
  id: string;
  label: string;
  level: 'core' | 'full';
  pageKeys: AccessPageKey[];
};

/** Catalog of package features platform users can toggle. */
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
    pageKeys: ['swimmers', 'attendance-sheet', 'coaches', 'swimmer-progress', 'progress-trend'],
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

export function allPackageFeatureKeys(): string[] {
  return PACKAGE_FEATURE_DEFS.map((f) => f.id);
}

const CURRENT_SERVICE_PACKAGE_NAMES = new Set(['trial', 'standard', 'volume']);

/** Trial / Standard / Volume — hide legacy Starter / Professional / Business / Enterprise. */
export function isCurrentServicePackageName(name: unknown) {
  return CURRENT_SERVICE_PACKAGE_NAMES.has(String(name ?? '').trim().toLowerCase());
}

/** Every plan includes every module. Keep the args for older call sites. */
export function defaultFeatureKeysForModules(
  _modules?: string | null,
  _packageName?: string | null,
): string[] {
  return allPackageFeatureKeys();
}

/** Resolve menu page keys for a service package. Every plan includes every module. */
export function pageKeysForPackage(_opts?: {
  modules?: string | null;
  packageName?: string | null;
  featureKeys?: unknown;
}): AccessPageKey[] {
  const pages = new Set<AccessPageKey>(['dashboard']);
  for (const def of PACKAGE_FEATURE_DEFS) {
    for (const pageKey of def.pageKeys) pages.add(pageKey);
  }
  return [...pages];
}
