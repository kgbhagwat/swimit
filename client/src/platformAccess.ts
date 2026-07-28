/** SaaS platform (swimit) menus grantable in platform User Management. */

export type PlatformAccessSection = 'Account management' | 'Packages' | 'Staff users';

export type PlatformAccessPageKey =
  | 'accounts'
  | 'create-account'
  | 'service-packages'
  | 'platform-users'
  | 'platform-create-user';

export type PlatformAccessPageDef = {
  key: PlatformAccessPageKey;
  section: PlatformAccessSection;
  to: string;
  label: string;
};

export const PLATFORM_ACCESS_SECTIONS: PlatformAccessSection[] = [
  'Account management',
  'Packages',
  'Staff users',
];

export const PLATFORM_ACCESS_PAGES: PlatformAccessPageDef[] = [
  {
    key: 'accounts',
    section: 'Account management',
    to: '/accounts',
    label: 'Accounts',
  },
  {
    key: 'create-account',
    section: 'Account management',
    to: '/create-account',
    label: 'Create Account',
  },
  {
    key: 'service-packages',
    section: 'Packages',
    to: '/service-packages',
    label: 'Service Packages',
  },
  {
    key: 'platform-users',
    section: 'Staff users',
    to: '/platform/user-management',
    label: 'User Management',
  },
  {
    key: 'platform-create-user',
    section: 'Staff users',
    to: '/platform/create-user',
    label: 'Create User',
  },
];

export const PLATFORM_ACCESS_PAGE_KEYS = PLATFORM_ACCESS_PAGES.map((page) => page.key);

export function platformPagesBySection(section: PlatformAccessSection) {
  return PLATFORM_ACCESS_PAGES.filter((page) => page.section === section);
}

export function hasPlatformAccess(
  menuAccess: string[] | undefined,
  key: PlatformAccessPageKey,
  isAccountAdmin?: boolean,
) {
  if (isAccountAdmin) return true;
  return (menuAccess ?? []).includes(key);
}
