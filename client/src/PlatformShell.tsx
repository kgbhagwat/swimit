import { useState, type ReactNode } from 'react';
import { PlatformNav } from './PlatformNav';

/** Top bar + left sidebar chrome for SaaS platform pages. */
export function PlatformShell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div
      className={`platform-shell${sidebarOpen ? '' : ' platform-shell--sidebar-collapsed'}`}
    >
      <PlatformNav
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
      />
      <div className="platform-shell-main">{children}</div>
    </div>
  );
}
