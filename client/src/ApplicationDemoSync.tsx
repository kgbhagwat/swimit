import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  enterApplicationDemo,
  exitApplicationDemo,
  isApplicationDemo,
  isApplicationDemoPath,
} from './applicationDemo';

/** Keeps Application demo mode in sync with the current route; clears data on leave. */
export function ApplicationDemoSync() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    if (isApplicationDemoPath(pathname)) {
      if (!isApplicationDemo()) {
        enterApplicationDemo();
      }
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
