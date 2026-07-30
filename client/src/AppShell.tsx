import { FormEvent, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useOutlet } from 'react-router-dom';
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
import { MENU_ITEMS, MenuTiles } from './menuItems';
import { PassPopupOverlay } from './PassPopupOverlay';
import { PlatformNav } from './PlatformNav';
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
  const navigate = useNavigate();
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
      {user.isAccountAdmin && account.packageName ? (
        <span className="tenant-package-badge" title="Service package">
          Package: <strong>{account.packageName}</strong>
          <button
            type="button"
            className="tenant-package-edit"
            aria-label="Edit package / renew"
            title="Renew or change package"
            onClick={() => {
              navigate(`/${account.accountCode.toLowerCase()}/renew-payment`);
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </button>
        </span>
      ) : null}
      <button
        type="button"
        className="tenant-profile-btn"
        aria-label="User settings"
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
        <button type="button" className="tenant-signout-btn" onClick={onLogout}>
          Sign out
        </button>
      ) : null}

      {open ? (
        <div className="tenant-profile-dropdown">
          <p className="tenant-profile-name">{user.userName}</p>
          <p className="tenant-profile-detail">
            Account: <strong>{account.accountName}</strong>
          </p>
          <p className="tenant-profile-detail">
            Code: <code>{account.accountCode}</code>
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

/** Permanent SwimIT chrome: brand + section tabs; feature pages render below in Outlet. */
export function AppShell({
  tenantAccount,
  tenantUser,
  onTenantLogout,
  featurePage,
  children,
}: AppShellProps = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const routeOutlet = useOutlet();
  const featurePath = featurePathFromLocation(location.pathname);
  const onHome = featurePath === '/';
  const pageContent = onHome
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
    // User Management tile is admin-only and not in ACCESS_PAGES; show tab on full packages.
    if (tenantUser?.isAccountAdmin && packageIsFull) {
      set.add('User Management');
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
  const highlightSection = !onHome && pathSection ? pathSection : section;

  useEffect(() => {
    if (!onHome && pathSection) {
      if (tenantAccount && !allowedSections.has(pathSection)) return;
      setSection(pathSection);
    }
  }, [onHome, pathSection, tenantAccount, allowedSections]);

  const visibleItems = useMemo(
    () =>
      MENU_ITEMS.filter((item) => {
        if (item.section !== section) return false;
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

  function onSectionClick(name: MenuSection) {
    if (tenantAccount && tenantUser && !allowedSections.has(name)) return;
    if (!onHome) {
      navigate(homePath, { state: { section: name } });
      return;
    }
    setSection(name);
  }

  const sectionTabs = tenantAccount
    ? MENU_SECTIONS.filter((s) => allowedSections.has(s))
    : MENU_SECTIONS;

  const passPopupOnly = isPassPopupWindow();

  if (passPopupOnly) {
    return (
      <div className="pass-popup-shell">
        {pageContent}
        <PassPopupOverlay />
      </div>
    );
  }

  return (
    <div className="menu-shell">
      {!tenantAccount ? <PlatformNav /> : null}

      <div className="menu-card">
        {tenantAccount ? (
          <TenantUserBar
            account={tenantAccount}
            user={tenantUser}
            onLogout={onTenantLogout}
          />
        ) : null}

        <div className="app-shell-chrome">
          <header className="menu-brand">
            <h1>SwimIT</h1>
            <p>Swimming Pool Management System</p>
          </header>

          <nav className="menu-bar" aria-label="Menu sections">
            {sectionTabs.map((name) => (
              <button
                key={name}
                type="button"
                className={`menu-bar-item${highlightSection === name ? ' selected' : ''}`}
                aria-current={highlightSection === name ? 'page' : undefined}
                onClick={() => onSectionClick(name)}
              >
                {name}
              </button>
            ))}
          </nav>
        </div>

        <div className="app-shell-body">
          {pageContent ??
            (onHome ? (
              <MenuTiles items={visibleItems} appPath={appPath} section={section} />
            ) : (
              <div className="page">
                <p className="error">Page not found ({featurePath}).</p>
              </div>
            ))}
        </div>
      </div>
      <PassPopupOverlay />
    </div>
  );
}
