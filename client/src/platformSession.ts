const PLATFORM_SESSION_KEY = 'swimIT.platformSession';

/** Account code that opens SaaS platform management (not a pool app). */
export const SAAS_MANAGEMENT_CODE = 'swimit';

export type PlatformSession = {
  accountCode: string;
  accountId: number;
  accountName: string;
  userId: number;
  userName: string;
  menuAccess: string[];
  isAccountAdmin: boolean;
  csrfToken: string;
};

export function isSaasManagementCode(code: string) {
  return code.trim().toLowerCase() === SAAS_MANAGEMENT_CODE;
}

export function getPlatformSession(): PlatformSession | null {
  try {
    const raw = sessionStorage.getItem(PLATFORM_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PlatformSession;
    if (!parsed?.accountCode || !parsed?.userId || !parsed?.userName) return null;
    return {
      ...parsed,
      menuAccess: Array.isArray(parsed.menuAccess) ? parsed.menuAccess.map(String) : [],
      isAccountAdmin: Boolean(parsed.isAccountAdmin),
      csrfToken: String(parsed.csrfToken ?? ''),
    };
  } catch {
    return null;
  }
}

export function setPlatformSession(session: PlatformSession | null) {
  if (!session) {
    sessionStorage.removeItem(PLATFORM_SESSION_KEY);
    return;
  }
  sessionStorage.setItem(PLATFORM_SESSION_KEY, JSON.stringify(session));
}

export function clearPlatformSession() {
  sessionStorage.removeItem(PLATFORM_SESSION_KEY);
}
