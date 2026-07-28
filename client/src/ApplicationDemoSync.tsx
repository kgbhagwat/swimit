import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  enterApplicationDemo,
  exitApplicationDemo,
  isApplicationDemo,
  isApplicationDemoPath,
} from './applicationDemo';
import { setActiveTenant } from './tenantSession';

/** Bind Application preview to the seeded SwimIT SaaS account for live APIs (WhatsApp, etc.). */
async function bindApplicationTenant() {
  try {
    const res = await fetch('/api/saas-accounts/by-code/swimit');
    if (!res.ok) return;
    const body = (await res.json()) as { id?: number; accountCode?: string };
    if (body.id && body.accountCode) {
      setActiveTenant({ id: Number(body.id), accountCode: String(body.accountCode) });
    }
  } catch {
    // ignore — WhatsApp status still works without tenant
  }
}

/** Keeps Application demo mode in sync with the current route; clears data on leave. */
export function ApplicationDemoSync() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    if (isApplicationDemoPath(pathname)) {
      if (!isApplicationDemo()) {
        enterApplicationDemo();
      }
      void bindApplicationTenant();
      return;
    }
    if (isApplicationDemo()) {
      exitApplicationDemo();
    }
  }, [pathname]);

  return null;
}

/** Banner shown while using the ephemeral Application sandbox. */
export function ApplicationDemoBanner() {
  return null;
}
