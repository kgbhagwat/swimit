export const ACCESS_PAGE_KEYS = [
  'create-user',
  'batches',
  'pass-types',
  'pool-core-info',
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
  'register',
  'staff-register',
] as const;

/** SwimIT SaaS platform (swimit) staff access keys. */
export const PLATFORM_ACCESS_PAGE_KEYS = [
  'accounts',
  'create-account',
  'service-packages',
  'platform-users',
  'platform-create-user',
] as const;

export type AccessPageKey = (typeof ACCESS_PAGE_KEYS)[number];
export type PlatformAccessPageKey = (typeof PLATFORM_ACCESS_PAGE_KEYS)[number];

const ALL_ALLOWED = new Set<string>([...ACCESS_PAGE_KEYS, ...PLATFORM_ACCESS_PAGE_KEYS]);

export function sanitizeMenuAccess(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const item of value) {
    const key = String(item ?? '').trim();
    if (ALL_ALLOWED.has(key)) unique.add(key);
  }
  return [...unique];
}
