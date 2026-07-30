import { canEditMenuPage, type MenuPageKey } from './menuCatalog';
import { getActiveAccountCode } from './tenantSession';

type SessionAccess = {
  menuAccess: string[];
  isAccountAdmin: boolean;
};

function sessionKey(code: string) {
  return `swimIT.accountSession.${code}`;
}

export function readTenantSessionAccess(): SessionAccess | null {
  const code = getActiveAccountCode();
  if (!code) return null;
  try {
    const raw = sessionStorage.getItem(sessionKey(code));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      menuAccess?: string[];
      isAccountAdmin?: boolean;
    };
    return {
      menuAccess: Array.isArray(parsed.menuAccess) ? parsed.menuAccess.map(String) : [],
      isAccountAdmin: Boolean(parsed.isAccountAdmin),
    };
  } catch {
    return null;
  }
}

/** True when the signed-in user may update records on an Information page. */
export function canEditPage(pageKey: MenuPageKey): boolean {
  const session = readTenantSessionAccess();
  if (!session) {
    // Demo / no login session: keep existing full UI behaviour.
    return true;
  }
  return canEditMenuPage(session.menuAccess, pageKey, session.isAccountAdmin);
}
