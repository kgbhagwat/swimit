export const ACCESS_PAGE_KEYS = [
  'create-user',
  'activity-log',
  'pool-core-info',
  'batches',
  'pass-types',
  'holiday-management',
  'pass-payment',
  'whatsapp',
  'pass-scanner',
  'coach-payment',
  'pool-expenses',
  'water-quality',
  'swimmer-progress',
  'progress-trend',
  'dashboard',
  'swimmers',
  'attendance-sheet',
  'coaches',
  'balance-sheet',
  'payment-details',
  'register',
  'staff-register',
] as const;

/** Optional edit grants for Information pages (stored alongside view keys in menu_access). */
export const INFORMATION_EDITABLE_PAGE_KEYS = ['swimmers', 'coaches'] as const;

export function editAccessKey(pageKey: string): string {
  return `${pageKey}-edit`;
}

export const EDIT_ACCESS_KEYS = INFORMATION_EDITABLE_PAGE_KEYS.map(editAccessKey);

export const COACH_LOGIN_PAGE_KEYS: readonly AccessPageKey[] = [
  'swimmer-progress',
  'progress-trend',
];

export type UserLoginType = 'normal' | 'coach';

export function parseLoginType(value: unknown): UserLoginType {
  return String(value ?? '').trim().toLowerCase() === 'coach' ? 'coach' : 'normal';
}

export function clipMenuAccessForLoginType(
  keys: string[],
  loginType: unknown,
  isAccountAdmin?: boolean,
): string[] {
  if (isAccountAdmin) return keys;
  if (parseLoginType(loginType) !== 'coach') return keys;
  const allowed = new Set<string>(COACH_LOGIN_PAGE_KEYS);
  return keys.filter((key) => allowed.has(key));
}

export function menuAccessForLoginType(
  keys: unknown,
  loginType: unknown,
  packageKeys: AccessPageKey[],
  isAccountAdmin?: boolean,
): string[] {
  if (isAccountAdmin) return clipMenuAccessToPackage(sanitizeMenuAccess(keys), packageKeys);
  if (parseLoginType(loginType) !== 'coach') {
    return clipMenuAccessToPackage(sanitizeMenuAccess(keys), packageKeys);
  }
  const allowed = new Set(packageKeys);
  return COACH_LOGIN_PAGE_KEYS.filter((key) => allowed.has(key));
}

/** SwimIT SaaS platform (swimit) staff access keys. */
export const PLATFORM_ACCESS_PAGE_KEYS = [
  'accounts',
  'create-account',
  'service-packages',
  'payment',
  'platform-users',
  'platform-create-user',
  'whatsapp',
  'server-monitor',
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
  'dashboard',
  'swimmers',
  'attendance-sheet',
  'pool-core-info',
  'coaches',
  'swimmer-progress',
  'progress-trend',
];

/** Extra pages for Professional / Enterprise (modules: full). */
export const FULL_ONLY_PAGE_KEYS: readonly AccessPageKey[] = [
  'coach-payment',
  'pool-expenses',
  'water-quality',
  'balance-sheet',
  'holiday-management',
  'whatsapp',
  'create-user',
  'activity-log',
  'payment-details',
];

const ALL_ALLOWED = new Set<string>([
  ...ACCESS_PAGE_KEYS,
  ...PLATFORM_ACCESS_PAGE_KEYS,
  ...EDIT_ACCESS_KEYS,
]);
const CORE_SET = new Set<string>(CORE_PAGE_KEYS);
const FULL_SET = new Set<string>([...CORE_PAGE_KEYS, ...FULL_ONLY_PAGE_KEYS]);
const EDITABLE_SET = new Set<string>(INFORMATION_EDITABLE_PAGE_KEYS);
const PLATFORM_SET = new Set<string>(PLATFORM_ACCESS_PAGE_KEYS);

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
  // Edit grants require the matching view page key.
  for (const pageKey of INFORMATION_EDITABLE_PAGE_KEYS) {
    const editKey = editAccessKey(pageKey);
    if (unique.has(editKey) && !unique.has(pageKey)) unique.delete(editKey);
  }
  return [...unique];
}

/** Keep only keys allowed by the account's service package. */
export function clipMenuAccessToPackage(
  keys: string[],
  allowedPageKeys: AccessPageKey[],
): string[] {
  const allowed = new Set(allowedPageKeys);
  return keys.filter((key) => {
    if (PLATFORM_SET.has(key)) return true;
    if (allowed.has(key as AccessPageKey)) return true;
    if (!key.endsWith('-edit')) return false;
    const pageKey = key.slice(0, -'-edit'.length);
    return EDITABLE_SET.has(pageKey) && allowed.has(pageKey as AccessPageKey);
  });
}
