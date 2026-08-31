import { isApplicationDemo } from './applicationDemo';
import { handleDemoApiRequest } from './demoApi';
import { getPlatformSession } from './platformSession';

const ACCOUNT_ID_KEY = 'swimIT.activeSaasAccountId';
const ACCOUNT_CODE_KEY = 'swimIT.activeAccountCode';
const PLATFORM_IMPERSONATION_KEY = 'swimIT.platformImpersonation';
const PUBLIC_ACCESS_TOKEN_KEY = 'swimIT.publicAccessToken';

export type PlatformImpersonation = {
  accountId: number;
  accountCode: string;
  accountName: string;
  platformUserId: number;
  platformUserName: string;
};

export function setActiveTenant(account: { id: number; accountCode: string } | null) {
  if (!account) {
    sessionStorage.removeItem(PUBLIC_ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(ACCOUNT_ID_KEY);
    sessionStorage.removeItem(ACCOUNT_CODE_KEY);
    return;
  }
  const code = account.accountCode.toLowerCase();
  const sameTenant =
    sessionStorage.getItem(ACCOUNT_ID_KEY) === String(account.id) &&
    sessionStorage.getItem(ACCOUNT_CODE_KEY) === code;
  if (!sameTenant) {
    sessionStorage.removeItem(PUBLIC_ACCESS_TOKEN_KEY);
  }
  sessionStorage.setItem(ACCOUNT_ID_KEY, String(account.id));
  sessionStorage.setItem(ACCOUNT_CODE_KEY, code);
}

export function setPublicAccessToken(token: string | null) {
  if (token) sessionStorage.setItem(PUBLIC_ACCESS_TOKEN_KEY, token);
  else sessionStorage.removeItem(PUBLIC_ACCESS_TOKEN_KEY);
}

export function getPlatformImpersonation(): PlatformImpersonation | null {
  try {
    const raw = sessionStorage.getItem(PLATFORM_IMPERSONATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PlatformImpersonation;
    if (
      !Number.isFinite(Number(parsed.accountId)) ||
      Number(parsed.accountId) <= 0 ||
      !/^[a-z0-9]{6}$/.test(String(parsed.accountCode ?? '')) ||
      !Number.isFinite(Number(parsed.platformUserId)) ||
      Number(parsed.platformUserId) <= 0
    ) {
      return null;
    }
    return {
      ...parsed,
      accountId: Number(parsed.accountId),
      platformUserId: Number(parsed.platformUserId),
    };
  } catch {
    return null;
  }
}

export function clearPlatformImpersonation() {
  sessionStorage.removeItem(PLATFORM_IMPERSONATION_KEY);
}

export async function startPlatformImpersonation(account: {
  id: number;
  accountCode: string;
  accountName: string;
}) {
  const code = String(account.accountCode ?? '').trim().toLowerCase();
  if (!/^[a-z0-9]{6}$/.test(code) || code === 'swimit') {
    throw new Error('A valid pool account is required');
  }
  const res = await fetch(`/api/auth/impersonate/${account.id}`, { method: 'POST' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? 'Failed to enter account');
  const returnedAccount = body.account as {
    id: number;
    accountCode: string;
    accountName: string;
  };
  const returnedUser = body.user as Record<string, unknown>;
  const platform = getPlatformSession();
  if (!platform) throw new Error('Platform session is unavailable');
  const impersonation: PlatformImpersonation = {
    accountId: Number(returnedAccount.id),
    accountCode: String(returnedAccount.accountCode).toLowerCase(),
    accountName: String(returnedAccount.accountName),
    platformUserId: platform.userId,
    platformUserName: platform.userName,
  };
  sessionStorage.setItem(PLATFORM_IMPERSONATION_KEY, JSON.stringify(impersonation));
  sessionStorage.setItem(
    `swimIT.accountSession.${code}`,
    JSON.stringify({
      ...returnedUser,
      csrfToken: String(body.csrfToken ?? ''),
    }),
  );
  setActiveTenant({ id: returnedAccount.id, accountCode: code });
  return `/${code}/dashboard`;
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

export const SESSION_TIMEOUT_EVENT = 'swimit:session-timeout';

export function sessionActivityKey(accountCode: string) {
  return `swimIT.sessionActivity.${accountCode.toLowerCase()}`;
}

export function touchSessionActivity(accountCode: string) {
  try {
    sessionStorage.setItem(sessionActivityKey(accountCode), String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function readSessionActivityAt(accountCode: string): number {
  try {
    const raw = sessionStorage.getItem(sessionActivityKey(accountCode));
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function clearSessionActivity(accountCode: string) {
  try {
    sessionStorage.removeItem(sessionActivityKey(accountCode));
  } catch {
    /* ignore */
  }
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

function activeCsrfToken() {
  const cookieToken = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('swimit_csrf='))
    ?.slice('swimit_csrf='.length);
  if (cookieToken) return decodeURIComponent(cookieToken);
  const code = getActiveAccountCode();
  const platform = getPlatformSession();
  if (
    code &&
    platform?.accountCode.toLowerCase() === code &&
    platform.csrfToken
  ) {
    return platform.csrfToken;
  }
  if (code) {
    try {
      const raw = sessionStorage.getItem(`swimIT.accountSession.${code}`);
      const parsed = raw ? (JSON.parse(raw) as { csrfToken?: string }) : null;
      if (parsed?.csrfToken) return parsed.csrfToken;
    } catch {
      /* ignore */
    }
  }
  return platform?.csrfToken ?? '';
}

/** Patch window.fetch for demo handling, CSRF, and scoped public access. */
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

    const headers = new Headers(init?.headers);
    const method = String(init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const csrfToken = activeCsrfToken();
      if (csrfToken) headers.set('X-CSRF-Token', csrfToken);
    }
    const publicToken = sessionStorage.getItem(PUBLIC_ACCESS_TOKEN_KEY);
    if (publicToken) headers.set('X-Public-Access-Token', publicToken);
    return original(input, { ...init, headers, credentials: 'same-origin' });
  };
}
