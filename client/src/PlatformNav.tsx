import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LanguageSwitcher, useT } from './i18n';
import {
  clearPlatformSession,
  getPlatformSession,
  setPlatformSession,
  type PlatformSession,
} from './platformSession';
import { hasPlatformAccess, type PlatformAccessPageKey } from './platformAccess';
import { passwordPolicyError } from './passwordPolicy';
import { PlatformLoginModal, type PlatformLoginFormState } from './PlatformLoginModal';
import { ThemeToggle, useTheme } from './theme';
import { setActiveTenant } from './tenantSession';
import { SidebarRelease } from './SidebarRelease';

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

const LINKS = [
  {
    to: '/',
    label: 'Home',
    match: (path: string) => path === '/' || path === '/home',
    requiresAuth: false,
  },
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
    to: '/application/dashboard?expand=1',
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
  {
    to: '/platform/server',
    label: 'Server',
    match: (path: string) =>
      path === '/platform/server' || path.startsWith('/platform/server/'),
    requiresAuth: true,
    accessKey: 'server-monitor' as PlatformAccessPageKey,
  },
] as const;

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
  const { setTheme } = useTheme();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginForm, setLoginForm] = useState<PlatformLoginFormState>({
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
          <Link to="/" className="platform-sidebar-brand-link" onClick={onNavigate}>
            <img
              src="/swimit-wordmark.png"
              alt="SwimIT — Swimming Pool Management System"
              className="platform-sidebar-logo"
            />
          </Link>
        </div>
        <ul className="platform-sidebar-list">
          {visibleLinks.map((link) => {
            const active = link.match(pathname);
            const opensApplication =
              link.to.startsWith('/application') || link.label === 'View Application';
            return (
              <li key={link.to}>
                <Link
                  className={`platform-sidebar-link${active ? ' active' : ''}`}
                  to={link.to}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => {
                    if (opensApplication) setTheme('dark');
                    onNavigate?.();
                  }}
                >
                  <span className="platform-sidebar-link-label">{t(link.label)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <SidebarRelease />
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
          <ThemeToggle />
          <LanguageSwitcher />
          {platformUser ? (
            <>
              <PlatformProfileMenu
                session={platformUser}
                onSessionChange={(next) => {
                  setPlatformSession(next);
                  setPlatformUser(next);
                }}
              />
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
  onSessionChange,
}: {
  session: PlatformSession;
  onSessionChange: (session: PlatformSession) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profile, setProfile] = useState<{
    userName: string;
    mobile: string;
    email: string;
    isAccountAdmin: boolean;
    createdAt?: string;
    accountName: string;
    accountCode: string;
  } | null>(null);
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
        setEditingProfile(false);
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
    setEditingProfile(false);
    resetPasswordForm();
  }

  async function openProfile() {
    setEditingProfile(true);
    setChangingPassword(false);
    setProfileLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/auth/profile');
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to load profile');
      setProfile({
        userName: String(body.userName ?? ''),
        mobile: String(body.mobile ?? ''),
        email: String(body.email ?? ''),
        isAccountAdmin: Boolean(body.isAccountAdmin),
        createdAt: body.createdAt ? String(body.createdAt) : undefined,
        accountName: String(body.accountName ?? session.accountName),
        accountCode: String(body.accountCode ?? session.accountCode),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setProfileLoading(false);
    }
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName: profile.userName,
          mobile: profile.mobile,
          email: profile.email,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to update profile');
      const userName = String(body.userName ?? profile.userName);
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              userName,
              mobile: String(body.mobile ?? prev.mobile),
              email: String(body.email ?? prev.email),
            }
          : prev,
      );
      onSessionChange({ ...session, userName });
      setSuccess('Profile updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    const policyError = passwordPolicyError(newPassword);
    if (policyError) {
      setError(policyError);
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
          setEditingProfile(false);
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
          <div className="platform-profile-heading">
            <p className="tenant-profile-name">{session.userName}</p>
            {!editingProfile && !changingPassword ? (
              <button
                type="button"
                className="platform-profile-edit-btn"
                onClick={() => void openProfile()}
                aria-label={t('View or edit profile')}
                title={t('View or edit profile')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <circle cx="12" cy="8" r="3.5" />
                  <path d="M4 20c1.5-4 4.2-6 8-6 1.5 0 2.8.3 3.9.9" />
                  <path d="m16 18 3.8-3.8 1.2 1.2-3.8 3.8-2 .5z" />
                </svg>
              </button>
            ) : null}
          </div>

          {editingProfile ? (
            profileLoading ? (
              <p className="muted">{t('Loading…')}</p>
            ) : profile ? (
              <form className="tenant-password-form platform-profile-form" onSubmit={saveProfile}>
                <div className="platform-profile-readonly">
                  <span>{t('Account')}: <strong>{profile.accountName}</strong></span>
                  <span>{t('Code')}: <code>{profile.accountCode}</code></span>
                  <span>{t('Role')}: <strong>{profile.isAccountAdmin ? t('Admin') : t('User')}</strong></span>
                </div>
                <label className="field">
                  <span className="label">{t('User Name')}</span>
                  <input
                    value={profile.userName}
                    onChange={(e) => setProfile((prev) => prev ? { ...prev, userName: e.target.value } : prev)}
                    maxLength={80}
                    required
                  />
                </label>
                <label className="field">
                  <span className="label">{t('Mobile')}</span>
                  <input
                    value={profile.mobile}
                    onChange={(e) => setProfile((prev) => prev ? { ...prev, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) } : prev)}
                    inputMode="numeric"
                    minLength={10}
                    maxLength={10}
                    required
                  />
                </label>
                <label className="field">
                  <span className="label">{t('Email')}</span>
                  <input
                    type="email"
                    value={profile.email}
                    onChange={(e) => setProfile((prev) => prev ? { ...prev, email: e.target.value } : prev)}
                    required
                  />
                </label>
                {error ? <p className="error">{error}</p> : null}
                {success ? <p className="success tenant-profile-success">{success}</p> : null}
                <div className="tenant-password-actions">
                  <button
                    type="button"
                    className="terms-link"
                    onClick={() => {
                      setEditingProfile(false);
                      setError('');
                      setSuccess('');
                    }}
                  >
                    {t('Cancel')}
                  </button>
                  <button type="submit" className="csv-btn" disabled={saving}>
                    {saving ? t('Saving…') : t('Save')}
                  </button>
                </div>
              </form>
            ) : (
              <p className="error">{error || t('Failed to load profile')}</p>
            )
          ) : !changingPassword ? (
            <>
              <p className="tenant-profile-detail">
                Account: <strong>{session.accountName}</strong>
              </p>
              <p className="tenant-profile-detail">
                Code: <code>{session.accountCode}</code>
              </p>
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
            </>
          ) : (
            <form className="tenant-password-form" onSubmit={onChangePassword} autoComplete="off">
              <label className="field">
                <span className="label">Current password</span>
                <div className="password-input-wrap">
                  <input
                    type={showCurrent ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    name="swimit-current-password"
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    readOnly
                    onFocus={(e) => {
                      e.currentTarget.readOnly = false;
                    }}
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
                    minLength={8}
                    required
                  />
                  <PasswordEyeButton visible={showNew} onToggle={() => setShowNew((v) => !v)} />
                </div>
                <span className="muted field-hint">
                  {t('Password must be at least 8 characters with at least 1 letter and 1 number')}
                </span>
              </label>
              <label className="field">
                <span className="label">Confirm new password</span>
                <div className="password-input-wrap">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={8}
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

          {!editingProfile && success ? (
            <p className="success tenant-profile-success">{success}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
