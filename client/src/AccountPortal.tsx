import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useOutlet, useParams } from 'react-router-dom';
import { AppShell } from './AppShell';
import { emailHint, isValidEmail, isValidMobile, MOBILE_INVALID_MSG } from './formValidation';
import { useT } from './i18n';
import { MobileField } from './MobileField';
import { isSaasManagementCode, setPlatformSession } from './platformSession';
import { setActiveTenant } from './tenantSession';

type AccountInfo = {
  id: number;
  accountName: string;
  accountCode: string;
  status: string;
  packageName?: string;
  modules?: string;
};

type SessionUser = {
  id: number;
  userName: string;
  mobile: string;
  mustChangePassword: boolean;
  isAccountAdmin: boolean;
  menuAccess?: string[];
};

const ACCOUNT_CODE_RE = /^[a-z0-9]{6}$/;

function normalizeAccountCode(value: string) {
  return value.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toLowerCase();
}

function sessionKey(code: string) {
  return `swimIT.accountSession.${code}`;
}

function readSession(code: string): SessionUser | null {
  try {
    const raw = sessionStorage.getItem(sessionKey(code));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionUser;
    if (!parsed?.id || !parsed.userName) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSession(code: string, user: SessionUser) {
  sessionStorage.setItem(sessionKey(code), JSON.stringify(user));
}

function clearSession(code: string) {
  sessionStorage.removeItem(sessionKey(code));
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

export function AccountPortal() {
  const { accountCode = '' } = useParams();
  const code = normalizeAccountCode(accountCode);
  const navigate = useNavigate();
  const t = useT();
  const featurePage = useOutlet();
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(() =>
    ACCOUNT_CODE_RE.test(code) ? readSession(code) : null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loginMode, setLoginMode] = useState<'login' | 'forgot'>('login');
  const [loginUserName, setLoginUserName] = useState('admin');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMobile, setForgotMobile] = useState('');
  const [resetting, setResetting] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  useEffect(() => {
    if (!ACCOUNT_CODE_RE.test(code)) {
      setLoading(false);
      setError('Invalid account code');
      return;
    }

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/saas-accounts/by-code/${encodeURIComponent(code)}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? 'Account not found');
        if (cancelled) return;
        const info: AccountInfo = {
          id: Number(body.id),
          accountName: String(body.accountName ?? ''),
          accountCode: String(body.accountCode ?? code),
          status: String(body.status ?? 'Active'),
          packageName: String(body.packageName ?? '').trim(),
          modules: String(body.modules ?? 'core').trim() || 'core',
        };
        if (info.status === 'Suspended') {
          setError('This account is suspended.');
          setAccount(null);
          clearSession(code);
          setSessionUser(null);
          setActiveTenant(null);
          return;
        }
        setAccount(info);
        setSessionUser(readSession(code));
      } catch (err) {
        if (!cancelled) {
          setAccount(null);
          setError(err instanceof Error ? err.message : 'Account not found');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [code]);

  useEffect(() => {
    if (account && sessionUser && !sessionUser.mustChangePassword) {
      if (isSaasManagementCode(code)) {
        setActiveTenant(null);
        setPlatformSession({
          accountCode: account.accountCode || code,
          accountId: account.id,
          accountName: account.accountName,
          userId: sessionUser.id,
          userName: sessionUser.userName,
          menuAccess: sessionUser.menuAccess ?? [],
          isAccountAdmin: Boolean(sessionUser.isAccountAdmin),
        });
      } else {
        setActiveTenant({ id: account.id, accountCode: account.accountCode || code });
      }
    }
  }, [account, sessionUser, code]);

  // Older sessions may not store menu access; hydrate it when possible.
  useEffect(() => {
    async function hydrateMenuAccess() {
      if (!account || !sessionUser) return;
      if (sessionUser.mustChangePassword) return;
      if (Array.isArray(sessionUser.menuAccess)) return;

      try {
        const res = await fetch(`/api/users/${sessionUser.id}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return;
        if (!Array.isArray(body.menuAccess)) return;
        const updated: SessionUser = { ...sessionUser, menuAccess: body.menuAccess.map(String) };
        writeSession(code, updated);
        setSessionUser(updated);
      } catch {
        // ignore
      }
    }
    void hydrateMenuAccess();
  }, [account, sessionUser, code]);

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoggingIn(true);
    try {
      const res = await fetch(`/api/saas-accounts/by-code/${encodeURIComponent(code)}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName: loginUserName.trim() || 'admin',
          password: loginPassword,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Login failed');
      const user: SessionUser = {
        id: Number(body.user.id),
        userName: String(body.user.userName),
        mobile: String(body.user.mobile ?? ''),
        mustChangePassword: Boolean(body.user.mustChangePassword),
        isAccountAdmin: Boolean(body.user.isAccountAdmin),
        menuAccess: Array.isArray(body.user.menuAccess)
          ? body.user.menuAccess.map(String)
          : [],
      };
      writeSession(code, user);
      setSessionUser(user);
      if (isSaasManagementCode(code)) {
        setActiveTenant(null);
        if (account) {
          setPlatformSession({
            accountCode: account.accountCode || code,
            accountId: account.id,
            accountName: account.accountName,
            userId: user.id,
            userName: user.userName,
            menuAccess: user.menuAccess ?? [],
            isAccountAdmin: Boolean(user.isAccountAdmin),
          });
        }
      } else if (account && !user.mustChangePassword) {
        setActiveTenant({ id: account.id, accountCode: account.accountCode || code });
        navigate(`/${code}/dashboard`, { replace: true });
      }
      setLoginPassword('');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordError('');
      setPasswordSuccess('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoggingIn(false);
    }
  }

  async function onForgotSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!isValidEmail(forgotEmail)) {
      setError(emailHint(forgotEmail) || t('Enter a valid email address'));
      return;
    }
    if (!isValidMobile(forgotMobile)) {
      setError(MOBILE_INVALID_MSG);
      return;
    }

    setResetting(true);
    try {
      const res = await fetch(`/api/saas-accounts/by-code/${encodeURIComponent(code)}/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: forgotEmail.trim(),
          mobile: forgotMobile,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? t('Failed to reset password'));
      setSuccess(
        String(body.message ?? t('A new temporary password was sent to your mobile and email.')),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Failed to reset password'));
    } finally {
      setResetting(false);
    }
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    if (!sessionUser) return;
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match');
      return;
    }

    setChangingPassword(true);
    try {
      const res = await fetch(
        `/api/saas-accounts/by-code/${encodeURIComponent(code)}/change-password`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: sessionUser.id,
            currentPassword,
            newPassword,
          }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to change password');
      const user: SessionUser = {
        ...sessionUser,
        mustChangePassword: false,
        menuAccess: Array.isArray(body.user?.menuAccess)
          ? body.user.menuAccess.map(String)
          : sessionUser.menuAccess,
      };
      writeSession(code, user);
      setSessionUser(user);
      if (isSaasManagementCode(code)) {
        setActiveTenant(null);
        if (account) {
          setPlatformSession({
            accountCode: account.accountCode || code,
            accountId: account.id,
            accountName: account.accountName,
            userId: user.id,
            userName: user.userName,
            menuAccess: user.menuAccess ?? [],
            isAccountAdmin: Boolean(user.isAccountAdmin),
          });
        }
        setPasswordSuccess('Password updated. Opening SaaS management…');
      } else if (account) {
        setActiveTenant({ id: account.id, accountCode: account.accountCode || code });
        setPasswordSuccess('Password updated. Opening your account…');
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  }

  function onLogout() {
    clearSession(code);
    setActiveTenant(null);
    setSessionUser(null);
    setLoginPassword('');
    setError('');
  }

  if (!ACCOUNT_CODE_RE.test(code)) {
    return <Navigate to="/" replace />;
  }

  // SwimIT SaaS management account opens the platform home, not the pool app
  if (
    isSaasManagementCode(code) &&
    account &&
    sessionUser &&
    !sessionUser.mustChangePassword
  ) {
    return <Navigate to="/" replace />;
  }

  if (loading) {
    return (
      <div className="menu-shell">
        <div className="menu-card">
          <p className="muted">Opening account…</p>
        </div>
      </div>
    );
  }

  if (error && !account) {
    return (
      <div className="menu-shell">
        <div className="menu-card">
          <h1>Account not found</h1>
          <p className="lede">{error}</p>
          <p className="muted">Try another account code or contact SwimIT support.</p>
          <p style={{ marginTop: '1rem' }}>
            <Link className="menu-link" to="/">
              ← SwimIT home
            </Link>
          </p>
        </div>
      </div>
    );
  }

  if (!account) return null;

  if (!sessionUser) {
    return (
      <div className="account-login-shell">
        <div
          className="modal-panel platform-login-panel account-login-panel"
          role="dialog"
          aria-modal="true"
          aria-label={loginMode === 'forgot' ? t('Forgot password') : t('Login')}
        >
          <div className="platform-login-layout">
            <aside className="platform-login-brand" aria-hidden="true">
              <img
                src="/swimit-login.png"
                alt=""
                className="platform-login-brand-image"
              />
            </aside>
            <div className="platform-login-content">
              <div className="platform-login-branding">
                <img
                  src="/swimit-logo.png"
                  alt="SwimIT — Swimming Pool Management System"
                  className="platform-login-logo"
                />
                <p className="platform-login-account-name">{account.accountName}</p>
              </div>
              {loginMode === 'login' ? (
                <form className="platform-login-form" onSubmit={onLogin}>
                  <label className="field">
                    <span className="label">
                      {t('User name')} <span className="req">*</span>
                    </span>
                    <input
                      value={loginUserName}
                      onChange={(e) => setLoginUserName(e.target.value)}
                      autoComplete="username"
                      required
                    />
                  </label>
                  <label className="field">
                    <span className="label">
                      {t('Password')} <span className="req">*</span>
                    </span>
                    <div className="password-input-wrap">
                      <input
                        type={showLoginPassword ? 'text' : 'password'}
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        autoComplete="current-password"
                        required
                      />
                      <PasswordEyeButton
                        visible={showLoginPassword}
                        onToggle={() => setShowLoginPassword((prev) => !prev)}
                      />
                    </div>
                  </label>
                  <div className="platform-login-forgot-row">
                    <button
                      type="button"
                      className="platform-login-forgot-link"
                      onClick={() => {
                        setError('');
                        setSuccess('');
                        setLoginMode('forgot');
                      }}
                    >
                      {t('Forgot password?')}
                    </button>
                  </div>
                  {error ? <p className="error">{error}</p> : null}
                  <div className="platform-login-actions">
                    <button
                      type="button"
                      className="ghost-btn"
                      disabled={loggingIn}
                      onClick={() => navigate('/')}
                    >
                      {t('Cancel')}
                    </button>
                    <button type="submit" className="submit" disabled={loggingIn}>
                      {loggingIn ? t('Signing in…') : t('Sign in')}
                    </button>
                  </div>
                </form>
              ) : (
                <form className="platform-login-form" onSubmit={onForgotSubmit}>
                  <p className="platform-login-forgot-help">
                    {t(
                      'Enter your registered email and mobile. If they match, a new temporary password will be sent to your WhatsApp and email.',
                    )}
                  </p>
                  <label className="field">
                    <span className="label">
                      {t('Email')} <span className="req">*</span>
                    </span>
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      autoComplete="email"
                      required
                    />
                  </label>
                  <MobileField
                    label={t('Mobile')}
                    value={forgotMobile}
                    onChange={setForgotMobile}
                    required
                    className="field"
                  />
                  {error ? <p className="error">{error}</p> : null}
                  {success ? <p className="platform-login-success">{success}</p> : null}
                  <div className="platform-login-actions platform-login-actions-inline">
                    <button
                      type="button"
                      className="ghost-btn"
                      disabled={resetting}
                      onClick={() => {
                        setError('');
                        setSuccess('');
                        setLoginMode('login');
                      }}
                    >
                      {t('Back to login')}
                    </button>
                    <button type="submit" className="submit" disabled={resetting || Boolean(success)}>
                      {resetting ? t('Sending…') : t('Send password')}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (sessionUser.mustChangePassword) {
    return (
      <div className="menu-shell">
        <div className="menu-card account-login-card">
          <header className="menu-brand">
            <h1>Change password</h1>
            <p>
              {account.accountName} · {sessionUser.userName}
            </p>
          </header>
          <p className="lede">For security, set a new password before using this account.</p>
          <form
            className="pass-form-card"
            onSubmit={onChangePassword}
            style={{ boxShadow: 'none', padding: 0 }}
          >
            <label className="field">
              <span className="label">Current (temporary) password</span>
              <div className="password-input-wrap">
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <PasswordEyeButton
                  visible={showCurrentPassword}
                  onToggle={() => setShowCurrentPassword((prev) => !prev)}
                />
              </div>
            </label>
            <label className="field">
              <span className="label">New password</span>
              <div className="password-input-wrap">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={6}
                />
                <PasswordEyeButton
                  visible={showNewPassword}
                  onToggle={() => setShowNewPassword((prev) => !prev)}
                />
              </div>
            </label>
            <label className="field">
              <span className="label">Confirm new password</span>
              <div className="password-input-wrap">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={6}
                />
                <PasswordEyeButton
                  visible={showConfirmPassword}
                  onToggle={() => setShowConfirmPassword((prev) => !prev)}
                />
              </div>
            </label>
            {passwordError ? <p className="error">{passwordError}</p> : null}
            {passwordSuccess ? <p className="success">{passwordSuccess}</p> : null}
            <div className="submit-wrap">
              <button type="button" className="ghost-btn" onClick={onLogout}>
                Sign out
              </button>
              <button type="submit" className="submit" disabled={changingPassword}>
                {changingPassword ? 'Saving…' : 'Save new password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <AppShell
      tenantAccount={account}
      tenantUser={sessionUser}
      onTenantLogout={onLogout}
      featurePage={featurePage}
    />
  );
}
