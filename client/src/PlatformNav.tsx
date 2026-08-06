import { FormEvent, useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { exitApplicationDemo } from './applicationDemo';
import { LanguageSwitcher, useT } from './i18n';
import {
  clearPlatformSession,
  getPlatformSession,
  isSaasManagementCode,
  setPlatformSession,
  type PlatformSession,
} from './platformSession';
import { hasPlatformAccess, type PlatformAccessPageKey } from './platformAccess';
import { setActiveTenant } from './tenantSession';

const LINKS = [
  { to: '/', label: 'Home', match: (path: string) => path === '/', requiresAuth: false },
  {
    to: '/accounts',
    label: 'Accounts',
    match: (path: string) => path === '/accounts',
    requiresAuth: true,
    accessKey: 'accounts' as PlatformAccessPageKey,
  },
  {
    to: '/platform/user-management',
    label: 'User Management',
    match: (path: string) =>
      path === '/platform/user-management' ||
      path.startsWith('/platform/user-management/') ||
      path === '/platform/create-user' ||
      path.startsWith('/platform/create-user/'),
    requiresAuth: true,
    accessKey: 'platform-users' as PlatformAccessPageKey,
  },
  {
    to: '/service-packages',
    label: 'Service Packages',
    match: (path: string) => path === '/service-packages',
    requiresAuth: false,
    accessKey: 'service-packages' as PlatformAccessPageKey,
  },
  {
    to: '/create-account',
    label: 'Create Account',
    match: (path: string) =>
      path === '/create-account' || path.startsWith('/create-account/'),
    requiresAuth: false,
  },
  {
    to: '/application',
    label: 'View Application',
    match: (path: string) =>
      path === '/application' || path.startsWith('/application/'),
    requiresAuth: false,
  },
  {
    to: '/platform/payment',
    label: 'Payment',
    match: (path: string) =>
      path === '/platform/payment' || path.startsWith('/platform/payment/'),
    requiresAuth: true,
    accessKey: 'payment' as PlatformAccessPageKey,
  },
  {
    to: '/platform/whatsapp',
    label: 'WhatsApp',
    match: (path: string) =>
      path === '/platform/whatsapp' || path.startsWith('/platform/whatsapp/'),
    requiresAuth: true,
    accessKey: 'whatsapp' as PlatformAccessPageKey,
  },
] as const;

const ACCOUNT_CODE_RE = /^[a-z0-9]{6}$/;

function normalizeAccountCode(value: string) {
  return value.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toLowerCase();
}

function sessionKey(code: string) {
  return `swimIT.accountSession.${code}`;
}

function PasswordEyeButton({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="password-eye"
      onClick={onToggle}
      aria-label={visible ? 'Hide password' : 'View password'}
      aria-pressed={visible}
    >
      {visible ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M3 3l18 18" />
          <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
          <path d="M9.9 5.2A10.4 10.4 0 0 1 12 5c5 0 8.5 4.2 9.7 6.1a1.4 1.4 0 0 1 0 1.6c-.5.8-1.6 2.3-3.3 3.6" />
          <path d="M6.1 6.1C4.5 7.3 3.4 8.8 2.9 9.6a1.4 1.4 0 0 0 0 1.6C4.1 13.2 7.6 17 12 17c1.1 0 2.1-.2 3.1-.5" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M2.9 11.2a1.4 1.4 0 0 0 0 1.6C4.1 14.7 7.6 19 12 19s7.9-4.3 9.1-6.2a1.4 1.4 0 0 0 0-1.6C19.9 9.3 16.4 5 12 5S4.1 9.3 2.9 11.2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );
}

type LoginFormState = {
  accountCode: string;
  userName: string;
  password: string;
};

function PlatformLoginModal({
  open,
  onClose,
  form,
  onFormChange,
}: {
  open: boolean;
  onClose: () => void;
  form: LoginFormState;
  onFormChange: (patch: Partial<LoginFormState>) => void;
}) {
  const navigate = useNavigate();
  const titleId = useId();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [openedAt, setOpenedAt] = useState(0);

  useEffect(() => {
    if (!open) return;
    setOpenedAt(Date.now());
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function closeFromBackdrop(e: MouseEvent) {
    // Ignore accidental closes from layout shift / keyboard open (mouseup landed on backdrop)
    if (e.target !== e.currentTarget) return;
    if (Date.now() - openedAt < 400) return;
    onClose();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const code = normalizeAccountCode(form.accountCode);
    if (!ACCOUNT_CODE_RE.test(code)) {
      setError('Enter a valid 6-character account code');
      return;
    }

    setLoggingIn(true);
    try {
      const accountRes = await fetch(`/api/saas-accounts/by-code/${encodeURIComponent(code)}`);
      const accountBody = await accountRes.json().catch(() => ({}));
      if (!accountRes.ok) throw new Error(accountBody.error ?? 'Account not found');

      const res = await fetch(`/api/saas-accounts/by-code/${encodeURIComponent(code)}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName: form.userName.trim() || 'admin',
          password: form.password,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Login failed');

      const user = {
        id: Number(body.user.id),
        userName: String(body.user.userName),
        mobile: String(body.user.mobile ?? ''),
        mustChangePassword: Boolean(body.user.mustChangePassword),
        isAccountAdmin: Boolean(body.user.isAccountAdmin),
        menuAccess: Array.isArray(body.user.menuAccess)
          ? body.user.menuAccess.map(String)
          : [],
      };
      sessionStorage.setItem(sessionKey(code), JSON.stringify(user));
      exitApplicationDemo();

      if (isSaasManagementCode(code)) {
        setActiveTenant(null);
        setPlatformSession({
          accountCode: code,
          accountId: Number(accountBody.id),
          accountName: String(accountBody.accountName ?? 'SwimIT SaaS'),
          userId: user.id,
          userName: user.userName,
          menuAccess: user.menuAccess,
          isAccountAdmin: user.isAccountAdmin,
        });
        onClose();
        navigate('/');
        return;
      }

      clearPlatformSession();
      if (!user.mustChangePassword) {
        setActiveTenant({
          id: Number(accountBody.id),
          accountCode: String(accountBody.accountCode ?? code),
        });
      }

      onClose();
      navigate(`/${code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoggingIn(false);
    }
  }

  return createPortal(
    <div
      className="modal-backdrop platform-login-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={closeFromBackdrop}
    >
      <div
        className="modal-panel platform-login-panel"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId}>Login</h2>
        <p className="modal-intro">
          Enter account code, user name, and password. Use code <code>swimit</code> for SaaS
          management.
        </p>
        <form className="platform-login-form" onSubmit={onSubmit}>
          <label className="field">
            <span className="label">
              Code <span className="req">*</span>
            </span>
            <input
              value={form.accountCode}
              onChange={(e) => onFormChange({ accountCode: normalizeAccountCode(e.target.value) })}
              placeholder="e.g. swimit"
              maxLength={6}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              required
            />
          </label>
          <label className="field">
            <span className="label">
              User name <span className="req">*</span>
            </span>
            <input
              value={form.userName}
              onChange={(e) => onFormChange({ userName: e.target.value })}
              autoComplete="username"
              required
            />
          </label>
          <label className="field">
            <span className="label">
              Password <span className="req">*</span>
            </span>
            <div className="password-input-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => onFormChange({ password: e.target.value })}
                autoComplete="current-password"
                required
              />
              <PasswordEyeButton
                visible={showPassword}
                onToggle={() => setShowPassword((prev) => !prev)}
              />
            </div>
          </label>
          {error ? <p className="error">{error}</p> : null}
          <div className="platform-login-actions">
            <button type="button" className="ghost-btn" onClick={onClose} disabled={loggingIn}>
              Cancel
            </button>
            <button type="submit" className="submit" disabled={loggingIn}>
              {loggingIn ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

/** Sticky SaaS platform menu with active-page highlight and pool login. */
export function PlatformNav({
  sidebarOpen = true,
  onToggleSidebar,
  onNavigate,
}: {
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  onNavigate?: () => void;
} = {}) {
  const t = useT();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginForm, setLoginForm] = useState<LoginFormState>({
    accountCode: '',
    userName: 'admin',
    password: '',
  });
  const [platformUser, setPlatformUser] = useState(() => getPlatformSession());

  function refreshSession() {
    setPlatformUser(getPlatformSession());
  }

  function onLogout() {
    clearPlatformSession();
    setActiveTenant(null);
    setPlatformUser(null);
    navigate('/');
  }

  function closeLogin() {
    setLoginOpen(false);
    refreshSession();
  }

  const visibleLinks = LINKS.filter((link) => {
    if (link.requiresAuth && !platformUser) return false;
    if (!platformUser) return true;
    if (!('accessKey' in link) || !link.accessKey) return true;
    // Service Packages stays visible for browsing; other keys gate staff nav.
    if (link.to === '/service-packages') return true;
    return hasPlatformAccess(
      platformUser.menuAccess,
      link.accessKey,
      platformUser.isAccountAdmin,
    );
  });

  return (
    <>
      <nav
        id="platform-sidebar"
        className={`platform-sidebar${sidebarOpen ? '' : ' platform-sidebar--hidden'}`}
        aria-label="Platform menu"
      >
        <div className="platform-sidebar-brand">
          <p className="platform-sidebar-brand-name">SwimIT</p>
          <p className="platform-sidebar-brand-label">SaaS platform</p>
        </div>
        <ul className="platform-sidebar-list">
          {visibleLinks.map((link) => {
            const active = link.match(pathname);
            return (
              <li key={link.to}>
                <Link
                  className={`platform-sidebar-link${active ? ' active' : ''}`}
                  to={link.to}
                  aria-current={active ? 'page' : undefined}
                  onClick={onNavigate}
                >
                  <span className="platform-sidebar-link-label">{t(link.label)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="platform-main-topbar">
        {onToggleSidebar ? (
          <button
            type="button"
            className="platform-sidebar-toggle"
            onClick={onToggleSidebar}
            aria-label={sidebarOpen ? t('Hide menu') : t('Show menu')}
            aria-expanded={sidebarOpen}
            aria-controls="platform-sidebar"
          >
            <span className="platform-sidebar-toggle-bar" />
            <span className="platform-sidebar-toggle-bar" />
            <span className="platform-sidebar-toggle-bar" />
          </button>
        ) : (
          <span />
        )}
        <div className="platform-main-topbar-actions">
          <LanguageSwitcher />
          {platformUser ? (
            <>
              <PlatformProfileMenu session={platformUser} />
              <button
                type="button"
                className="platform-main-login"
                onClick={onLogout}
              >
                {t('Sign out')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="platform-main-login"
              onClick={() => setLoginOpen(true)}
            >
              {t('Login')}
            </button>
          )}
        </div>
      </div>

      <PlatformLoginModal
        open={loginOpen}
        onClose={closeLogin}
        form={loginForm}
        onFormChange={(patch) => setLoginForm((prev) => ({ ...prev, ...patch }))}
      />
    </>
  );
}

function PlatformProfileMenu({
  session,
}: {
  session: PlatformSession;
}) {
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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: globalThis.MouseEvent) {
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

  function closeMenu() {
    setOpen(false);
    setChangingPassword(false);
    resetPasswordForm();
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
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
        `/api/saas-accounts/by-code/${encodeURIComponent(session.accountCode)}/change-password`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: session.userId,
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

  return (
    <div className="platform-profile" ref={ref}>
      <button
        type="button"
        className="platform-profile-btn"
        aria-label="User profile"
        aria-expanded={open}
        onClick={() => {
          if (open) {
            closeMenu();
            return;
          }
          setOpen(true);
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

      {open ? (
        <div className="platform-profile-dropdown" role="menu">
          <p className="tenant-profile-name">{session.userName}</p>
          <p className="tenant-profile-detail">
            Account: <strong>{session.accountName}</strong>
          </p>
          <p className="tenant-profile-detail">
            Code: <code>{session.accountCode}</code>
          </p>

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
                  <PasswordEyeButton
                    visible={showCurrent}
                    onToggle={() => setShowCurrent((v) => !v)}
                  />
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
                  <PasswordEyeButton visible={showNew} onToggle={() => setShowNew((v) => !v)} />
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
                  <PasswordEyeButton
                    visible={showConfirm}
                    onToggle={() => setShowConfirm((v) => !v)}
                  />
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
