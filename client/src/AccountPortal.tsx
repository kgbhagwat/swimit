import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useOutlet, useParams } from 'react-router-dom';
import { AppShell } from './AppShell';
import { navigateToCurrentVersion } from './clientVersion';
import { emailHint, isValidEmail, isValidMobile, MOBILE_INVALID_MSG } from './formValidation';
import { useT } from './i18n';
import { LoginCaptchaField, useLoginCaptcha } from './LoginCaptcha';
import {
  captureLoginLocation,
  parseRemoteAccessRequired,
  RemoteAccessRequiredError,
  type RemoteAccessPending,
} from './loginLocation';
import { MobileField } from './MobileField';
import { passwordPolicyError } from './passwordPolicy';
import { isSaasManagementCode, setPlatformSession } from './platformSession';
import {
  clearPlatformImpersonation,
  setActiveTenant,
  SESSION_TIMEOUT_EVENT,
  touchSessionActivity,
  readSessionActivityAt,
  clearSessionActivity,
} from './tenantSession';
import {
  canUseBiometricLogin,
  enrollBiometricLogin,
  isMobileLikeDevice,
  loginWithBiometric,
  readBiometricPref,
  type BiometricDevicePref,
} from './webauthn';

type AccountInfo = {
  id: number;
  accountName: string;
  accountCode: string;
  status: string;
  packageName?: string;
  modules?: string;
  featureKeys?: string[];
  loginSessionTimeoutMinutes?: number;
};

type SessionUser = {
  id: number;
  userName: string;
  mobile: string;
  mustChangePassword: boolean;
  isAccountAdmin: boolean;
  menuAccess?: string[];
  isPlatformImpersonation?: boolean;
  csrfToken?: string;
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
  const [loginMethod, setLoginMethod] = useState<'password' | 'biometric'>('password');
  const [loginUserName, setLoginUserName] = useState('admin');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricPref, setBiometricPref] = useState<BiometricDevicePref | null>(null);
  const [biometricOfferUser, setBiometricOfferUser] = useState<SessionUser | null>(null);
  const [biometricBusy, setBiometricBusy] = useState(false);
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
  const [remotePending, setRemotePending] = useState<RemoteAccessPending | null>(null);
  const captcha = useLoginCaptcha(
    !sessionUser && !remotePending && loginMode === 'login' && loginMethod === 'password',
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supported = await canUseBiometricLogin();
      if (cancelled) return;
      setBiometricSupported(supported);
      const pref = ACCOUNT_CODE_RE.test(code) ? readBiometricPref(code) : null;
      setBiometricPref(pref);
      if (supported && pref?.enabled) {
        setLoginMethod('biometric');
        if (pref.userName) setLoginUserName(pref.userName);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

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
          featureKeys: Array.isArray(body.featureKeys)
            ? body.featureKeys.map(String).filter(Boolean)
            : undefined,
          loginSessionTimeoutMinutes: Number(body.loginSessionTimeoutMinutes ?? 30),
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
        const storedUser = readSession(code);
        if (storedUser) {
          const sessionRes = await fetch('/api/auth/session');
          const sessionBody = await sessionRes.json().catch(() => ({}));
          if (
            sessionRes.ok &&
            String(sessionBody.auth?.accountCode ?? '').toLowerCase() === code
          ) {
            const refreshed = {
              ...storedUser,
              csrfToken: String(sessionBody.csrfToken ?? storedUser.csrfToken ?? ''),
            };
            writeSession(code, refreshed);
            setSessionUser(refreshed);
          } else {
            clearSession(code);
            setSessionUser(null);
          }
        } else {
          setSessionUser(null);
        }
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
          csrfToken: sessionUser.csrfToken ?? '',
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

  useEffect(() => {
    function onTimeoutSaved(event: Event) {
      const minutes = Number((event as CustomEvent<{ minutes?: number }>).detail?.minutes);
      if (!Number.isFinite(minutes)) return;
      setAccount((prev) => (prev ? { ...prev, loginSessionTimeoutMinutes: minutes } : prev));
    }
    window.addEventListener(SESSION_TIMEOUT_EVENT, onTimeoutSaved);
    return () => window.removeEventListener(SESSION_TIMEOUT_EVENT, onTimeoutSaved);
  }, []);

  useEffect(() => {
    const minutes = Number(account?.loginSessionTimeoutMinutes ?? 0);
    if (!account || !sessionUser || minutes <= 0) return;

    const limitMs = minutes * 60 * 1000;
    if (!readSessionActivityAt(code)) {
      touchSessionActivity(code);
    }

    const expireSession = () => {
      void fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
      clearSession(code);
      clearSessionActivity(code);
      if (sessionUser.isPlatformImpersonation) clearPlatformImpersonation();
      setActiveTenant(null);
      setSessionUser(null);
      setLoginPassword('');
      setError(t('Your login session expired. Please sign in again.'));
    };

    const isExpired = () => Date.now() - readSessionActivityAt(code) > limitMs;

    const check = () => {
      if (isExpired()) expireSession();
    };

    const onActivity = () => {
      if (isExpired()) {
        expireSession();
        return;
      }
      touchSessionActivity(code);
    };

    const events: Array<keyof WindowEventMap> = [
      'pointerdown',
      'keydown',
      'click',
      'scroll',
      'touchstart',
    ];
    for (const name of events) {
      window.addEventListener(name, onActivity, { passive: true });
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisibility);
    check();
    const timer = window.setInterval(check, 10_000);
    return () => {
      for (const name of events) {
        window.removeEventListener(name, onActivity);
      }
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(timer);
    };
  }, [account, sessionUser, code, t]);

  function finishAuthenticatedSession(user: SessionUser, opts?: { offerBiometric?: boolean }) {
    if (!user.isPlatformImpersonation) clearPlatformImpersonation();
    writeSession(code, user);
    touchSessionActivity(code);
    setSessionUser(user);
    setLoginPassword('');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setPasswordSuccess('');

    const offerSkipped =
      typeof sessionStorage !== 'undefined' &&
      sessionStorage.getItem(`swimIT.webauthnOfferSkipped.${code}`) === '1';
    const shouldOffer =
      Boolean(opts?.offerBiometric) &&
      !user.mustChangePassword &&
      biometricSupported &&
      isMobileLikeDevice() &&
      !readBiometricPref(code)?.enabled &&
      !offerSkipped;

    if (shouldOffer) {
      setBiometricOfferUser(user);
      return;
    }

    enterAppAfterLogin(user);
  }

  function enterAppAfterLogin(user: SessionUser) {
    setBiometricOfferUser(null);
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
          csrfToken: user.csrfToken ?? '',
        });
      }
      void navigateToCurrentVersion('/accounts', (path) => navigate(path, { replace: true }));
      return;
    }
    if (account && !user.mustChangePassword) {
      setActiveTenant({ id: account.id, accountCode: account.accountCode || code });
      void navigateToCurrentVersion(`/${code}/dashboard`, (path) =>
        navigate(path, { replace: true }),
      );
    }
  }

  useEffect(() => {
    if (!remotePending) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const params = new URLSearchParams({
          requestId: String(remotePending.requestId),
          statusToken: remotePending.statusToken,
        });
        const res = await fetch(`/api/remote-login/status?${params.toString()}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const status = String(body.status ?? '');
        if (status === 'approved') {
          setRemotePending(null);
          setSuccess(
            t('Remote access approved. Sign in again to continue.'),
          );
          void captcha.refresh();
        } else if (status === 'denied') {
          setRemotePending(null);
          setError(t('Remote access was denied by an admin.'));
          void captcha.refresh();
        }
      } catch {
        // keep waiting
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [remotePending, t, captcha.refresh]);

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setRemotePending(null);
    setLoggingIn(true);
    try {
      if (loginMethod === 'biometric') {
        const pref = biometricPref ?? readBiometricPref(code);
        const result = await loginWithBiometric({
          accountCode: code,
          userName: loginUserName.trim() || pref?.userName || undefined,
          credentialId: pref?.credentialId,
        });
        const user: SessionUser = {
          id: result.user.id,
          userName: result.user.userName,
          mobile: result.user.mobile,
          mustChangePassword: result.user.mustChangePassword,
          isAccountAdmin: result.user.isAccountAdmin,
          menuAccess: result.user.menuAccess,
          csrfToken: result.csrfToken,
        };
        setBiometricPref({
          credentialId: result.credentialId,
          userName: user.userName,
          enabled: true,
        });
        finishAuthenticatedSession(user);
        return;
      }

      if (!captcha.value) {
        throw new Error(t('Enter the captcha code'));
      }
      const geo = await captureLoginLocation();
      const res = await fetch(`/api/saas-accounts/by-code/${encodeURIComponent(code)}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName: loginUserName.trim() || 'admin',
          password: loginPassword,
          captchaId: captcha.value.captchaId,
          captchaAnswer: captcha.value.captchaAnswer,
          latitude: geo?.latitude ?? null,
          longitude: geo?.longitude ?? null,
          accuracyM: geo?.accuracyM ?? null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const pending = parseRemoteAccessRequired(body as Record<string, unknown>);
        if (pending) {
          setRemotePending(pending);
          void captcha.refresh();
          return;
        }
        throw new Error(body.error ?? 'Login failed');
      }
      const user: SessionUser = {
        id: Number(body.user.id),
        userName: String(body.user.userName),
        mobile: String(body.user.mobile ?? ''),
        mustChangePassword: Boolean(body.user.mustChangePassword),
        isAccountAdmin: Boolean(body.user.isAccountAdmin),
        menuAccess: Array.isArray(body.user.menuAccess)
          ? body.user.menuAccess.map(String)
          : [],
        csrfToken: String(body.csrfToken ?? ''),
      };
      if (body.account?.loginSessionTimeoutMinutes != null) {
        const minutes = Number(body.account.loginSessionTimeoutMinutes);
        if (Number.isFinite(minutes)) {
          setAccount((prev) =>
            prev ? { ...prev, loginSessionTimeoutMinutes: minutes } : prev,
          );
        }
      }
      finishAuthenticatedSession(user, { offerBiometric: true });
    } catch (err) {
      if (err instanceof RemoteAccessRequiredError) {
        setRemotePending(err.pending);
        if (loginMethod === 'password') void captcha.refresh();
        return;
      }
      setError(err instanceof Error ? err.message : 'Login failed');
      if (loginMethod === 'password') void captcha.refresh();
    } finally {
      setLoggingIn(false);
    }
  }

  async function onEnableBiometricOffer() {
    if (!biometricOfferUser) return;
    setBiometricBusy(true);
    setError('');
    try {
      const pref = await enrollBiometricLogin({
        accountCode: code,
        userId: biometricOfferUser.id,
      });
      setBiometricPref(pref);
      enterAppAfterLogin(biometricOfferUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enable biometric login');
    } finally {
      setBiometricBusy(false);
    }
  }

  function onSkipBiometricOffer() {
    if (!biometricOfferUser) return;
    try {
      sessionStorage.setItem(`swimIT.webauthnOfferSkipped.${code}`, '1');
    } catch {
      // ignore
    }
    enterAppAfterLogin(biometricOfferUser);
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
    const policyError = passwordPolicyError(newPassword);
    if (policyError) {
      setPasswordError(policyError);
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
        csrfToken: String(body.csrfToken ?? sessionUser.csrfToken ?? ''),
      };
      finishAuthenticatedSession(user, { offerBiometric: true });
      setPasswordSuccess(
        isSaasManagementCode(code)
          ? 'Password updated. Opening SaaS management…'
          : 'Password updated.',
      );
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  }

  async function onLogout() {
    const returnToPlatform = Boolean(sessionUser?.isPlatformImpersonation);
    if (returnToPlatform) {
      try {
        const res = await fetch('/api/auth/impersonation/exit', { method: 'POST' });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? 'Failed to return to platform');
        setPlatformSession(body.platform);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to return to platform');
        return;
      }
    } else {
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    }
    clearSession(code);
    clearSessionActivity(code);
    if (returnToPlatform) clearPlatformImpersonation();
    setActiveTenant(null);
    setSessionUser(null);
    setLoginPassword('');
    setError('');
    if (returnToPlatform) navigate('/accounts', { replace: true });
  }

  if (!ACCOUNT_CODE_RE.test(code)) {
    return <Navigate to="/" replace />;
  }

  // SwimIT SaaS management account opens the platform home, not the pool app
  if (
    isSaasManagementCode(code) &&
    account &&
    sessionUser &&
    !sessionUser.mustChangePassword &&
    !biometricOfferUser
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

  if (biometricOfferUser) {
    return (
      <div className="account-login-shell">
        <div
          className="modal-panel platform-login-panel account-login-panel"
          role="dialog"
          aria-modal="true"
          aria-label={t('Biometric login')}
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
              <div className="platform-login-form biometric-offer">
                <h2 className="biometric-offer-title">{t('Use biometric login?')}</h2>
                <p className="muted biometric-offer-copy">
                  {t(
                    'On this phone you can sign in next time with Face ID or fingerprint instead of typing your password.',
                  )}
                </p>
                {error ? <p className="error">{error}</p> : null}
                <div className="platform-login-actions platform-login-actions-inline">
                  <button
                    type="button"
                    className="ghost-btn"
                    disabled={biometricBusy}
                    onClick={onSkipBiometricOffer}
                  >
                    {t('Not now')}
                  </button>
                  <button
                    type="button"
                    className="submit"
                    disabled={biometricBusy}
                    onClick={() => void onEnableBiometricOffer()}
                  >
                    {biometricBusy ? t('Setting up…') : t('Enable biometric')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!sessionUser) {
    const showBiometricChoice = biometricSupported;
    const biometricReady = Boolean(biometricPref?.enabled && biometricPref.credentialId);
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
              {loginMode === 'login' && remotePending ? (
                <div className="platform-login-form remote-login-pending">
                  <h2 className="biometric-offer-title">{t('Waiting for admin approval')}</h2>
                  <p className="muted">
                    {remotePending.distanceKm == null
                      ? t(
                          'Your location could not be verified near the pool. An admin was notified by email and WhatsApp.',
                        )
                      : t(
                          'You are about {distance} km from the pool (limit {limit} km). An admin was notified by email and WhatsApp.',
                        )
                          .replace(
                            '{distance}',
                            String(remotePending.distanceKm.toFixed(1)),
                          )
                          .replace('{limit}', String(remotePending.thresholdKm))}
                  </p>
                  <p className="muted">{t('This page updates automatically when they approve or deny.')}</p>
                  <div className="platform-login-actions">
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => {
                        setRemotePending(null);
                        setError('');
                        void captcha.refresh();
                      }}
                    >
                      {t('Back to login')}
                    </button>
                  </div>
                </div>
              ) : loginMode === 'login' ? (
                <form className="platform-login-form" onSubmit={onLogin}>
                  {showBiometricChoice ? (
                    <div
                      className="login-method-toggle"
                      role="group"
                      aria-label={t('Login method')}
                    >
                      <button
                        type="button"
                        className={
                          loginMethod === 'password'
                            ? 'login-method-btn is-active'
                            : 'login-method-btn'
                        }
                        onClick={() => {
                          setLoginMethod('password');
                          setError('');
                        }}
                      >
                        {t('Password')}
                      </button>
                      <button
                        type="button"
                        className={
                          loginMethod === 'biometric'
                            ? 'login-method-btn is-active'
                            : 'login-method-btn'
                        }
                        onClick={() => {
                          setLoginMethod('biometric');
                          setError('');
                        }}
                        disabled={!biometricReady}
                        title={
                          biometricReady
                            ? t('Sign in with Face ID or fingerprint')
                            : t('Enable biometric after password login on this phone')
                        }
                      >
                        {t('Biometric')}
                      </button>
                    </div>
                  ) : null}
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
                  {loginMethod === 'password' ? (
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
                  ) : (
                    <p className="muted biometric-login-hint">
                      {t('Tap Sign in, then confirm with Face ID or fingerprint on this phone.')}
                    </p>
                  )}
                  {loginMethod === 'password' ? (
                    <>
                      <LoginCaptchaField
                        challenge={captcha.challenge}
                        answer={captcha.answer}
                        onAnswerChange={captcha.setAnswer}
                        onRefresh={() => void captcha.refresh()}
                        loading={captcha.loading}
                        loadError={captcha.loadError}
                        disabled={loggingIn}
                      />
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
                    </>
                  ) : null}
                  {error ? <p className="error">{error}</p> : null}
                  {success ? <p className="platform-login-success">{success}</p> : null}
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
                      {loggingIn
                        ? t('Signing in…')
                        : loginMethod === 'biometric'
                          ? t('Sign in with biometrics')
                          : t('Sign in')}
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
            autoComplete="off"
          >
            <label className="field">
              <span className="label">Current (temporary) password</span>
              <div className="password-input-wrap">
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
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
                  minLength={8}
                />
                <PasswordEyeButton
                  visible={showNewPassword}
                  onToggle={() => setShowNewPassword((prev) => !prev)}
                />
              </div>
              <span className="muted field-hint">
                {t('Password must be at least 8 characters with at least 1 letter and 1 number')}
              </span>
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
                  minLength={8}
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
