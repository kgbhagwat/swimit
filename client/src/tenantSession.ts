import { isApplicationDemo } from './applicationDemo';
import { handleDemoApiRequest } from './demoApi';
import { getPlatformSession } from './platformSession';

const ACCOUNT_ID_KEY = 'swimIT.activeSaasAccountId';
const ACCOUNT_CODE_KEY = 'swimIT.activeAccountCode';

const PLATFORM_API_PREFIXES = [
  '/api/saas-accounts',
  '/api/service-packages',
  '/api/health',
];

export function setActiveTenant(account: { id: number; accountCode: string } | null) {
  if (!account) {
    sessionStorage.removeItem(ACCOUNT_ID_KEY);
    sessionStorage.removeItem(ACCOUNT_CODE_KEY);
    return;
  }
  sessionStorage.setItem(ACCOUNT_ID_KEY, String(account.id));
  sessionStorage.setItem(ACCOUNT_CODE_KEY, account.accountCode.toLowerCase());
}

export function getActiveSaasAccountId(): number | null {
  const raw = sessionStorage.getItem(ACCOUNT_ID_KEY);
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function getActiveAccountCode(): string | null {
  const code = sessionStorage.getItem(ACCOUNT_CODE_KEY);
  return code && /^[a-z0-9]{6}$/.test(code) ? code : null;
}

export function tenantPath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (isApplicationDemo()) {
    if (normalized === '/') return '/application/dashboard';
    return `/application${normalized}`;
  }
  const code = getActiveAccountCode();
  if (!code) return normalized;
  if (normalized === '/') return `/${code}/dashboard`;
  return `/${code}${normalized}`;
}

/** Paths for SaaS platform (swimit) staff pages under /platform. */
export function isPlatformUsersPath(pathname: string) {
  return pathname === '/platform' || pathname.startsWith('/platform/');
}

export function platformUsersPath(path: '/user-management' | '/create-user') {
  return `/platform${path}`;
}

function shouldAttachTenant(url: string) {
  if (!url.includes('/api/')) return false;
  return !PLATFORM_API_PREFIXES.some((prefix) => url.includes(prefix));
}

function tenantIdForRequest(url: string): number | null {
  // Platform support APIs must use the SwimIT staff account, never the pool target id.
  if (url.includes('/api/support/platform')) {
    const platform = getPlatformSession();
    if (platform?.accountId) return platform.accountId;
  }
  return getActiveSaasAccountId();
}

/** Patch window.fetch for Application demo mock + tenant header. */
export function installTenantFetch() {
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    const demoResponse = await handleDemoApiRequest(url, init);
    if (demoResponse) return demoResponse;

    if (!shouldAttachTenant(url)) {
      return original(input, init);
    }

    const accountId = tenantIdForRequest(url);
    if (accountId == null) {
      return original(input, init);
    }

    const headers = new Headers(init?.headers);
    headers.set('X-Saas-Account-Id', String(accountId));
    return original(input, { ...init, headers });
  };
}
