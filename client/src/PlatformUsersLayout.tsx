import { Outlet } from 'react-router-dom';
import { PlatformShell } from './PlatformShell';
import { getPlatformSession } from './platformSession';
import { getActiveSaasAccountId, setActiveTenant } from './tenantSession';

/** SaaS platform user pages: bind API tenant to the logged-in swimit account. */
export function PlatformUsersLayout() {
  const session = getPlatformSession();
  if (session && getActiveSaasAccountId() !== session.accountId) {
    setActiveTenant({
      id: session.accountId,
      accountCode: session.accountCode,
    });
  }

  return (
    <PlatformShell>
      <Outlet />
    </PlatformShell>
  );
}
