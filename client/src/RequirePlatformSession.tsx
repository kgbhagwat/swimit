import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { getPlatformSession } from './platformSession';

/** Redirects to Home unless SwimIT SaaS (swimit) session is active. */
export function RequirePlatformSession({ children }: { children: ReactNode }) {
  if (!getPlatformSession()) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
