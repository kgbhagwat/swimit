import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { isValidMobile, mobileHint } from './formValidation';
import {
  isPlatformUsersPath,
  platformUsersPath,
  tenantPath,
} from './tenantSession';

type FormState = {
  userName: string;
  mobile: string;
  password: string;
};

const emptyForm: FormState = {
  userName: '',
  mobile: '',
  password: '',
};

export function CreateUser() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const onPlatform = isPlatformUsersPath(pathname);
  const userManagementTo = onPlatform
    ? platformUsersPath('/user-management')
    : tenantPath('/user-management');
  const [form, setForm] = useState<FormState>(emptyForm);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError('');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.userName.trim()) {
      setError('Enter User Name');
      return;
    }
    if (!isValidMobile(form.mobile)) {
      setError('Enter a valid 10-digit mobile number');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters');
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
          password: form.password,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to create user');
      navigate(userManagementTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div className="top-row">
        <Link className="menu-link" to={userManagementTo}>
          ← User Management
        </Link>
      </div>

      <h1>Create User</h1>
      <p className="lede">
        {onPlatform
          ? 'Add a SwimIT SaaS platform login user with name, mobile number, and password.'
          : 'Add a SwimIT login user with name, mobile number, and password.'}
      </p>

      <form className="pass-form-card create-user-form" onSubmit={onSubmit}>
        <label className="field">
          <span className="label">
            User Name <span className="req">*</span>
          </span>
          <input
            value={form.userName}
            onChange={(e) => setField('userName', e.target.value)}
            placeholder="Enter user name"
            autoComplete="username"
            required
          />
        </label>

        <label className="field">
          <span className="label">
            User Mobile No. <span className="req">*</span>
          </span>
          <input
            value={form.mobile}
            onChange={(e) => setField('mobile', e.target.value.replace(/\D/g, '').slice(0, 10))}
            placeholder="10-digit mobile number"
            inputMode="numeric"
            autoComplete="tel"
            aria-invalid={Boolean(mobileHint(form.mobile))}
            required
          />
          {mobileHint(form.mobile) ? (
            <span className="field-error">{mobileHint(form.mobile)}</span>
          ) : null}
        </label>

        <div className="field">
          <span className="label">
            Password <span className="req">*</span>
          </span>
          <div className="password-input-wrap">
            <input
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={(e) => setField('password', e.target.value)}
              placeholder="At least 6 characters"
              autoComplete="new-password"
              required
              minLength={6}
            />
            <button
              type="button"
              className="password-eye"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Hide password' : 'View password'}
              aria-pressed={showPassword}
            >
              {showPassword ? (
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
          </div>
        </div>

        {error ? <p className="error">{error}</p> : null}

        <div className="pass-form-actions">
          <button
            type="button"
            className="pass-cancel"
            onClick={() => {
              setForm(emptyForm);
              setShowPassword(false);
              setError('');
            }}
          >
            Clear
          </button>
          <button type="submit" className="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Create User'}
          </button>
        </div>
      </form>
    </div>
  );
}
