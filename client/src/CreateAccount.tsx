import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
  servicePackageId: string;
  status: string;
  notes: string;
};

type ServicePackageOption = {
  id: number;
  packageName: string;
  isActive: boolean;
  trialDays: number;
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
  packageName: string;
  loginUrl: string;
  adminUserName: string;
  deliveryNote: string;
  whatsappOk: boolean;
};

const ACCOUNT_CODE_RE = /^[a-z0-9]{6}$/;
const STATUSES = ['Trial', 'Active', 'Suspended'] as const;

const emptyForm: AccountForm = {
  accountName: '',
  accountCode: '',
  poolAddress: '',
  contactName: '',
  mobile: '',
  email: '',
  city: '',
  servicePackageId: '',
  status: 'Active',
  notes: '',
};

function normalizeAccountCodeInput(value: string) {
  return value.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toLowerCase();
}

/** Build a 6-char a-z0-9 code from the swimming pool name (user may still edit it). */
function suggestAccountCode(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!base) return '';
  if (base.length >= 6) return base.slice(0, 6);
  return (base + '000000').slice(0, 6);
}

function accountLoginUrl(code: string) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
  return `${origin}/${code}`;
}

function defaultPackageId(packages: ServicePackageOption[]) {
  const active = packages.filter((p) => p.isActive);
  const list = active.length ? active : packages;
  const trial =
    list.find((p) => p.packageName.trim().toLowerCase() === 'trial') ||
    list.find((p) => p.trialDays > 0);
  return String((trial ?? list[0])?.id ?? '');
}

export function CreateAccount() {
  const { id: editIdParam } = useParams();
  const editId = Number(editIdParam);
  const isEdit = Number.isFinite(editId) && editId > 0;
  const navigate = useNavigate();
  const canManageAccounts = Boolean(getPlatformSession());
  const [form, setForm] = useState<AccountForm>(emptyForm);
  const [packages, setPackages] = useState<ServicePackageOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingAccount, setLoadingAccount] = useState(isEdit);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [success, setSuccess] = useState('');
  const [codeCheck, setCodeCheck] = useState<CodeCheck>({ status: 'idle', message: '' });
  const [created, setCreated] = useState<CreatedCredentials | null>(null);
  /** When true, account code is user-controlled and no longer auto-filled from the name. */
  const [codeEditedByUser, setCodeEditedByUser] = useState(false);
  const [originalCode, setOriginalCode] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/service-packages');
        const body = await res.json().catch(() => []);
        if (!res.ok || !Array.isArray(body)) return;
        const options: ServicePackageOption[] = body.map((row: Record<string, unknown>) => ({
          id: Number(row.id),
          packageName: String(row.packageName ?? ''),
          isActive: row.isActive !== false,
          trialDays: Number(row.trialDays ?? 0),
        }));
        setPackages(options);
        if (!isEdit) {
          setForm((prev) =>
            prev.servicePackageId ? prev : { ...prev, servicePackageId: defaultPackageId(options) },
          );
        }
      } catch {
        /* ignore — validate on submit */
      }
    })();
  }, [isEdit]);

  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    setLoadingAccount(true);
    setError('');
    void (async () => {
      try {
        const res = await fetch(`/api/saas-accounts/${editId}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? 'Failed to load account');
        if (cancelled) return;
        const code = String(body.accountCode ?? '');
        setOriginalCode(code);
        setCodeEditedByUser(true);
        setForm({
          accountName: String(body.accountName ?? ''),
          accountCode: code,
          poolAddress: String(body.poolAddress ?? ''),
          contactName: String(body.contactName ?? ''),
          mobile: String(body.mobile ?? ''),
          email: String(body.email ?? ''),
          city: String(body.city ?? ''),
          servicePackageId:
            body.servicePackageId == null ? '' : String(body.servicePackageId),
          status: String(body.status ?? 'Active'),
          notes: String(body.notes ?? ''),
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load account');
        }
      } finally {
        if (!cancelled) setLoadingAccount(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, editId]);

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
    if (isEdit && code === originalCode) {
      setCodeCheck({ status: 'available', message: 'Current code' });
      return;
    }

    let cancelled = false;
    setCodeCheck({ status: 'checking', message: 'Checking…' });
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const qs = isEdit ? `?excludeId=${editId}` : '';
          const res = await fetch(
            `/api/saas-accounts/check-code/${encodeURIComponent(code)}${qs}`,
          );
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
  }, [form.accountCode, isEdit, editId, originalCode]);

  function setField<K extends keyof AccountForm>(key: K, value: AccountForm[K]) {
    setError('');
    if (key === 'accountName') {
      const name = String(value);
      setForm((prev) => ({
        ...prev,
        accountName: name,
        accountCode: codeEditedByUser ? prev.accountCode : suggestAccountCode(name),
      }));
      return;
    }
    if (key === 'accountCode') {
      setCodeEditedByUser(true);
      setForm((prev) => ({ ...prev, accountCode: value as string }));
      return;
    }
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.accountName.trim()) {
      setError('Enter account / Swimming Pool name');
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
    const packageId = Number(form.servicePackageId);
    if (!Number.isFinite(packageId) || packageId <= 0) {
      setError('Select a service package');
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
    setSuccess('');
    try {
      if (isEdit) {
        const res = await fetch(`/api/saas-accounts/${editId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountName: form.accountName.trim(),
            accountCode: form.accountCode,
            poolAddress: form.poolAddress.trim(),
            contactName: form.contactName.trim(),
            mobile: form.mobile.trim(),
            email: form.email.trim(),
            city: form.city.trim(),
            servicePackageId: packageId,
            status: form.status,
            notes: form.notes.trim(),
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? 'Failed to update account');
        const warnList = Array.isArray(body.warnings) ? body.warnings.map(String) : [];
        if (warnList.length) setWarning(warnList.join(' '));
        setOriginalCode(String(body.accountCode ?? form.accountCode));
        setSuccess('Account details saved.');
        return;
      }

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
          servicePackageId: packageId,
          status: form.status || 'Active',
          notes: form.notes.trim(),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to create account');

      const code = String(body.accountCode ?? form.accountCode);
      const warnList = Array.isArray(body.warnings) ? body.warnings.map(String) : [];
      if (warnList.length) setWarning(warnList.join(' '));
      const selectedPackage =
        packages.find((p) => p.id === packageId)?.packageName ||
        String(body.packageName ?? '');
      setCreated({
        accountName: String(body.accountName ?? form.accountName),
        accountCode: code,
        poolAddress: String(body.poolAddress ?? form.poolAddress),
        contactName: String(body.contactName ?? form.contactName),
        mobile: String(body.mobile ?? form.mobile),
        email: String(body.email ?? form.email),
        city: String(body.city ?? form.city),
        packageName: selectedPackage,
        loginUrl: String(body.loginUrl ?? accountLoginUrl(code)),
        adminUserName: String(body.adminUser?.userName ?? 'admin'),
        deliveryNote: String(
          body.deliveryNote ?? 'Account created and WhatsApp message sent for password.',
        ),
        whatsappOk: body.whatsapp?.ok === true && !body.whatsapp?.skipped,
      });
      setForm({ ...emptyForm, servicePackageId: defaultPackageId(packages) });
      setCodeEditedByUser(false);
      setCodeCheck({ status: 'idle', message: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : isEdit ? 'Failed to update account' : 'Failed to create account');
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
            `Account / Swimming Pool: ${created.accountName}`,
            created.packageName ? `Package: ${created.packageName}` : null,
            created.poolAddress ? `Pool address: ${created.poolAddress}` : null,
            created.city ? `City: ${created.city}` : null,
            `Account code: ${created.accountCode}`,
            `Login URL: ${created.loginUrl}`,
            `Admin user: ${created.adminUserName}`,
            '',
            'Temporary password was sent to your WhatsApp mobile. Please change it on first login.',
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
        <p className="lede">Account details for the pool operator.</p>
        {warning ? <p className="error">{warning}</p> : null}

        <section className="pass-form-card account-credentials-card">
          <p className={created.whatsappOk ? 'success' : 'error'}>{created.deliveryNote}</p>

          <dl className="account-credentials-list">
            <div>
              <dt>Account / Swimming Pool</dt>
              <dd>{created.accountName}</dd>
            </div>
            {created.packageName ? (
              <div>
                <dt>Package</dt>
                <dd>{created.packageName}</dd>
              </div>
            ) : null}
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

      <h1>{isEdit ? 'Edit Account' : 'Create Account'}</h1>
      <p className="lede">
        {isEdit
          ? 'Update pool operator account details on SwimIT SaaS.'
          : 'Onboard a pool operator onto SwimIT SaaS.'}
      </p>

      {loadingAccount ? <p className="muted">Loading account…</p> : null}

      {!loadingAccount ? (
      <form className="pass-form-card" onSubmit={onSubmit}>
        <label className="field create-account-package-field">
          <span className="label">
            Package <span className="req">*</span>
          </span>
          <select
            value={form.servicePackageId}
            onChange={(e) => setField('servicePackageId', e.target.value)}
            required
          >
            {packages.length === 0 ? <option value="">Loading packages…</option> : null}
            {packages
              .filter((p) => p.isActive || String(p.id) === form.servicePackageId)
              .map((pkg) => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.packageName}
                  {!pkg.isActive ? ' (inactive)' : ''}
                </option>
              ))}
          </select>
        </label>

        {isEdit ? (
          <label className="field">
            <span className="label">
              Status <span className="req">*</span>
            </span>
            <select
              value={form.status}
              onChange={(e) => setField('status', e.target.value)}
              required
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="field">
          <span className="label">
            Account / Swimming Pool name <span className="req">*</span>
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
            <span className="hint">
              {isEdit
                ? 'Changing the code changes the pool login URL.'
                : 'Suggested from Swimming Pool name — you can change it. Login URL uses this code.'}
            </span>
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

        {isEdit ? (
          <label className="field">
            <span className="label">Notes</span>
            <textarea
              value={form.notes}
              onChange={(e) => setField('notes', e.target.value)}
              placeholder="Internal notes for this account"
              rows={3}
            />
          </label>
        ) : null}

        <div className="submit-wrap">
          {isEdit ? (
            <button
              type="button"
              className="ghost-btn"
              disabled={saving}
              onClick={() => navigate('/accounts')}
            >
              Cancel
            </button>
          ) : null}
          <button
            type="submit"
            className="submit"
            disabled={saving || codeCheck.status === 'taken' || codeCheck.status === 'checking'}
          >
            {saving
              ? isEdit
                ? 'Saving…'
                : 'Creating…'
              : isEdit
                ? 'Save changes'
                : 'Create account'}
          </button>
        </div>
      </form>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
      {warning ? <p className="success">{warning}</p> : null}
      {success ? <p className="success">{success}</p> : null}
    </div>
    </>
  );
}
