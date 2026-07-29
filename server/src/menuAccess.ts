export const ACCESS_PAGE_KEYS = [
  'create-user',
  'pool-core-info',
  'batches',
  'pass-types',
  'holiday-management',
  'pass-payment',
  'whatsapp',
  'pass-scanner',
  'coach-payment',
  'pool-expenses',
  'swimmers',
  'attendance-sheet',
  'coaches',
  'balance-sheet',
  'payment-details',
  'register',
  'staff-register',
] as const;

/** SwimIT SaaS platform (swimit) staff access keys. */
export const PLATFORM_ACCESS_PAGE_KEYS = [
  'accounts',
  'create-account',
  'service-packages',
  'payment',
  'platform-users',
  'platform-create-user',
  'whatsapp',
] as const;

export type AccessPageKey = (typeof ACCESS_PAGE_KEYS)[number];
export type PlatformAccessPageKey = (typeof PLATFORM_ACCESS_PAGE_KEYS)[number];

/** Pages included in Trial / Starter (modules: core). */
export const CORE_PAGE_KEYS: readonly AccessPageKey[] = [
  'register',
  'staff-register',
  'batches',
  'pass-types',
  'pass-payment',
  'pass-scanner',
  'swimmers',
  'attendance-sheet',
  'pool-core-info',
  'coaches',
];

/** Extra pages for Professional / Enterprise (modules: full). */
export const FULL_ONLY_PAGE_KEYS: readonly AccessPageKey[] = [
  'coach-payment',
  'pool-expenses',
  'balance-sheet',
  'holiday-management',
  'whatsapp',
  'create-user',
  'payment-details',
];

const ALL_ALLOWED = new Set<string>([...ACCESS_PAGE_KEYS, ...PLATFORM_ACCESS_PAGE_KEYS]);
const CORE_SET = new Set<string>(CORE_PAGE_KEYS);
const FULL_SET = new Set<string>([...CORE_PAGE_KEYS, ...FULL_ONLY_PAGE_KEYS]);

export function resolvePackageModules(
  modules?: string | null,
  packageName?: string | null,
): 'core' | 'full' {
  const level = String(modules ?? '').toLowerCase().trim();
  if (level === 'full') return 'full';
  const name = String(packageName ?? '').toLowerCase().trim();
  if (name === 'professional' || name === 'enterprise') return 'full';
  return 'core';
}

export function pageKeysForModules(
  modules?: string | null,
  packageName?: string | null,
): AccessPageKey[] {
  return resolvePackageModules(modules, packageName) === 'full'
    ? ([...FULL_SET] as AccessPageKey[])
    : ([...CORE_SET] as AccessPageKey[]);
}

export function sanitizeMenuAccess(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const item of value) {
    const key = String(item ?? '').trim();
    if (ALL_ALLOWED.has(key)) unique.add(key);
  }
  return [...unique];
}

/** Keep only keys allowed by the account's service package. */
export function clipMenuAccessToPackage(
  keys: string[],
  modules?: string | null,
  packageName?: string | null,
): string[] {
  const allowed = new Set(pageKeysForModules(modules, packageName));
  return keys.filter((key) => allowed.has(key as AccessPageKey));
}
