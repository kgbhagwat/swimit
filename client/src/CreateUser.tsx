import { FormEvent, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { emailHint, isValidEmail, isValidMobile, MOBILE_INVALID_MSG } from './formValidation';
import { useT } from './i18n';
import { InPageSelect } from './InPageSelect';
import { parseLoginType, type UserLoginType } from './menuCatalog';
import { MobileField } from './MobileField';
import {
  isPlatformUsersPath,
  platformUsersPath,
  tenantPath,
} from './tenantSession';

type FormState = {
  userName: string;
  mobile: string;
  email: string;
  loginType: UserLoginType;
};

const emptyForm: FormState = {
  userName: '',
  mobile: '',
  email: '',
  loginType: 'normal',
};

type CreateUserFormProps = {
  onCreated?: (user: {
    id: number;
    userName: string;
    mobile: string;
    email: string;
    menuAccess: string[];
    createdAt: string;
    isAccountAdmin?: boolean;
    loginType?: UserLoginType;
  }) => void;
};

export function CreateUserForm({ onCreated }: CreateUserFormProps) {
  const t = useT();
  const { pathname } = useLocation();
  const platformMode = isPlatformUsersPath(pathname);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError('');
    setSuccess('');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!form.userName.trim()) {
      setError('Enter User Name');
      return;
    }
    if (!isValidMobile(form.mobile)) {
      setError(MOBILE_INVALID_MSG);
      return;
    }
    if (!isValidEmail(form.email)) {
      setError('Enter a valid email address');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName: form.userName.trim(),
          mobile: form.mobile.trim(),
          email: form.email.trim(),
          ...(platformMode ? {} : { loginType: form.loginType }),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to create user');
      setForm(emptyForm);
      if (body.whatsappOk === false) {
        setError(
          String(body.whatsappError || body.deliveryNote || 'User created, but WhatsApp send failed'),
        );
      } else {
        setSuccess('User created and password sent on WhatsApp. Now manage access below.');
      }
      onCreated?.({
        id: Number(body.id),
        userName: String(body.userName ?? form.userName.trim()),
        mobile: String(body.mobile ?? form.mobile.trim()),
        email: String(body.email ?? form.email.trim()),
        menuAccess: Array.isArray(body.menuAccess) ? body.menuAccess.map(String) : [],
        createdAt: String(body.createdAt ?? new Date().toISOString()),
        isAccountAdmin: Boolean(body.isAccountAdmin),
        loginType: parseLoginType(body.loginType),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      id="create-user"
      className="pass-form-card pool-core-form create-user-form"
      onSubmit={onSubmit}
    >
      <div className="create-user-top">
        <h2>
          {t('Create User')}{' '}
          <span className="create-user-heading-note">
            {t('(A random password is sent on WhatsApp.)')}
          </span>
        </h2>

        <div className="create-user-fields">
          <label className="field field-beside">
            <span className="label">
              {t('User Name')} <span className="req">*</span>
            </span>
            <input
              className="create-user-name-input"
              value={form.userName}
              onChange={(e) => setField('userName', e.target.value)}
              placeholder={t('User name')}
              autoComplete="username"
              required
            />
          </label>

          <MobileField
            label={t('Mobile')}
            value={form.mobile}
            onChange={(value) => setField('mobile', value)}
            required
            className="field field-beside"
            inputClassName="create-user-mobile-input"
            placeholder={t('10-digit number')}
          />

          <label className="field field-beside">
            <span className="label">
              {t('Email')} <span className="req">*</span>
            </span>
            <input
              className="create-user-email-input"
              type="email"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              placeholder="name@example.com"
              autoComplete="email"
              aria-invalid={Boolean(emailHint(form.email))}
              required
            />
            {emailHint(form.email) ? (
              <span className="field-error">{t(emailHint(form.email))}</span>
            ) : null}
          </label>

          {!platformMode ? (
            <label className="field field-beside create-user-login-type">
              <span className="label">
                {t('Login type')} <span className="req">*</span>
              </span>
              <InPageSelect
                value={form.loginType}
                onChange={(value) => setField('loginType', parseLoginType(value))}
                options={[
                  { value: 'normal', label: t('Normal') },
                  { value: 'coach', label: t('Coach') },
                ]}
                required
                aria-label={t('Login type')}
              />
            </label>
          ) : null}

          <div className="create-user-row-actions">
            <button
              type="button"
              className="pass-cancel"
              onClick={() => {
                setForm(emptyForm);
                setError('');
                setSuccess('');
              }}
            >
              {t('Clear')}
            </button>
            <button type="submit" className="submit" disabled={saving}>
              {saving ? t('Saving…') : t('Create User')}
            </button>
          </div>
        </div>
        {!platformMode && form.loginType === 'coach' ? (
          <p className="hint create-user-login-geo-hint">
            {t(
              'Coach logins can open only Swimmer Progress and Progress Trend for their assigned swimmers.',
            )}
          </p>
        ) : null}
      </div>

      {error || success ? (
        <p className={`${error ? 'error' : 'success'} create-user-message`}>
          {t(error || success)}
        </p>
      ) : null}
    </form>
  );
}

/** Legacy route — Create User now lives on User Management. */
export function CreateUser() {
  const { pathname } = useLocation();
  const target = isPlatformUsersPath(pathname)
    ? platformUsersPath('/user-management')
    : tenantPath('/user-management');
  return <Navigate to={target} replace />;
}
