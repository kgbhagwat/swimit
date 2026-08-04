import { FormEvent, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { emailHint, isValidEmail, isValidMobile, MOBILE_INVALID_MSG } from './formValidation';
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
};

const emptyForm: FormState = {
  userName: '',
  mobile: '',
  email: '',
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
  }) => void;
};

export function CreateUserForm({ onCreated }: CreateUserFormProps) {
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
      <h2>
        Create User{' '}
        <span className="create-user-heading-note">(A random password is sent on WhatsApp.)</span>
      </h2>

      <div className="create-user-fields">
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

        <MobileField
          label="User Mobile No."
          value={form.mobile}
          onChange={(value) => setField('mobile', value)}
          required
        />

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
      </div>

      <div className="pass-form-actions">
        <button
          type="button"
          className="pass-cancel"
          onClick={() => {
            setForm(emptyForm);
            setError('');
            setSuccess('');
          }}
        >
          Clear
        </button>
        {error || success ? (
          <p className={`${error ? 'error' : 'success'} holiday-action-message`}>
            {error || success}
          </p>
        ) : null}
        <button type="submit" className="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Create User'}
        </button>
      </div>
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
