import { FormEvent, useEffect, useState, type ReactNode } from 'react';
import { FilePreview } from './FilePreview';
import { useT } from './i18n';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  emailHint,
  isValidEmail,
  isValidMobile,
  isValidPersonName,
  mobileHint,
  MOBILE_INVALID_MSG,
  nameHint,
  sanitizeMobileInput,
  sanitizeNameInput,
} from './formValidation';
import { MarketingLayout } from './MarketingLayout';
import { MobileField } from './MobileField';
import { PlatformPage } from './PlatformPage';
import { PlatformShell } from './PlatformShell';
import { getPlatformSession } from './platformSession';
import { TermsModal } from './TermsModal';

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
  price: number;
  billingPeriod: string;
};

type CodeCheck = {
  status: 'idle' | 'checking' | 'available' | 'taken' | 'invalid';
  message: string;
};

type SignupOtpState = {
  sent: boolean;
  verified: boolean;
  code: string;
  sending: boolean;
  verifying: boolean;
  message: string;
  error: string;
  devCode: string;
};

const emptyOtpState = (): SignupOtpState => ({
  sent: false,
  verified: false,
  code: '',
  sending: false,
  verifying: false,
  message: '',
  error: '',
  devCode: '',
});

type CreatedCredentials = {
  accountName: string;
  accountCode: string;
  poolAddress: string;
  contactName: string;
  mobile: string;
  email: string;
  city: string;
  packageName: string;
  packagePrice: number;
  billingPeriod: string;
  loginUrl: string;
  adminUserName: string;
  deliveryNote: string;
  whatsappOk: boolean;
};

type PlatformPayInfo = {
  paymentQrPath: string | null;
  upiId: string;
};

const ACCOUNT_CODE_RE = /^[a-z0-9]{6}$/;
const STATUSES = ['Trial', 'Active', 'Suspended'] as const;

function isTrialPackage(name: string) {
  return name.trim().toLowerCase() === 'trial';
}

function formatMoney(value: number) {
  return `₹${value.toLocaleString('en-IN')}`;
}

function uploadUrl(filename: string | null | undefined) {
  if (!filename) return null;
  return `/uploads/${filename}`;
}

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

function GetStartedShell({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <MarketingLayout>
      <div className="get-started-page">
        <header className="get-started-hero">
          <p className="marketing-eyebrow">{t('Get Started')}</p>
          <h1>{title}</h1>
          {lead ? <p className="get-started-hero-lead">{lead}</p> : null}
        </header>
        {children}
      </div>
    </MarketingLayout>
  );
}

export function CreateAccount() {
  const t = useT();
  const { id: editIdParam } = useParams();
  const editId = Number(editIdParam);
  const isEdit = Number.isFinite(editId) && editId > 0;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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
  const [platformPay, setPlatformPay] = useState<PlatformPayInfo | null>(null);
  const [platformPayError, setPlatformPayError] = useState('');
  /** When true, account code is user-controlled and no longer auto-filled from the name. */
  const [codeEditedByUser, setCodeEditedByUser] = useState(false);
  const [originalCode, setOriginalCode] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [emailOtp, setEmailOtp] = useState<SignupOtpState>(emptyOtpState);
  const [mobileOtp, setMobileOtp] = useState<SignupOtpState>(emptyOtpState);

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
          price: Number(row.price ?? 0),
          billingPeriod: String(row.billingPeriod ?? 'Month'),
        }));
        setPackages(options);
        if (!isEdit) {
          const fromQuery = Number(searchParams.get('package'));
          const queryPackage =
            Number.isFinite(fromQuery) && fromQuery > 0
              ? options.find((p) => p.id === fromQuery && p.isActive)
              : undefined;
          setForm((prev) =>
            prev.servicePackageId
              ? prev
              : {
                  ...prev,
                  servicePackageId: queryPackage
                    ? String(queryPackage.id)
                    : defaultPackageId(options),
                },
          );
        }
      } catch {
        /* ignore — validate on submit */
      }
    })();
  }, [isEdit]);

  useEffect(() => {
    if (!created) {
      setPlatformPay(null);
      setPlatformPayError('');
      return;
    }
    const needsPayment = !isTrialPackage(created.packageName);
    if (!needsPayment) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/platform-payment');
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? 'Failed to load payment details');
        if (cancelled) return;
        setPlatformPay({
          paymentQrPath: body.paymentQrPath ? String(body.paymentQrPath) : null,
          upiId: String(body.upiId ?? ''),
        });
        setPlatformPayError('');
      } catch (err) {
        if (!cancelled) {
          setPlatformPay(null);
          setPlatformPayError(
            err instanceof Error ? err.message : 'Failed to load payment details',
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [created]);

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
    if (key === 'email') {
      setEmailOtp(emptyOtpState());
    }
    if (key === 'mobile') {
      setMobileOtp(emptyOtpState());
    }
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function sendChannelOtp(channel: 'email' | 'mobile') {
    const setOtp = channel === 'email' ? setEmailOtp : setMobileOtp;
    setOtp((prev) => ({
      ...prev,
      sending: true,
      error: '',
      message: '',
      verified: false,
      code: '',
      devCode: '',
    }));
    try {
      if (channel === 'email') {
        if (!isValidEmail(form.email)) {
          throw new Error(emailHint(form.email) || 'Enter a valid email address');
        }
      } else if (!isValidMobile(form.mobile)) {
        throw new Error(mobileHint(form.mobile) || MOBILE_INVALID_MSG);
      }

      const res = await fetch('/api/saas-accounts/send-signup-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          channel === 'email'
            ? { channel, email: form.email.trim() }
            : { channel, mobile: form.mobile.trim() },
        ),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to send OTP');
      if (body.skipped && !body.devCode) {
        throw new Error(String(body.message ?? 'OTP could not be delivered'));
      }
      setOtp((prev) => ({
        ...prev,
        sending: false,
        sent: true,
        message: String(body.message ?? 'OTP sent'),
        devCode: body.devCode ? String(body.devCode) : '',
      }));
    } catch (err) {
      setOtp((prev) => ({
        ...prev,
        sending: false,
        sent: false,
        error: err instanceof Error ? err.message : 'Failed to send OTP',
      }));
    }
  }

  async function verifyChannelOtp(channel: 'email' | 'mobile') {
    const otp = channel === 'email' ? emailOtp : mobileOtp;
    const setOtp = channel === 'email' ? setEmailOtp : setMobileOtp;
    setOtp((prev) => ({ ...prev, verifying: true, error: '', message: '' }));
    try {
      const res = await fetch('/api/saas-accounts/verify-signup-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          channel === 'email'
            ? { channel, email: form.email.trim(), code: otp.code.trim() }
            : { channel, mobile: form.mobile.trim(), code: otp.code.trim() },
        ),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to verify OTP');
      setOtp((prev) => ({
        ...prev,
        verifying: false,
        verified: true,
        message: 'Verified',
        error: '',
      }));
    } catch (err) {
      setOtp((prev) => ({
        ...prev,
        verifying: false,
        verified: false,
        error: err instanceof Error ? err.message : 'Failed to verify OTP',
      }));
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!isEdit && !acceptedTerms) {
      setError('Please accept the Terms & Conditions to create an account');
      return;
    }
    if (!form.accountName.trim()) {
      setError('Enter account / Pool name');
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
    if (!isValidPersonName(form.contactName)) {
      setError(nameHint(form.contactName) || 'Enter a name using letters only.');
      return;
    }
    if (!isValidMobile(form.mobile)) {
      setError(mobileHint(form.mobile) || MOBILE_INVALID_MSG);
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
    if (!isEdit && !emailOtp.verified) {
      setError('Please verify your email with the OTP sent to your inbox');
      return;
    }
    if (!isEdit && !mobileOtp.verified) {
      setError('Please verify your mobile with the OTP sent on WhatsApp');
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
          acceptedTerms: true,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to create account');

      const code = String(body.accountCode ?? form.accountCode);
      const warnList = Array.isArray(body.warnings) ? body.warnings.map(String) : [];
      if (warnList.length) setWarning(warnList.join(' '));
      const selectedPkg = packages.find((p) => p.id === packageId);
      const selectedPackage =
        selectedPkg?.packageName || String(body.packageName ?? '');
      setCreated({
        accountName: String(body.accountName ?? form.accountName),
        accountCode: code,
        poolAddress: String(body.poolAddress ?? form.poolAddress),
        contactName: String(body.contactName ?? form.contactName),
        mobile: String(body.mobile ?? form.mobile),
        email: String(body.email ?? form.email),
        city: String(body.city ?? form.city),
        packageName: selectedPackage,
        packagePrice: Number(selectedPkg?.price ?? body.packagePrice ?? 0),
        billingPeriod: String(selectedPkg?.billingPeriod ?? body.billingPeriod ?? 'Month'),
        loginUrl: String(body.loginUrl ?? accountLoginUrl(code)),
        adminUserName: String(body.adminUser?.userName ?? 'admin'),
        deliveryNote: String(
          body.deliveryNote ?? 'Account created and WhatsApp message sent for password.',
        ),
        whatsappOk: body.whatsapp?.ok === true && !body.whatsapp?.skipped,
      });
      setForm({ ...emptyForm, servicePackageId: defaultPackageId(packages) });
      setAcceptedTerms(false);
      setCodeEditedByUser(false);
      setCodeCheck({ status: 'idle', message: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : isEdit ? 'Failed to update account' : 'Failed to create account');
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    const showPayment = !isTrialPackage(created.packageName);

    const createdBody = (
      <>
        <p className={`${created.whatsappOk ? 'success' : 'error'} get-started-lede`}>
          {created.deliveryNote}
        </p>
        {warning ? <p className="error">{t(warning)}</p> : null}

        <section className="pass-form-card account-credentials-card get-started-card">
          <dl className="account-credentials-list">
            <div>
              <dt>{t('Account / Swimming Pool')}</dt>
              <dd>{created.accountName}</dd>
            </div>
            {created.packageName ? (
              <div>
                <dt>{t('Package')}</dt>
                <dd>{created.packageName}</dd>
              </div>
            ) : null}
            {created.poolAddress ? (
              <div>
                <dt>{t('Pool address')}</dt>
                <dd>{created.poolAddress}</dd>
              </div>
            ) : null}
            {created.city ? (
              <div>
                <dt>{t('City')}</dt>
                <dd>{created.city}</dd>
              </div>
            ) : null}
            <div>
              <dt>{t('Contact')}</dt>
              <dd>
                {created.contactName}
                <br />
                {created.mobile}
                {created.email ? ` · ${created.email}` : ''}
              </dd>
            </div>
            <div>
              <dt>{t('Account code')}</dt>
              <dd>
                <code>{created.accountCode}</code>
              </dd>
            </div>
            <div>
              <dt>{t('Login URL')}</dt>
              <dd>
                <a className="terms-link" href={created.loginUrl} target="_blank" rel="noreferrer">
                  {created.loginUrl}
                </a>
              </dd>
            </div>
            <div>
              <dt>{t('Admin user')}</dt>
              <dd>
                <code>{created.adminUserName}</code>
              </dd>
            </div>
          </dl>
        </section>

        {showPayment ? (
          <section className="pass-form-card account-created-payment-card get-started-card">
            <h2>{t('Payment')}</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              {t('This is a paid package. Share the SwimIT payment details below with the pool operator.')}
            </p>
            <p className="renew-amount-line">
              {t('Amount to pay:')}{' '}
              <strong>
                {created.packagePrice > 0
                  ? `${formatMoney(created.packagePrice)} / ${created.billingPeriod}`
                  : '—'}
              </strong>
              {' · '}
              {t('Package:')} <strong>{created.packageName}</strong>
            </p>

            {platformPayError ? <p className="error">{t(platformPayError)}</p> : null}

            <div className="online-payment-details">
              {uploadUrl(platformPay?.paymentQrPath) ? (
                <FilePreview
                  src={uploadUrl(platformPay?.paymentQrPath)}
                  alt={t('SwimIT SaaS payment QR code')}
                  className="online-payment-qr"
                />
              ) : (
                <p className="muted">
                  {platformPay ? t('No SaaS payment QR configured yet.') : t('Loading payment details…')}
                </p>
              )}
              {platformPay?.upiId ? (
                <p className="online-payment-upi">
                  <span className="label">{t('UPI ID')}</span>
                  <span className="online-payment-upi-value">{platformPay.upiId}</span>
                </p>
              ) : platformPay ? (
                <p className="muted">{t('No UPI ID configured yet.')}</p>
              ) : null}
            </div>

            <p className="hint">
              {t('After payment, the pool operator can send the payment screenshot on WhatsApp to SwimIT for confirmation.')}
            </p>
          </section>
        ) : null}

          <div className="submit-wrap get-started-actions" style={{ marginTop: '1rem' }}>
            {canManageAccounts ? (
              <Link className="marketing-btn marketing-btn--primary" to="/accounts">
                {t('Go to Accounts')}
              </Link>
            ) : (
              <Link className="marketing-btn marketing-btn--primary" to="/">
                {t('Back to Home')}
              </Link>
            )}
          </div>
      </>
    );

    if (isEdit || canManageAccounts) {
      return (
        <PlatformShell>
          <PlatformPage
            title="Account created"
            actions={
              canManageAccounts ? (
                <Link className="menu-link" to="/accounts">
                  {t('← Accounts')}
                </Link>
              ) : undefined
            }
          >
            {createdBody}
          </PlatformPage>
        </PlatformShell>
      );
    }

    return (
      <GetStartedShell
        title={t('You are all set')}
        lead={t('Your SwimIT account is ready. Keep these details for the pool operator.')}
      >
        {createdBody}
      </GetStartedShell>
    );
  }

  const formBody = (
    <>
      {loadingAccount ? <p className="muted">{t('Loading account…')}</p> : null}

      {!loadingAccount ? (
      <form
        className={`pass-form-card registration-form create-account-form${
          isEdit || canManageAccounts ? '' : ' get-started-form'
        }`}
        onSubmit={onSubmit}
      >
        <div className="create-account-top-row">
          <label className="field field-beside create-account-package-field">
            <span className="label">
              {t('Package')} <span className="req">*</span>
            </span>
            <select
              value={form.servicePackageId}
              onChange={(e) => setField('servicePackageId', e.target.value)}
              required
            >
              {packages.length === 0 ? <option value="">{t('Loading packages…')}</option> : null}
              {packages
                .filter((p) => p.isActive || String(p.id) === form.servicePackageId)
                .map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>
                    {pkg.packageName}
                    {!pkg.isActive ? t(' (inactive)') : ''}
                  </option>
                ))}
            </select>
          </label>

          {isEdit ? (
            <label className="field field-beside create-account-status-field">
              <span className="label">
                {t('Status')} <span className="req">*</span>
              </span>
              <select
                value={form.status}
                onChange={(e) => setField('status', e.target.value)}
                required
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(s)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        <div className="grid-2">
          <label className="field field-beside">
            <span className="label">
              {t('Pool name')} <span className="req">*</span>
            </span>
            <input
              value={form.accountName}
              onChange={(e) => setField('accountName', e.target.value)}
              placeholder={t('e.g. AquaWave Sports Club')}
              required
            />
          </label>

          <label className="field field-beside">
            <span className="label">
              {t('Account code')} <span className="req">*</span>
            </span>
            <input
              className="field-control-sm create-account-code-input"
              value={form.accountCode}
              onChange={(e) => setField('accountCode', normalizeAccountCodeInput(e.target.value))}
              placeholder={t('e.g. aqua01')}
              maxLength={6}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              aria-describedby="account-code-status"
            />
            <span id="account-code-status" className={`account-code-status ${codeCheck.status}`}>
              {codeCheck.message ? t(codeCheck.message) : ''}
            </span>
          </label>
        </div>

        <label className="field field-beside">
          <span className="label">{t('Pool address')}</span>
          <textarea
            value={form.poolAddress}
            onChange={(e) => setField('poolAddress', e.target.value)}
            placeholder={t('Full pool address')}
            rows={3}
          />
        </label>

        <div className="grid-2">
          <label className="field field-beside">
            <span className="label">
              {t('Contact name')} <span className="req">*</span>
            </span>
            <input
              value={form.contactName}
              onChange={(e) => setField('contactName', sanitizeNameInput(e.target.value))}
              placeholder={t('Owner / manager name')}
              autoCapitalize="words"
              autoComplete="name"
              required
            />
            {nameHint(form.contactName) ? (
              <span className="field-error">{t(nameHint(form.contactName))}</span>
            ) : null}
          </label>

          <label className="field field-beside">
            <span className="label">{t('City')}</span>
            <input
              className="create-account-city-input"
              value={form.city}
              onChange={(e) => setField('city', e.target.value)}
              placeholder={t('City')}
            />
          </label>
        </div>

        {!isEdit ? (
          <div className="field field-beside signup-verify-field">
            <span className="label">
              {t('Mobile')} <span className="req">*</span>
            </span>
            <div className="signup-otp-inline">
              <input
                className="create-account-mobile-input"
                value={form.mobile}
                onChange={(e) => setField('mobile', sanitizeMobileInput(e.target.value))}
                placeholder={t('10-digit number')}
                inputMode="numeric"
                autoComplete="tel"
                maxLength={10}
                required
                aria-invalid={Boolean(mobileHint(form.mobile))}
              />
              <button
                type="button"
                className="ghost-btn signup-otp-send"
                disabled={mobileOtp.sending || mobileOtp.verified || !isValidMobile(form.mobile)}
                onClick={() => void sendChannelOtp('mobile')}
              >
                {mobileOtp.sending
                  ? t('Sending…')
                  : mobileOtp.verified
                    ? t('WhatsApp verified')
                    : t('Send WhatsApp OTP')}
              </button>
              <input
                className="signup-otp-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder={t('OTP')}
                value={mobileOtp.code}
                disabled={mobileOtp.verified || !mobileOtp.sent}
                onChange={(e) =>
                  setMobileOtp((prev) => ({
                    ...prev,
                    code: e.target.value.replace(/\D/g, '').slice(0, 6),
                    error: '',
                  }))
                }
              />
              <button
                type="button"
                className="ghost-btn"
                disabled={
                  mobileOtp.verifying ||
                  mobileOtp.verified ||
                  !mobileOtp.sent ||
                  mobileOtp.code.length !== 6
                }
                onClick={() => void verifyChannelOtp('mobile')}
              >
                {mobileOtp.verifying ? t('Verifying…') : t('Verify')}
              </button>
            </div>
            {mobileHint(form.mobile) ? (
              <span className="field-error">{mobileHint(form.mobile)}</span>
            ) : null}
            {mobileOtp.devCode ? (
              <p className="signup-otp-hint">
                {t('Test code')}: {mobileOtp.devCode}
              </p>
            ) : null}
            {mobileOtp.message && !mobileOtp.error ? (
              <p className={`signup-otp-hint ${mobileOtp.verified ? 'is-verified' : ''}`}>
                {t(mobileOtp.message)}
              </p>
            ) : null}
            {mobileOtp.error ? <p className="field-error">{mobileOtp.error}</p> : null}
          </div>
        ) : (
          <MobileField
            label={t('Mobile')}
            value={form.mobile}
            onChange={(value) => setField('mobile', value)}
            required
            className="field field-beside"
            inputClassName="create-account-mobile-input"
            placeholder={t('10-digit number')}
          />
        )}

        {!isEdit ? (
          <div className="field field-beside signup-verify-field">
            <span className="label">
              {t('Email')} <span className="req">*</span>
            </span>
            <div className="signup-otp-inline">
              <input
                className="signup-email-input"
                type="email"
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
                placeholder="name@example.com"
                autoComplete="email"
                aria-invalid={Boolean(emailHint(form.email))}
                required
              />
              <button
                type="button"
                className="ghost-btn signup-otp-send"
                disabled={emailOtp.sending || emailOtp.verified || !isValidEmail(form.email)}
                onClick={() => void sendChannelOtp('email')}
              >
                {emailOtp.sending
                  ? t('Sending…')
                  : emailOtp.verified
                    ? t('Email verified')
                    : t('Send email OTP')}
              </button>
              <input
                className="signup-otp-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder={t('OTP')}
                value={emailOtp.code}
                disabled={emailOtp.verified || !emailOtp.sent}
                onChange={(e) =>
                  setEmailOtp((prev) => ({
                    ...prev,
                    code: e.target.value.replace(/\D/g, '').slice(0, 6),
                    error: '',
                  }))
                }
              />
              <button
                type="button"
                className="ghost-btn"
                disabled={
                  emailOtp.verifying ||
                  emailOtp.verified ||
                  !emailOtp.sent ||
                  emailOtp.code.length !== 6
                }
                onClick={() => void verifyChannelOtp('email')}
              >
                {emailOtp.verifying ? t('Verifying…') : t('Verify')}
              </button>
            </div>
            {emailHint(form.email) ? (
              <span className="field-error">{emailHint(form.email)}</span>
            ) : null}
            {emailOtp.devCode ? (
              <p className="signup-otp-hint">
                {t('Test code')}: {emailOtp.devCode}
              </p>
            ) : null}
            {emailOtp.message && !emailOtp.error ? (
              <p className={`signup-otp-hint ${emailOtp.verified ? 'is-verified' : ''}`}>
                {t(emailOtp.message)}
              </p>
            ) : null}
            {emailOtp.error ? <p className="field-error">{emailOtp.error}</p> : null}
          </div>
        ) : (
          <label className="field field-beside">
            <span className="label">
              {t('Email')} <span className="req">*</span>
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
        )}

        {isEdit ? (
          <label className="field field-beside">
            <span className="label">{t('Notes')}</span>
            <textarea
              value={form.notes}
              onChange={(e) => setField('notes', e.target.value)}
              placeholder={t('Internal notes for this account')}
              rows={3}
            />
          </label>
        ) : null}

        <div className="footer-row create-account-footer">
          {isEdit ? (
            <span />
          ) : (
            <label className="terms">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                required
              />
              <span>
                {t('I accept the')}{' '}
                <button type="button" className="terms-link" onClick={() => setTermsOpen(true)}>
                  {t('Terms & Conditions')}
                </button>
              </span>
            </label>
          )}
          <div className="submit-wrap">
            {isEdit || canManageAccounts ? (
              <button
                type="button"
                className="ghost-btn"
                disabled={saving}
                onClick={() => navigate('/accounts')}
              >
                {t('Cancel')}
              </button>
            ) : null}
            <button
              type="submit"
              className={
                isEdit || canManageAccounts
                  ? 'submit'
                  : 'marketing-btn marketing-btn--primary marketing-btn--lg'
              }
              disabled={
                saving ||
                codeCheck.status === 'taken' ||
                codeCheck.status === 'checking' ||
                (!isEdit && !acceptedTerms) ||
                (!isEdit && (!emailOtp.verified || !mobileOtp.verified))
              }
            >
              {saving
                ? isEdit
                  ? t('Saving…')
                  : t('Creating…')
                : isEdit
                  ? t('Save changes')
                  : canManageAccounts
                    ? t('Create Account')
                    : t('Get Started')}
            </button>
          </div>
        </div>
      </form>
      ) : null}

      {error ? <p className="error">{t(error)}</p> : null}
      {warning ? <p className="success">{t(warning)}</p> : null}
      {success ? <p className="success">{t(success)}</p> : null}
      <TermsModal
        open={termsOpen}
        onClose={() => setTermsOpen(false)}
        onAccept={() => setAcceptedTerms(true)}
        variant="account"
      />
    </>
  );

  if (isEdit || canManageAccounts) {
    return (
      <PlatformShell>
        <PlatformPage
          title={isEdit ? 'Edit Account' : 'Create Account'}
          actions={
            <Link className="menu-link" to="/accounts">
              {t('← Accounts')}
            </Link>
          }
        >
          {formBody}
        </PlatformPage>
      </PlatformShell>
    );
  }

  return (
    <GetStartedShell
      title={t('Create your SwimIT account')}
      lead={t(
        'Tell us about your pool and choose a plan. You will receive login details on WhatsApp after signup.',
      )}
    >
      {formBody}
      <p className="get-started-pricing-link">
        {t('Not sure which plan?')}{' '}
        <Link to="/service-packages">{t('Compare pricing')}</Link>
      </p>
    </GetStartedShell>
  );
}
