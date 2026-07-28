import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { emailHint, isValidEmail, isValidMobile, mobileHint } from './formValidation';
import {
  isPlatformUsersPath,
  platformUsersPath,
  tenantPath,
} from './tenantSession';

type FormState = {
  userName: string;
  mobile: string;
  email: string;
};

const emptyForm: FormState = {
  userName: '',
  mobile: '',
  email: '',
};

export function CreateUser() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const onPlatform = isPlatformUsersPath(pathname);
  const userManagementTo = onPlatform
    ? platformUsersPath('/user-management')
    : tenantPath('/user-management');
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError('');
    setWarning('');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setWarning('');

    if (!form.userName.trim()) {
      setError('Enter User Name');
      return;
    }
    if (!isValidMobile(form.mobile)) {
      setError('Enter a valid 10-digit mobile number');
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
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to create user');
      const warnList = Array.isArray(body.warnings) ? body.warnings.map(String) : [];
      const delivery = typeof body.deliveryNote === 'string' ? body.deliveryNote : '';
      const tempPassword =
        typeof body.temporaryPassword === 'string' ? body.temporaryPassword : '';
      const parts = [
        tempPassword ? `Temporary password: ${tempPassword}` : '',
        delivery,
        ...warnList,
      ].filter(Boolean);
      if (parts.length) {
        setWarning(parts.join(' '));
        window.setTimeout(() => navigate(userManagementTo, { replace: true }), 2200);
        return;
      }
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
          ? 'Add a SwimIT SaaS platform login user. A random password is generated and sent on WhatsApp.'
          : 'Add a SwimIT login user. A random password is generated and sent on WhatsApp.'}
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

        <label className="field">
          <span className="label">
            Email <span className="req">*</span>
          </span>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setField('email', e.target.value)}
            placeholder="name@example.com"
            autoComplete="email"
            aria-invalid={Boolean(emailHint(form.email))}
            required
          />
          {emailHint(form.email) ? (
            <span className="field-error">{emailHint(form.email)}</span>
          ) : null}
        </label>

        {error ? <p className="error">{error}</p> : null}
        {warning ? <p className="success">{warning}</p> : null}

        <div className="pass-form-actions">
          <button
            type="button"
            className="pass-cancel"
            onClick={() => {
              setForm(emptyForm);
              setError('');
              setWarning('');
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
