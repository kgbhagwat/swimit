import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { LanguageSwitcher, useT } from './i18n';
import { PlatformLoginModal, type PlatformLoginFormState } from './PlatformLoginModal';
import { ThemeToggle, useTheme } from './theme';

const NAV_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/features', label: 'Features', end: false },
  { to: '/service-packages', label: 'Pricing', end: false },
] as const;

export function MarketingLayout({ children }: { children: ReactNode }) {
  const t = useT();
  const location = useLocation();
  const { setTheme } = useTheme();
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginForm, setLoginForm] = useState<PlatformLoginFormState>({
    accountCode: '',
    userName: 'admin',
    password: '',
  });

  /* Home always opens in light mode; user can still switch to dark with the toggle. */
  useEffect(() => {
    if (location.pathname === '/' || location.pathname === '/home') {
      setTheme('light');
    }
  }, [location.pathname, setTheme]);

  return (
    <div className="marketing-site">
      <header className="marketing-nav">
        <Link to="/" className="marketing-brand">
          <img
            src="/swimit-wordmark.png"
            alt="SwimIT — Swimming Pool Management System"
            className="marketing-brand-logo"
          />
        </Link>

        <nav className="marketing-nav-links" aria-label={t('Home')}>
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `marketing-nav-link${isActive ? ' is-active' : ''}`
              }
            >
              {t(link.label)}
            </NavLink>
          ))}
        </nav>

        <div className="marketing-nav-actions">
          <ThemeToggle />
          <LanguageSwitcher />
          <button
            type="button"
            className="marketing-btn marketing-btn--ghost"
            onClick={() => setLoginOpen(true)}
          >
            {t('Login')}
          </button>
          <Link to="/create-account" className="marketing-btn marketing-btn--primary">
            {t('Get Started')}
          </Link>
        </div>
      </header>

      <main className="marketing-main">{children}</main>

      <PlatformLoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        form={loginForm}
        onFormChange={(patch) => setLoginForm((prev) => ({ ...prev, ...patch }))}
      />
    </div>
  );
}
