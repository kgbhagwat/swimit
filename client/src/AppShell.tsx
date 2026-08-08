import { FormEvent, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useOutlet } from 'react-router-dom';
import {
  ACCESS_PAGES,
  ALL_PAGE_KEYS,
  featurePathFromLocation,
  isMenuSection,
  MENU_SECTIONS,
  pageKeysForModules,
  pagesBySection,
  readStoredMenuSection,
  resolvePackageModules,
  sectionForPath,
  storeMenuSection,
  type MenuPageKey,
  type MenuSection,
} from './menuCatalog';
import { LanguageSwitcher, useT } from './i18n';
import { MENU_ITEMS, MenuTiles, type MenuItem } from './menuItems';
import { PassPopupOverlay } from './PassPopupOverlay';
import { PlatformNav } from './PlatformNav';
import { PlatformPage } from './PlatformPage';
import { SupportInboxButton } from './SupportInboxButton';
import { setActiveTenant } from './tenantSession';
import { isPassPopupWindow } from './swimmerPass';

export type TenantUserInfo = {
  id: number;
  userName: string;
  mobile?: string;
  menuAccess?: string[];
  isAccountAdmin?: boolean;
};

function PasswordEyeIcon({ visible }: { visible: boolean }) {
  if (visible) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M3 3l18 18" />
        <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
        <path d="M9.9 5.2A10.4 10.4 0 0 1 12 5c5 0 8.5 4.2 9.7 6.1a1.4 1.4 0 0 1 0 1.6c-.5.8-1.6 2.3-3.3 3.6" />
        <path d="M6.1 6.1C4.5 7.3 3.4 8.8 2.9 9.6a1.4 1.4 0 0 0 0 1.6C4.1 13.2 7.6 17 12 17c1.1 0 2.1-.2 3.1-.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M2.9 11.2a1.4 1.4 0 0 0 0 1.6C4.1 14.7 7.6 19 12 19s7.9-4.3 9.1-6.2a1.4 1.4 0 0 0 0-1.6C19.9 9.3 16.4 5 12 5S4.1 9.3 2.9 11.2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function TenantUserBar({
  account,
  user,
  onLogout,
}: {
  account: { accountName: string; accountCode: string; packageName?: string };
  user?: TenantUserInfo | null;
  onLogout?: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saasPayment, setSaasPayment] = useState<{
    paymentQrPath: string | null;
    upiId: string;
  } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user?.isAccountAdmin) {
      setSaasPayment(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/platform-payment');
        const body = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const paymentQrPath = body.paymentQrPath ? String(body.paymentQrPath) : null;
        const upiId = String(body.upiId ?? '').trim();
        if (!paymentQrPath && !upiId) {
          setSaasPayment(null);
          return;
        }
        setSaasPayment({ paymentQrPath, upiId });
      } catch {
        if (!cancelled) setSaasPayment(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.isAccountAdmin]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setChangingPassword(false);
        setError('');
        setSuccess('');
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  function resetPasswordForm() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    setError('');
    setSuccess('');
  }

  function createDesktopShortcut() {
    setError('');
    setSuccess('');
    const code = account.accountCode.toLowerCase();
    const loginUrl = `${window.location.origin}/${code}`;
    const safeName =
      account.accountName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim() || `SwimIT-${code}`;
    const content = `[InternetShortcut]\r\nURL=${loginUrl}\r\nIconIndex=0\r\n`;
    const blob = new Blob([content], { type: 'application/internet-shortcut' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `${safeName}.url`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
    setSuccess('Shortcut downloaded. Move it to your Desktop for quick access.');
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError('');
    setSuccess('');
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match');
      return;
    }
    if (currentPassword === newPassword) {
      setError('New password must be different from the current password');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(
        `/api/saas-accounts/by-code/${encodeURIComponent(account.accountCode)}/change-password`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            currentPassword,
            newPassword,
          }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to change password');
      resetPasswordForm();
      setSuccess('Password updated.');
      setChangingPassword(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <div className="tenant-user-bar" ref={ref}>
      <button
        type="button"
        className="tenant-profile-btn"
        aria-label={t('User settings')}
        aria-expanded={open}
        onClick={() => {
          setOpen((prev) => !prev);
          setChangingPassword(false);
          setError('');
          setSuccess('');
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M4 20c1.5-4 4.2-6 8-6s6.5 2 8 6" />
        </svg>
      </button>

      {onLogout ? (
        <button
          type="button"
          className="tenant-signout-btn"
          onClick={onLogout}
          aria-label={t('Sign out')}
          title={t('Sign out')}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
            <path d="M9 12h12" />
            <path d="M17 8l4 4-4 4" />
          </svg>
        </button>
      ) : null}

      {open ? (
        <div className="tenant-profile-dropdown">
          <p className="tenant-profile-name">{user.userName}</p>
          <p className="tenant-profile-detail">
            {t('Account')}: <strong>{account.accountName}</strong>
          </p>
          <p className="tenant-profile-detail">
            {t('Code')}: <code>{account.accountCode}</code>
          </p>
          <p className="tenant-profile-detail">
            Role: {user.isAccountAdmin ? 'Admin' : 'User'}
          </p>
          {user.isAccountAdmin && account.packageName ? (
            <p className="tenant-profile-detail">
              Package: <strong>{account.packageName}</strong>
            </p>
          ) : null}
          {user.isAccountAdmin && saasPayment ? (
            <div className="tenant-saas-payment">
              <p className="tenant-profile-detail">
                <strong>Pay SwimIT subscription</strong>
              </p>
              {saasPayment.paymentQrPath ? (
                <img
                  src={`/uploads/${saasPayment.paymentQrPath}`}
                  alt="SwimIT payment QR code"
                  className="tenant-saas-payment-qr"
                />
              ) : null}
              {saasPayment.upiId ? (
                <p className="tenant-profile-detail">
                  UPI: <code>{saasPayment.upiId}</code>
                </p>
              ) : null}
            </div>
          ) : null}

          {!changingPassword ? (
            <div className="tenant-profile-actions">
              <button
                type="button"
                className="tenant-profile-action"
                onClick={() => {
                  resetPasswordForm();
                  setChangingPassword(true);
                }}
              >
                Change password
              </button>
              <button
                type="button"
                className="tenant-profile-action"
                onClick={createDesktopShortcut}
              >
                Create shortcut
              </button>
            </div>
          ) : (
            <form className="tenant-password-form" onSubmit={onChangePassword}>
              <label className="field">
                <span className="label">Current password</span>
                <div className="password-input-wrap">
                  <input
                    type={showCurrent ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="password-eye"
                    onClick={() => setShowCurrent((v) => !v)}
                    aria-label={showCurrent ? 'Hide password' : 'View password'}
                  >
                    <PasswordEyeIcon visible={showCurrent} />
                  </button>
                </div>
              </label>
              <label className="field">
                <span className="label">New password</span>
                <div className="password-input-wrap">
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={6}
                    required
                  />
                  <button
                    type="button"
                    className="password-eye"
                    onClick={() => setShowNew((v) => !v)}
                    aria-label={showNew ? 'Hide password' : 'View password'}
                  >
                    <PasswordEyeIcon visible={showNew} />
                  </button>
                </div>
              </label>
              <label className="field">
                <span className="label">Confirm new password</span>
                <div className="password-input-wrap">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={6}
                    required
                  />
                  <button
                    type="button"
                    className="password-eye"
                    onClick={() => setShowConfirm((v) => !v)}
                    aria-label={showConfirm ? 'Hide password' : 'View password'}
                  >
                    <PasswordEyeIcon visible={showConfirm} />
                  </button>
                </div>
              </label>
              {error ? <p className="error">{error}</p> : null}
              <div className="tenant-password-actions">
                <button
                  type="button"
                  className="terms-link"
                  onClick={() => {
                    setChangingPassword(false);
                    resetPasswordForm();
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="csv-btn" disabled={saving}>
                  {saving ? 'Saving…' : 'Save password'}
                </button>
              </div>
            </form>
          )}

          {success ? <p className="success tenant-profile-success">{success}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export type AppShellProps = {
  tenantAccount?: {
    id: number;
    accountName: string;
    accountCode: string;
    packageName?: string;
    modules?: string;
  } | null;
  tenantUser?: TenantUserInfo | null;
  onTenantLogout?: () => void;
  /** Matched feature page from AccountPortal's useOutlet(); omit for /application layout. */
  featurePage?: ReactNode;
  children?: ReactNode;
};

/** Pool app chrome: sidebar sections + top bar; feature pages render in the main pane. */
export function AppShell({
  tenantAccount,
  tenantUser,
  onTenantLogout,
  featurePage,
  children,
}: AppShellProps = {}) {
  const t = useT();
  const location = useLocation();
  const navigate = useNavigate();
  const routeOutlet = useOutlet();
  const featurePath = featurePathFromLocation(location.pathname);
  /** Section overview (Setup / Operations / …) — not Dashboard. */
  const onSectionMenu = featurePath === '/' || featurePath === '/menu';
  const pageContent = onSectionMenu
    ? null
    : featurePage !== undefined
      ? featurePage
      : (children ?? routeOutlet);
  const sectionFromNav = (location.state as { section?: unknown } | null)?.section;

  const homePath = tenantAccount?.accountCode
    ? `/${tenantAccount.accountCode.toLowerCase()}`
    : '/application';

  const [section, setSection] = useState<MenuSection>(() => {
    return isMenuSection(sectionFromNav)
      ? sectionFromNav
      : (readStoredMenuSection() ?? 'Setup');
  });
  /** Which sidebar accordion is open; null on Dashboard until the user opens one. */
  const [expandedSection, setExpandedSection] = useState<MenuSection | null>(null);

  function appPath(path: string) {
    return `${homePath}${path}`;
  }

  const allowedKeys = useMemo<Set<MenuPageKey>>(() => {
    if (!tenantAccount || !tenantUser) return new Set<MenuPageKey>();
    const packageKeys = new Set(
      pageKeysForModules(tenantAccount.modules, tenantAccount.packageName),
    );
    if (tenantUser.isAccountAdmin) return packageKeys;

    const next = new Set<MenuPageKey>();
    for (const k of tenantUser.menuAccess ?? []) {
      const key = k as MenuPageKey;
      if (packageKeys.has(key) && ALL_PAGE_KEYS.includes(key)) next.add(key);
    }
    return next;
  }, [tenantAccount, tenantUser]);

  const packageIsFull = useMemo(
    () =>
      resolvePackageModules(tenantAccount?.modules, tenantAccount?.packageName) === 'full',
    [tenantAccount?.modules, tenantAccount?.packageName],
  );

  const allowedSections = useMemo(() => {
    if (!tenantAccount) return new Set<MenuSection>();
    const set = new Set<MenuSection>();
    for (const name of MENU_SECTIONS) {
      const pages = pagesBySection(name);
      if (pages.some((p) => allowedKeys.has(p.key))) set.add(name);
    }
    // Setup always includes User Management for account admins on full packages.
    if (tenantUser?.isAccountAdmin && packageIsFull) {
      set.add('Setup');
    }
    return set;
  }, [tenantAccount, tenantUser, allowedKeys, packageIsFull]);

  const firstAllowedSection = useMemo(() => {
    return (allowedSections.values().next().value ?? 'Setup') as MenuSection;
  }, [allowedSections]);

  useEffect(() => {
    if (tenantAccount) {
      setActiveTenant({
        id: tenantAccount.id,
        accountCode: tenantAccount.accountCode,
      });
    } else {
      setActiveTenant(null);
    }
  }, [tenantAccount]);

  useEffect(() => {
    if (!tenantAccount) return;
    if (!allowedSections.has(section)) {
      setSection(firstAllowedSection);
    }
  }, [tenantAccount, allowedSections, section, firstAllowedSection]);

  useEffect(() => {
    if (!isMenuSection(sectionFromNav)) return;
    if (tenantAccount && !allowedSections.has(sectionFromNav)) {
      setSection(firstAllowedSection);
      return;
    }
    setSection(sectionFromNav);
  }, [sectionFromNav, location.key, tenantAccount, allowedSections, firstAllowedSection]);

  useEffect(() => {
    storeMenuSection(section);
  }, [section]);

  const pathSection = sectionForPath(location.pathname);
  const dashboardActive = featurePath === '/dashboard' || featurePath.startsWith('/dashboard/');

  useEffect(() => {
    if (pathSection) {
      if (tenantAccount && !allowedSections.has(pathSection)) return;
      setSection(pathSection);
      setExpandedSection(pathSection);
      return;
    }
    if (dashboardActive) {
      setExpandedSection(null);
    }
  }, [pathSection, dashboardActive, tenantAccount, allowedSections]);

  const visibleItems = useMemo(
    () =>
      MENU_ITEMS.filter((item) => {
        if (item.section !== section) return false;
        if (item.to === '/dashboard') return false;
        if (item.to === '/user-management') {
          if (!tenantAccount || !tenantUser) return true;
          return Boolean(tenantUser.isAccountAdmin) && packageIsFull;
        }
        const page = ACCESS_PAGES.find((p) => p.to === item.to);
        if (!page) return true;
        return tenantAccount && tenantUser ? allowedKeys.has(page.key) : true;
      }),
    [section, tenantAccount, tenantUser, allowedKeys, packageIsFull],
  );

  function itemsForSection(name: MenuSection): MenuItem[] {
    return MENU_ITEMS.filter((item) => {
      if (item.section !== name) return false;
      // Dashboard is a top-level sidebar link, not under Information.
      if (item.to === '/dashboard') return false;
      if (item.to === '/user-management') {
        if (!tenantAccount || !tenantUser) return true;
        return Boolean(tenantUser.isAccountAdmin) && packageIsFull;
      }
      const page = ACCESS_PAGES.find((p) => p.to === item.to);
      if (!page) return true;
      return tenantAccount && tenantUser ? allowedKeys.has(page.key) : true;
    });
  }

  const canOpenDashboard =
    !tenantAccount || !tenantUser || allowedKeys.has('dashboard');

  function onSectionClick(name: MenuSection) {
    if (tenantAccount && tenantUser && !allowedSections.has(name)) return;
    setSection(name);
    setExpandedSection(name);
    navigate(appPath('/menu'), { state: { section: name } });
  }

  function isItemActive(item: MenuItem) {
    return (
      featurePath === item.to ||
      featurePath.startsWith(`${item.to}/`)
    );
  }

  const sectionTabs = tenantAccount
    ? MENU_SECTIONS.filter((s) => allowedSections.has(s))
    : MENU_SECTIONS;

  const passPopupOnly = isPassPopupWindow();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [appSidebarOpen, setAppSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !window.matchMedia('(max-width: 800px)').matches;
  });
  const [appFullscreen, setAppFullscreen] = useState(() => {
    try {
      return sessionStorage.getItem('swimIT.applicationPreviewFullscreen') === '1';
    } catch {
      return false;
    }
  });

  function isMobileMenu() {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 800px)').matches;
  }

  function closeMobileMenu() {
    if (isMobileMenu()) setAppSidebarOpen(false);
  }

  useEffect(() => {
    if (tenantAccount) return;
    try {
      sessionStorage.setItem(
        'swimIT.applicationPreviewFullscreen',
        appFullscreen ? '1' : '0',
      );
    } catch {
      /* ignore */
    }
  }, [appFullscreen, tenantAccount]);

  if (passPopupOnly) {
    return (
      <div className="pass-popup-shell">
        {pageContent}
        <PassPopupOverlay />
      </div>
    );
  }

  const homeBody =
    pageContent ??
    (onSectionMenu ? (
      <PlatformPage title={section}>
        <MenuTiles items={visibleItems} section={section} />
      </PlatformPage>
    ) : (
      <PlatformPage title="Not found">
        <p className="error">Page not found ({featurePath}).</p>
      </PlatformPage>
    ));

  const poolMenu = (
    <>
      {appSidebarOpen ? (
        <button
          type="button"
          className="platform-sidebar-backdrop"
          aria-label={t('Close menu')}
          onClick={closeMobileMenu}
        />
      ) : null}
      <nav
        id="pool-app-sidebar"
        className={`platform-sidebar${appSidebarOpen ? '' : ' platform-sidebar--hidden'}`}
        aria-label={t('Pool menu')}
      >
        <div className="platform-sidebar-brand">
          <img
            src="/swimit-logo.png"
            alt="SwimIT — Swimming Pool Management System"
            className="platform-sidebar-logo"
          />
        </div>
        <ul className="platform-sidebar-list">
          {canOpenDashboard ? (
            <li className="platform-sidebar-group">
              <Link
                className={`platform-sidebar-link${dashboardActive ? ' active' : ''}`}
                to={appPath('/dashboard')}
                aria-current={dashboardActive ? 'page' : undefined}
                onClick={closeMobileMenu}
              >
                <span className="platform-sidebar-link-label">{t('Dashboard')}</span>
              </Link>
            </li>
          ) : null}
          {sectionTabs.map((name) => {
            const children = itemsForSection(name);
            const expanded = expandedSection === name;
            const active = pathSection === name || (onSectionMenu && section === name);
            return (
              <li key={name} className="platform-sidebar-group">
                <button
                  type="button"
                  className={`platform-sidebar-link platform-sidebar-section${active ? ' active' : ''}`}
                  aria-expanded={expanded}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => onSectionClick(name)}
                >
                  <span className="platform-sidebar-link-label">{t(name)}</span>
                  <span
                    className={`platform-sidebar-chevron${expanded ? ' open' : ''}`}
                    aria-hidden
                  />
                </button>
                {expanded && children.length > 0 ? (
                  <ul className="platform-sidebar-sublist">
                    {children.map((item) => {
                      const itemActive = isItemActive(item);
                      return (
                        <li key={item.to}>
                          <Link
                            className={`platform-sidebar-sublink${itemActive ? ' active' : ''}`}
                            to={appPath(item.to)}
                            aria-current={itemActive ? 'page' : undefined}
                            onClick={closeMobileMenu}
                          >
                            {t(item.label)}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="platform-main-topbar">
        <button
          type="button"
          className="platform-sidebar-toggle"
          onClick={() => setAppSidebarOpen((open) => !open)}
          aria-label={appSidebarOpen ? t('Hide menu') : t('Show menu')}
          aria-expanded={appSidebarOpen}
          aria-controls="pool-app-sidebar"
        >
          <span className="platform-sidebar-toggle-bar" />
          <span className="platform-sidebar-toggle-bar" />
          <span className="platform-sidebar-toggle-bar" />
        </button>
        <div className="platform-main-topbar-actions">
          {tenantAccount && tenantUser?.isAccountAdmin && tenantUser.id ? (
            <SupportInboxButton
              accountCode={tenantAccount.accountCode}
              authorUserId={tenantUser.id}
            />
          ) : null}
          <LanguageSwitcher />
          {tenantAccount ? (
            <TenantUserBar
              account={tenantAccount}
              user={tenantUser}
              onLogout={onTenantLogout}
            />
          ) : (
            <span className="app-preview-topbar-note">{t('View Application')}</span>
          )}
        </div>
      </div>

      <div className="platform-shell-main">{homeBody}</div>
    </>
  );

  const appSizeToggle =
    !tenantAccount ? (
      <button
        type="button"
        className="app-fullscreen-toggle"
        onClick={() => setAppFullscreen((open) => !open)}
        aria-label={appFullscreen ? 'Exit full screen' : 'Open application full screen'}
        title={appFullscreen ? 'Exit full screen' : 'Full screen'}
      >
        {appFullscreen ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 9V5M9 9H5M9 9L4 4" />
            <path d="M15 9h4M15 9V5M15 9l5-5" />
            <path d="M9 15v4M9 15H5M9 15l-5 5" />
            <path d="M15 15h4M15 15v4M15 15l5 5" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 4v4M4 4h4M4 4l5 5" />
            <path d="M20 4h-4M20 4v4M20 4l-5 5" />
            <path d="M4 20v-4M4 20h4M4 20l5-5" />
            <path d="M20 20h-4M20 20v-4M20 20l-5-5" />
          </svg>
        )}
      </button>
    ) : null;

  /* Logged-in pool account: full-window pool chrome. */
  if (tenantAccount) {
    return (
      <div
        className={`platform-shell${appSidebarOpen ? '' : ' platform-shell--sidebar-collapsed'}`}
      >
        {poolMenu}
        <PassPopupOverlay />
      </div>
    );
  }

  /* Full-screen application preview — stays while browsing all app pages. */
  if (appFullscreen) {
    return (
      <div
        className={`platform-shell platform-shell--app-fullscreen${
          appSidebarOpen ? '' : ' platform-shell--sidebar-collapsed'
        }`}
      >
        {poolMenu}
        {appSizeToggle}
        <PassPopupOverlay />
      </div>
    );
  }

  /* SaaS “View Application”: platform chrome + embedded pool app (sidebar + top bar). */
  return (
    <div
      className={`platform-shell${sidebarOpen ? '' : ' platform-shell--sidebar-collapsed'}`}
    >
      <PlatformNav
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
      />

      <div className="platform-shell-main platform-shell-main--embed-app">
        <div
          className={`platform-shell platform-shell--embedded${
            appSidebarOpen ? '' : ' platform-shell--sidebar-collapsed'
          }`}
        >
          {poolMenu}
        </div>
      </div>
      {appSizeToggle}
      <PassPopupOverlay />
    </div>
  );
}
