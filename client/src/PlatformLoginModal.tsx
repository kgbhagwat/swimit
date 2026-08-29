import { FormEvent, useEffect, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { exitApplicationDemo } from './applicationDemo';
import { navigateToCurrentVersion } from './clientVersion';
import { emailHint, isValidEmail, isValidMobile, MOBILE_INVALID_MSG } from './formValidation';
import { useT } from './i18n';
import { LoginCaptchaField, useLoginCaptcha } from './LoginCaptcha';
import { MobileField } from './MobileField';
import {
  clearPlatformSession,
  isSaasManagementCode,
  setPlatformSession,
} from './platformSession';
import { setActiveTenant } from './tenantSession';

const ACCOUNT_CODE_RE = /^[a-z0-9]{6}$/;

export type PlatformLoginFormState = {
  accountCode: string;
  userName: string;
  password: string;
};

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

export function PlatformLoginModal({
  open,
  onClose,
  form,
  onFormChange,
}: {
  open: boolean;
  onClose: () => void;
  form: PlatformLoginFormState;
  onFormChange: (patch: Partial<PlatformLoginFormState>) => void;
}) {
  const navigate = useNavigate();
  const t = useT();
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMobile, setForgotMobile] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [openedAt, setOpenedAt] = useState(0);
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const captcha = useLoginCaptcha(open && mode === 'login' && captchaRequired);

  useEffect(() => {
    if (!open) return;
    setOpenedAt(Date.now());
    setMode('login');
    setError('');
    setSuccess('');
    setForgotEmail('');
    setForgotMobile('');
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function closeFromBackdrop(e: MouseEvent) {
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
      if (captchaRequired && !captcha.value) {
        throw new Error(t('Enter the captcha code'));
      }
      const accountRes = await fetch(`/api/saas-accounts/by-code/${encodeURIComponent(code)}`);
      const accountBody = await accountRes.json().catch(() => ({}));
      if (!accountRes.ok) throw new Error(accountBody.error ?? 'Account not found');

      const res = await fetch(`/api/saas-accounts/by-code/${encodeURIComponent(code)}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName: form.userName.trim() || 'admin',
          password: form.password,
          ...(captchaRequired && captcha.value
            ? {
                captchaId: captcha.value.captchaId,
                captchaAnswer: captcha.value.captchaAnswer,
              }
            : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.captchaRequired === true) setCaptchaRequired(true);
        throw new Error(body.error ?? 'Login failed');
      }
      setCaptchaRequired(false);

      const user = {
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
          csrfToken: user.csrfToken,
        });
        onClose();
        void navigateToCurrentVersion('/accounts', (path) => navigate(path, { replace: true }));
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
      void navigateToCurrentVersion(`/${code}/dashboard`, (path) =>
        navigate(path, { replace: true }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      if (captchaRequired) void captcha.refresh();
    } finally {
      setLoggingIn(false);
    }
  }

  async function onForgotSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    const code = normalizeAccountCode(form.accountCode);
    if (!ACCOUNT_CODE_RE.test(code)) {
      setError(t('Enter a valid 6-character account code'));
      return;
    }
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
      const res = await fetch(
        `/api/saas-accounts/by-code/${encodeURIComponent(code)}/forgot-password`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: forgotEmail.trim(),
            mobile: forgotMobile,
          }),
        },
      );
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

  return createPortal(
    <div
      className="modal-backdrop platform-login-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'forgot' ? t('Forgot password') : t('Login')}
      onMouseDown={closeFromBackdrop}
    >
      <div
        className="modal-panel platform-login-panel"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="platform-login-layout">
          <aside className="platform-login-brand" aria-hidden="true">
            <img src="/swimit-login.png" alt="" className="platform-login-brand-image" />
          </aside>
          <div className="platform-login-content">
            <div className="platform-login-branding">
              <img
                src="/swimit-logo.png"
                alt="SwimIT — Swimming Pool Management System"
                className="platform-login-logo"
              />
            </div>
            {mode === 'login' ? (
              <form className="platform-login-form" onSubmit={onSubmit}>
                <label className="field platform-login-code-field">
                  <span className="label">
                    {t('Code')} <span className="req">*</span>
                  </span>
                  <input
                    value={form.accountCode}
                    onChange={(e) =>
                      onFormChange({ accountCode: normalizeAccountCode(e.target.value) })
                    }
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
                    {t('Login ID')} <span className="req">*</span>
                  </span>
                  <input
                    value={form.userName}
                    onChange={(e) => onFormChange({ userName: e.target.value })}
                    autoComplete="username"
                    placeholder={t('User name, mobile, or email')}
                    required
                  />
                </label>
                <label className="field">
                  <span className="label">
                    {t('Password')} <span className="req">*</span>
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
                {captchaRequired ? (
                  <LoginCaptchaField
                    challenge={captcha.challenge}
                    answer={captcha.answer}
                    onAnswerChange={captcha.setAnswer}
                    onRefresh={() => void captcha.refresh()}
                    loading={captcha.loading}
                    loadError={captcha.loadError}
                    disabled={loggingIn}
                  />
                ) : null}
                <div className="platform-login-forgot-row">
                  <button
                    type="button"
                    className="platform-login-forgot-link"
                    onClick={() => {
                      setError('');
                      setSuccess('');
                      setMode('forgot');
                    }}
                  >
                    {t('Forgot password?')}
                  </button>
                </div>
                {error ? <p className="error">{error}</p> : null}
                {success ? <p className="platform-login-success">{success}</p> : null}
                <div className="platform-login-actions">
                  <button type="button" className="ghost-btn" onClick={onClose} disabled={loggingIn}>
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
                    'Enter your account code, registered email, and mobile. If they match, a new temporary password will be sent to your WhatsApp and email.',
                  )}
                </p>
                <label className="field platform-login-code-field">
                  <span className="label">
                    {t('Code')} <span className="req">*</span>
                  </span>
                  <input
                    value={form.accountCode}
                    onChange={(e) =>
                      onFormChange({ accountCode: normalizeAccountCode(e.target.value) })
                    }
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
                      setMode('login');
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
    </div>,
    document.body,
  );
}
