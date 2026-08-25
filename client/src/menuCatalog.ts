export type MenuSection =
  | 'Setup'
  | 'Operations'
  | 'Information'
  | 'Forms';

export type MenuPageKey =
  | 'user-management'
  | 'create-user'
  | 'register'
  | 'staff-register'
  | 'pass-payment'
  | 'dashboard'
  | 'swimmers'
  | 'pass-scanner'
  | 'attendance-sheet'
  | 'batches'
  | 'pass-types'
  | 'coaches'
  | 'coach-payment'
  | 'pool-expenses'
  | 'water-quality'
  | 'swimmer-progress'
  | 'balance-sheet'
  | 'payment-details'
  | 'progress-trend'
  | 'pool-core-info'
  | 'holiday-management'
  | 'whatsapp'
  | 'activity-log';

export type MenuPageDef = {
  key: MenuPageKey;
  section: MenuSection;
  to: string;
  label: string;
};

export const MENU_SECTIONS: MenuSection[] = [
  'Setup',
  'Operations',
  'Information',
  'Forms',
];

/** Pages that can be granted to users (User Management page itself stays admin-only). */
export const ACCESS_PAGES: MenuPageDef[] = [
  { key: 'pool-core-info', section: 'Setup', to: '/pool-core-info', label: 'Core Info' },
  { key: 'batches', section: 'Setup', to: '/batches', label: 'Batches' },
  { key: 'pass-types', section: 'Setup', to: '/pass-types', label: 'Pass Type' },
  { key: 'holiday-management', section: 'Setup', to: '/holiday-management', label: 'Holidays' },
  { key: 'create-user', section: 'Setup', to: '/user-management', label: 'User Management' },
  { key: 'activity-log', section: 'Setup', to: '/activity-log', label: 'Activity Log' },
  { key: 'pass-payment', section: 'Operations', to: '/pass-payment', label: 'Pass Payment' },
  { key: 'whatsapp', section: 'Operations', to: '/whatsapp', label: 'WhatsApp Broadcast' },
  { key: 'pass-scanner', section: 'Operations', to: '/pass-scanner', label: 'Pass Scanner' },
  { key: 'coach-payment', section: 'Operations', to: '/coach-payment', label: 'Coach Payment' },
  { key: 'pool-expenses', section: 'Operations', to: '/pool-expenses', label: 'Pool Expenses' },
  { key: 'water-quality', section: 'Operations', to: '/water-quality', label: 'Water Quality' },
  { key: 'swimmer-progress', section: 'Operations', to: '/swimmer-progress', label: 'Swimmer Progress' },
  { key: 'dashboard', section: 'Information', to: '/dashboard', label: 'Dashboard' },
  { key: 'swimmers', section: 'Information', to: '/swimmers', label: "Swimmer's List" },
  { key: 'attendance-sheet', section: 'Information', to: '/attendance-sheet', label: 'Attendance Sheet' },
  { key: 'coaches', section: 'Information', to: '/coaches', label: 'Staff List' },
  { key: 'balance-sheet', section: 'Information', to: '/balance-sheet', label: 'Balance Sheet' },
  { key: 'payment-details', section: 'Information', to: '/payment-details', label: 'Payment Details' },
  { key: 'progress-trend', section: 'Information', to: '/progress-trend', label: 'Progress Trend' },
  { key: 'register', section: 'Forms', to: '/register', label: 'Registration form' },
  { key: 'staff-register', section: 'Forms', to: '/staff-register', label: 'Staff registration' },
];

export const ALL_PAGE_KEYS = ACCESS_PAGES.map((page) => page.key);

/** Pages granted to Coach login type (not editable in User Management). */
export const COACH_LOGIN_PAGE_KEYS: MenuPageKey[] = ['swimmer-progress', 'progress-trend'];

export type UserLoginType = 'normal' | 'coach';

export function parseLoginType(value: unknown): UserLoginType {
  return String(value ?? '').trim().toLowerCase() === 'coach' ? 'coach' : 'normal';
}

/** Pages included in Trial / Starter (modules: core). */
export const CORE_PAGE_KEYS: MenuPageKey[] = [
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
export const FULL_ONLY_PAGE_KEYS: MenuPageKey[] = [
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

/** Menu page keys allowed for a service package. */
export function pageKeysForModules(
  modules?: string | null,
  packageName?: string | null,
): MenuPageKey[] {
  if (resolvePackageModules(modules, packageName) === 'full') {
    return [...CORE_PAGE_KEYS, ...FULL_ONLY_PAGE_KEYS];
  }
  return [...CORE_PAGE_KEYS];
}

export function isMenuSection(value: unknown): value is MenuSection {
  return typeof value === 'string' && MENU_SECTIONS.includes(value as MenuSection);
}

export function pagesBySection(section: MenuSection) {
  return ACCESS_PAGES.filter((page) => page.section === section);
}

/** Information pages that support an optional Edit grant (view alone is read-only). */
export const INFORMATION_EDITABLE_PAGE_KEYS: MenuPageKey[] = ['swimmers', 'coaches'];

export function editAccessKey(pageKey: MenuPageKey): string {
  return `${pageKey}-edit`;
}

export function isEditAccessKey(key: string): boolean {
  return key.endsWith('-edit') && INFORMATION_EDITABLE_PAGE_KEYS.some((page) => editAccessKey(page) === key);
}

export function pageKeyFromEditAccess(key: string): MenuPageKey | null {
  if (!key.endsWith('-edit')) return null;
  const pageKey = key.slice(0, -'-edit'.length) as MenuPageKey;
  return INFORMATION_EDITABLE_PAGE_KEYS.includes(pageKey) ? pageKey : null;
}

export function canEditMenuPage(
  menuAccess: string[] | undefined,
  pageKey: MenuPageKey,
  isAccountAdmin?: boolean,
): boolean {
  if (isAccountAdmin) return true;
  if (!INFORMATION_EDITABLE_PAGE_KEYS.includes(pageKey)) return false;
  const keys = menuAccess ?? [];
  return keys.includes(pageKey) && keys.includes(editAccessKey(pageKey));
}

const MENU_SECTION_STORAGE_KEY = 'swimIT.menuSection';

export function readStoredMenuSection(): MenuSection | null {
  try {
    const value = sessionStorage.getItem(MENU_SECTION_STORAGE_KEY);
    // Former top-level section — now nested under Setup.
    if (value === 'User Management') return 'Setup';
    return isMenuSection(value) ? value : null;
  } catch {
    return null;
  }
}

export function storeMenuSection(section: MenuSection) {
  try {
    sessionStorage.setItem(MENU_SECTION_STORAGE_KEY, section);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Strip `/application` or `/{accountCode}` prefix to get the feature path (`/batches`, etc.). */
export function featurePathFromLocation(pathname: string): string {
  if (pathname === '/application' || pathname.startsWith('/application/')) {
    const rest = pathname.slice('/application'.length);
    return rest || '/';
  }
  const tenantMatch = pathname.match(/^\/[a-z0-9]{6}(\/.*)?$/i);
  if (tenantMatch) {
    return tenantMatch[1] || '/';
  }
  return pathname;
}

export function sectionForPath(pathname: string): MenuSection | null {
  const path = featurePathFromLocation(pathname);
  // Top-level sidebar entry — not nested under a section accordion.
  if (path === '/dashboard' || path.startsWith('/dashboard/')) {
    return null;
  }
  if (path === '/user-management' || path.startsWith('/user-management/')) {
    return 'Setup';
  }
  if (path === '/create-user' || path.startsWith('/create-user/')) {
    return 'Setup';
  }
  const exact = ACCESS_PAGES.find((page) => page.to === path);
  if (exact) return exact.section;
  const nested = ACCESS_PAGES.find((page) => path.startsWith(`${page.to}/`));
  return nested?.section ?? null;
}

/** Restores the menu section the user last had open. */
export function menuBackState(pathname?: string): { section: MenuSection } {
  return {
    section:
      readStoredMenuSection() ??
      (pathname ? sectionForPath(pathname) : null) ??
      'Setup',
  };
}
