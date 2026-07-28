import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { emailHint, isValidEmail, isValidMobile, mobileHint } from './formValidation';
import { PlatformNav } from './PlatformNav';
import { getPlatformSession } from './platformSession';

type AccountForm = {
  accountName: string;
  accountCode: string;
  poolAddress: string;
  contactName: string;
  mobile: string;
  email: string;
  city: string;
};

type CodeCheck = {
  status: 'idle' | 'checking' | 'available' | 'taken' | 'invalid';
  message: string;
};

type CreatedCredentials = {
  accountName: string;
  accountCode: string;
  poolAddress: string;
  contactName: string;
  mobile: string;
  email: string;
  city: string;
  loginUrl: string;
  adminUserName: string;
  temporaryPassword: string;
  deliveryNote: string;
};

const ACCOUNT_CODE_RE = /^[a-z0-9]{6}$/;

const emptyForm: AccountForm = {
  accountName: '',
  accountCode: '',
  poolAddress: '',
  contactName: '',
  mobile: '',
  email: '',
  city: '',
};

function normalizeAccountCodeInput(value: string) {
  return value.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toLowerCase();
}

function accountLoginUrl(code: string) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
  return `${origin}/${code}`;
}

export function CreateAccount() {
  const canManageAccounts = Boolean(getPlatformSession());
  const [form, setForm] = useState<AccountForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [codeCheck, setCodeCheck] = useState<CodeCheck>({ status: 'idle', message: '' });
  const [created, setCreated] = useState<CreatedCredentials | null>(null);

  useEffect(() => {
    const code = form.accountCode;
    if (!code) {
      setCodeCheck({ status: 'idle', message: '' });
      return;
    }
    if (!ACCOUNT_CODE_RE.test(code)) {
      setCodeCheck({
        status: 'invalid',
        message: code.length < 6 ? 'Enter all 6 characters' : 'Use small letters and numbers only',
      });
      return;
    }

    let cancelled = false;
    setCodeCheck({ status: 'checking', message: 'Checking…' });
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/saas-accounts/check-code/${encodeURIComponent(code)}`);
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body.error ?? 'Failed to check code');
          if (cancelled) return;
          if (body.available) {
            setCodeCheck({ status: 'available', message: 'Available' });
          } else {
            setCodeCheck({ status: 'taken', message: 'Try another' });
          }
        } catch {
          if (!cancelled) {
            setCodeCheck({ status: 'invalid', message: 'Could not check code' });
          }
        }
      })();
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [form.accountCode]);

  function setField<K extends keyof AccountForm>(key: K, value: AccountForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError('');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.accountName.trim()) {
      setError('Enter account / pool name');
      return;
    }
    if (!ACCOUNT_CODE_RE.test(form.accountCode)) {
      setError('Enter a 6-character account code (small letters and numbers)');
      return;
    }
    if (codeCheck.status === 'taken') {
      setError('Account code is not available. Try another.');
      return;
    }
    if (codeCheck.status === 'checking') {
      setError('Wait for account code check to finish');
      return;
    }
    if (!form.contactName.trim()) {
      setError('Enter contact name');
      return;
    }
    if (!isValidMobile(form.mobile)) {
      setError(mobileHint(form.mobile) || 'Enter a valid 10-digit mobile number');
      return;
    }
    if (!form.email.trim()) {
      setError('Enter email');
      return;
    }
    if (!isValidEmail(form.email)) {
      setError(emailHint(form.email) || 'Enter a valid email address');
      return;
    }

    setSaving(true);
    setError('');
    setWarning('');
    try {
      const res = await fetch('/api/saas-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountName: form.accountName.trim(),
          accountCode: form.accountCode,
          poolAddress: form.poolAddress.trim(),
          contactName: form.contactName.trim(),
          mobile: form.mobile.trim(),
          email: form.email.trim(),
          city: form.city.trim(),
          servicePackageId: null,
          status: 'Active',
          notes: '',
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to create account');

      const code = String(body.accountCode ?? form.accountCode);
      const warnList = Array.isArray(body.warnings) ? body.warnings.map(String) : [];
      if (warnList.length) setWarning(warnList.join(' '));
      setCreated({
        accountName: String(body.accountName ?? form.accountName),
        accountCode: code,
        poolAddress: String(body.poolAddress ?? form.poolAddress),
        contactName: String(body.contactName ?? form.contactName),
        mobile: String(body.mobile ?? form.mobile),
        email: String(body.email ?? form.email),
        city: String(body.city ?? form.city),
        loginUrl: String(body.loginUrl ?? accountLoginUrl(code)),
        adminUserName: String(body.adminUser?.userName ?? 'admin'),
        temporaryPassword: String(body.adminUser?.temporaryPassword ?? ''),
        deliveryNote: String(
          body.deliveryNote ??
            'Share these details with the pool operator. They must change the password on first login.',
        ),
      });
      setForm(emptyForm);
      setCodeCheck({ status: 'idle', message: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    const mailto = created.email
      ? `mailto:${encodeURIComponent(created.email)}?subject=${encodeURIComponent(
          `SwimIT account ${created.accountCode}`,
        )}&body=${encodeURIComponent(
          [
            `Hello ${created.contactName},`,
            '',
            'Your SwimIT account is ready.',
            '',
            `Account / pool: ${created.accountName}`,
            created.poolAddress ? `Pool address: ${created.poolAddress}` : null,
            created.city ? `City: ${created.city}` : null,
            `Account code: ${created.accountCode}`,
            `Login URL: ${created.loginUrl}`,
            `Admin user: ${created.adminUserName}`,
            `Temporary password: ${created.temporaryPassword}`,
            '',
            'Please change the admin password on first login.',
          ]
            .filter(Boolean)
            .join('\n'),
        )}`
      : '';

    return (
      <>
        <PlatformNav />
        <div className="page">
        {canManageAccounts ? (
          <div className="top-row">
            <Link className="menu-link" to="/accounts">
              ← Accounts
            </Link>
          </div>
        ) : null}

        <h1>Account created</h1>
        <p className="lede">Send these details to the pool operator. Shown only once.</p>
        {warning ? <p className="error">{warning}</p> : null}

        <section className="pass-form-card account-credentials-card">
          <p className="success">{created.deliveryNote}</p>

          <dl className="account-credentials-list">
            <div>
              <dt>Account / pool</dt>
              <dd>{created.accountName}</dd>
            </div>
            {created.poolAddress ? (
              <div>
                <dt>Pool address</dt>
                <dd>{created.poolAddress}</dd>
              </div>
            ) : null}
            {created.city ? (
              <div>
                <dt>City</dt>
                <dd>{created.city}</dd>
              </div>
            ) : null}
            <div>
              <dt>Contact</dt>
              <dd>
                {created.contactName}
                <br />
                {created.mobile}
                {created.email ? ` · ${created.email}` : ''}
              </dd>
            </div>
            <div>
              <dt>Account code</dt>
              <dd>
                <code>{created.accountCode}</code>
              </dd>
            </div>
            <div>
              <dt>Login URL</dt>
              <dd>
                <a className="terms-link" href={created.loginUrl} target="_blank" rel="noreferrer">
                  {created.loginUrl}
                </a>
              </dd>
            </div>
            <div>
              <dt>Admin user</dt>
              <dd>
                <code>{created.adminUserName}</code>
              </dd>
            </div>
            <div>
              <dt>Temporary password</dt>
              <dd>
                <code className="temp-password">{created.temporaryPassword}</code>
              </dd>
            </div>
          </dl>

          <div className="submit-wrap" style={{ marginTop: '1rem' }}>
            {mailto ? (
              <a className="ghost-btn" href={mailto}>
                Email details
              </a>
            ) : null}
            {canManageAccounts ? (
              <Link className="submit" to="/accounts">
                Go to Accounts
              </Link>
            ) : (
              <Link className="submit" to="/">
                Back to Home
              </Link>
            )}
          </div>
        </section>
      </div>
      </>
    );
  }

  return (
    <>
      <PlatformNav />
      <div className="page">
      {canManageAccounts ? (
        <div className="top-row">
          <Link className="menu-link" to="/accounts">
            ← Accounts
          </Link>
        </div>
      ) : null}

      <h1>Create Account</h1>
      <p className="lede">Onboard a pool operator onto SwimIT SaaS.</p>

      <form className="pass-form-card" onSubmit={onSubmit}>
        <label className="field">
          <span className="label">
            Account / pool name <span className="req">*</span>
          </span>
          <input
            value={form.accountName}
            onChange={(e) => setField('accountName', e.target.value)}
            placeholder="e.g. AquaWave Sports Club"
            required
          />
        </label>

        <label className="field">
          <span className="label">
            Account code <span className="req">*</span>
          </span>
          <input
            value={form.accountCode}
            onChange={(e) => setField('accountCode', normalizeAccountCodeInput(e.target.value))}
            placeholder="6 small letters or numbers"
            maxLength={6}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            aria-describedby="account-code-status"
          />
          <span id="account-code-status" className={`account-code-status ${codeCheck.status}`}>
            {codeCheck.message}
          </span>
          {codeCheck.status === 'available' ? (
            <span className="hint">Login link: {accountLoginUrl(form.accountCode)}</span>
          ) : (
            <span className="hint">Used as login URL: http://localhost:5173/&lt;account-code&gt;</span>
          )}
        </label>

        <label className="field">
          <span className="label">Pool address</span>
          <textarea
            value={form.poolAddress}
            onChange={(e) => setField('poolAddress', e.target.value)}
            placeholder="Full pool address"
            rows={3}
          />
        </label>

        <div className="form-grid-2">
          <label className="field">
            <span className="label">
              Contact name <span className="req">*</span>
            </span>
            <input
              value={form.contactName}
              onChange={(e) => setField('contactName', e.target.value)}
              placeholder="Owner / manager name"
              required
            />
          </label>

          <label className="field">
            <span className="label">
              Mobile <span className="req">*</span>
            </span>
            <input
              value={form.mobile}
              onChange={(e) => setField('mobile', e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="10-digit mobile number"
              inputMode="numeric"
              required
            />
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
              required
            />
          </label>

          <label className="field">
            <span className="label">City</span>
            <input
              value={form.city}
              onChange={(e) => setField('city', e.target.value)}
              placeholder="City"
            />
          </label>
        </div>

        <div className="submit-wrap">
          <button
            type="submit"
            className="submit"
            disabled={saving || codeCheck.status === 'taken' || codeCheck.status === 'checking'}
          >
            {saving ? 'Creating…' : 'Create account'}
          </button>
        </div>
      </form>

      {error ? <p className="error">{error}</p> : null}
      {warning ? <p className="success">{warning}</p> : null}
    </div>
    </>
  );
}
