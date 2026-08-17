import { useLayoutEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LanguageSwitcher, useT } from './i18n';
import { PlatformLoginModal, type PlatformLoginFormState } from './PlatformLoginModal';
import { clearPlatformSession, getPlatformSession } from './platformSession';
import { ThemeToggle, useTheme } from './theme';
import { setActiveTenant } from './tenantSession';

const NAV_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/features', label: 'Features', end: false },
  { to: '/service-packages', label: 'Pricing', end: false },
] as const;

export function MarketingLayout({ children }: { children: ReactNode }) {
  const t = useT();
  const location = useLocation();
  const navigate = useNavigate();
  const { setTheme } = useTheme();
  const platformSession = getPlatformSession();
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginForm, setLoginForm] = useState<PlatformLoginFormState>({
    accountCode: '',
    userName: 'admin',
    password: '',
  });

  /* Home always opens in light mode; user can still switch to dark with the toggle. */
  useLayoutEffect(() => {
    if (location.pathname === '/' || location.pathname === '/home') {
      setTheme('light');
    }
  }, [location.pathname, setTheme]);

  function onLogout() {
    clearPlatformSession();
    setActiveTenant(null);
    navigate('/');
  }

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
          {platformSession ? (
            <>
              <Link to="/accounts" className="marketing-btn marketing-btn--ghost">
                {t('Accounts')}
              </Link>
              <button
                type="button"
                className="marketing-btn marketing-btn--primary"
                onClick={onLogout}
              >
                {t('Logout')}
              </button>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </header>

      <main className="marketing-main">{children}</main>

      {!platformSession ? (
        <PlatformLoginModal
          open={loginOpen}
          onClose={() => setLoginOpen(false)}
          form={loginForm}
          onFormChange={(patch) => setLoginForm((prev) => ({ ...prev, ...patch }))}
        />
      ) : null}
    </div>
  );
}
