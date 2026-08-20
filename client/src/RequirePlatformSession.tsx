import { Navigate } from 'react-router-dom';
import { useEffect, useState, type ReactNode } from 'react';
import {
  clearPlatformSession,
  getPlatformSession,
  setPlatformSession,
} from './platformSession';

/** Redirects to Home unless SwimIT SaaS (swimit) session is active. */
export function RequirePlatformSession({ children }: { children: ReactNode }) {
  const [valid, setValid] = useState<boolean | null>(() =>
    getPlatformSession() ? null : false,
  );

  useEffect(() => {
    const stored = getPlatformSession();
    if (!stored) {
      setValid(false);
      return;
    }
    let cancelled = false;
    void fetch('/api/auth/session')
      .then(async (res) => ({ ok: res.ok, body: await res.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (ok && body.auth?.kind === 'platform') {
          setPlatformSession({ ...stored, csrfToken: String(body.csrfToken ?? '') });
          setValid(true);
        } else {
          clearPlatformSession();
          setValid(false);
        }
      })
      .catch(() => {
        if (!cancelled) setValid(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (valid === null) return null;
  if (!valid) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
