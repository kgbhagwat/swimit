import { useState, type ReactNode } from 'react';
import { useT } from './i18n';
import { PlatformNav } from './PlatformNav';

/** Top bar + left sidebar chrome for SaaS platform pages. */
export function PlatformShell({ children }: { children: ReactNode }) {
  const t = useT();
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !window.matchMedia('(max-width: 800px)').matches;
  });

  function closeMobileMenu() {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 800px)').matches) {
      setSidebarOpen(false);
    }
  }

  return (
    <div
      className={`platform-shell${sidebarOpen ? '' : ' platform-shell--sidebar-collapsed'}`}
    >
      {sidebarOpen ? (
        <button
          type="button"
          className="platform-sidebar-backdrop"
          aria-label={t('Close menu')}
          onClick={closeMobileMenu}
        />
      ) : null}
      <PlatformNav
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
        onNavigate={closeMobileMenu}
      />
      <div className="platform-shell-main">{children}</div>
    </div>
  );
}
