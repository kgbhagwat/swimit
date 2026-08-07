import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { InPageSelect } from './InPageSelect';
import { useT } from './i18n';
import { PlatformPage } from './PlatformPage';

type ServicePackage = {
  id: number;
  packageName: string;
  price: number;
  billingPeriod: string;
  isActive: boolean;
  trialDays: number;
};

type AccountSummary = {
  id: number;
  accountName: string;
  accountCode: string;
  servicePackageId: number | null;
  packageName: string;
  subscriptionExpiresAt: string | null;
};

type PendingRenewal = {
  id: number;
  renewPackageId: number;
  renewPackageName: string;
  months: number;
  expectedAmount: number;
  renewFrom: string;
  newExpiresAt: string;
  transactionId?: string;
  verifiedAt?: string | null;
  detectedAmount?: number | null;
};

type PaymentDetails = {
  paymentQrPath: string | null;
  upiId: string;
};

type SessionUser = {
  id: number;
  userName: string;
  mobile: string;
  isAccountAdmin?: boolean;
};

function sessionKey(code: string) {
  return `swimIT.accountSession.${code.toLowerCase()}`;
}

function readSession(code: string): SessionUser | null {
  try {
    const raw = sessionStorage.getItem(sessionKey(code));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionUser;
    if (!parsed?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function uploadUrl(filename: string | null | undefined) {
  if (!filename) return null;
  return `/uploads/${filename}`;
}

function formatMoney(value: number) {
  return `₹${Number(value || 0).toLocaleString('en-IN')}`;
}

function formatShortDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const raw = String(iso).trim();
  const d = /^\d{4}-\d{2}-\d{2}/.test(raw)
    ? new Date(`${raw.slice(0, 10)}T12:00:00`)
    : new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function todayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

function toIsoDateOnly(value: string | null | undefined) {
  if (!value) return null;
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function renewFromDate(currentExpiresAt: string | null | undefined) {
  const today = todayDateOnly();
  const exp = toIsoDateOnly(currentExpiresAt);
  if (exp && exp > today) return exp;
  return today;
}

function addMonthsDateOnly(fromIsoDate: string, months: number) {
  const iso = toIsoDateOnly(fromIsoDate) ?? todayDateOnly();
  const base = new Date(`${iso}T12:00:00`);
  base.setMonth(base.getMonth() + Math.max(1, Math.floor(months) || 1));
  return base.toISOString().slice(0, 10);
}

function computeAmount(pkg: ServicePackage | undefined, months: number) {
  if (!pkg) return 0;
  const m = Math.max(1, Math.min(36, Math.floor(months) || 1));
  const price = Math.max(0, Number(pkg.price) || 0);
  const amount =
    String(pkg.billingPeriod).toLowerCase() === 'year' ? price * (m / 12) : price * m;
  return Math.round(amount * 100) / 100;
}

function isTrialPackage(pkg: { packageName: string; trialDays?: number }) {
  return (
    String(pkg.packageName).trim().toLowerCase() === 'trial' || Number(pkg.trialDays ?? 0) > 0
  );
}

/** Paid packages only — Trial is never offered for renewal. */
function renewPackageOptions(all: ServicePackage[]) {
  return all.filter((p) => p.isActive && !isTrialPackage(p));
}

function defaultRenewPackageId(
  current: { servicePackageId: number | null; packageName: string },
  renewOptions: ServicePackage[],
) {
  if (!renewOptions.length) return '';

  if (current.packageName.trim().toLowerCase() === 'trial') {
    const starter = renewOptions.find((p) => p.packageName.trim().toLowerCase() === 'starter');
    return String((starter ?? renewOptions[0]).id);
  }

  if (
    current.servicePackageId != null &&
    renewOptions.some((p) => p.id === current.servicePackageId)
  ) {
    return String(current.servicePackageId);
  }

  return String(renewOptions[0].id);
}

export function RenewPayment() {
  const t = useT();
  const { accountCode = '' } = useParams();
  const code = accountCode.toLowerCase();
  const navigate = useNavigate();

  const [user, setUser] = useState<SessionUser | null>(() => readSession(code));
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [renewPackageId, setRenewPackageId] = useState('');
  const [months, setMonths] = useState('1');
  const [pending, setPending] = useState<PendingRenewal | null>(null);
  const [confirmed, setConfirmed] = useState<PendingRenewal | null>(null);
  const [payment, setPayment] = useState<PaymentDetails>({ paymentQrPath: null, upiId: '' });
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const renewOptions = useMemo(() => renewPackageOptions(packages), [packages]);
  const renewPackageSelectOptions = useMemo(
    () => renewOptions.map((pkg) => ({ value: String(pkg.id), label: pkg.packageName })),
    [renewOptions],
  );
  const selectedPackage = useMemo(
    () => renewOptions.find((p) => String(p.id) === renewPackageId),
    [renewOptions, renewPackageId],
  );
  const amount = computeAmount(selectedPackage, Number(months));
  const applicableFrom = renewFromDate(account?.subscriptionExpiresAt);
  const nextExpiry = addMonthsDateOnly(applicableFrom, Number(months) || 1);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const session = readSession(code);
      setUser(session);
      if (!session?.isAccountAdmin) {
        setError('Only the account admin can renew the package.');
        setLoading(false);
        return;
      }

      const [acctRes, pkgRes, pendingRes] = await Promise.all([
        fetch(`/api/saas-accounts/by-code/${encodeURIComponent(code)}`),
        fetch('/api/service-packages'),
        fetch(`/api/saas-accounts/by-code/${encodeURIComponent(code)}/renew/pending`),
      ]);
      const acctBody = await acctRes.json().catch(() => ({}));
      const pkgBody = await pkgRes.json().catch(() => []);
      const pendingBody = await pendingRes.json().catch(() => ({}));

      if (!acctRes.ok) throw new Error(acctBody.error ?? 'Account not found');
      if (!pkgRes.ok) throw new Error('Failed to load packages');

      const acct: AccountSummary = {
        id: Number(acctBody.id),
        accountName: String(acctBody.accountName ?? ''),
        accountCode: String(acctBody.accountCode ?? code),
        servicePackageId:
          acctBody.servicePackageId == null ? null : Number(acctBody.servicePackageId),
        packageName: String(acctBody.packageName ?? ''),
        subscriptionExpiresAt: acctBody.subscriptionExpiresAt
          ? String(acctBody.subscriptionExpiresAt).slice(0, 10)
          : null,
      };
      setAccount(acct);

      const opts: ServicePackage[] = (Array.isArray(pkgBody) ? pkgBody : [])
        .map((row: Record<string, unknown>) => ({
          id: Number(row.id),
          packageName: String(row.packageName ?? ''),
          price: Number(row.price ?? 0),
          billingPeriod: String(row.billingPeriod ?? 'Month'),
          isActive: row.isActive !== false,
          trialDays: Number(row.trialDays ?? 0),
        }))
        .filter((p: ServicePackage) => p.isActive);
      setPackages(opts);

      const renewOpts = renewPackageOptions(opts);
      const defaultId = defaultRenewPackageId(acct, renewOpts);
      setRenewPackageId((prev) => {
        if (prev && renewOpts.some((p) => String(p.id) === prev)) return prev;
        return defaultId;
      });

      if (pendingRes.ok) {
        setPending(pendingBody.pending ?? null);
        setPayment({
          paymentQrPath: pendingBody.payment?.paymentQrPath ?? null,
          upiId: String(pendingBody.payment?.upiId ?? ''),
        });
        if (pendingBody.pending) {
          const pendingPkgId = String(pendingBody.pending.renewPackageId);
          if (renewOpts.some((p) => String(p.id) === pendingPkgId)) {
            setRenewPackageId(pendingPkgId);
            setMonths(String(pendingBody.pending.months));
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [code]);

  // While waiting for WhatsApp screenshot verification, poll status.
  useEffect(() => {
    if (!pending || confirmed) return;
    const timer = window.setInterval(async () => {
      try {
        const res = await fetch(
          `/api/saas-accounts/by-code/${encodeURIComponent(code)}/renew/pending`,
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return;
        if (body.pending) {
          setPending(body.pending);
          return;
        }
        setPending(null);
        if (body.latestVerified) {
          setConfirmed(body.latestVerified);
          setInfo('');
          if (body.account?.packageName) {
            setAccount((prev) =>
              prev
                ? {
                    ...prev,
                    packageName: String(body.account.packageName),
                    servicePackageId:
                      body.account.servicePackageId == null
                        ? null
                        : Number(body.account.servicePackageId),
                    subscriptionExpiresAt: body.account.subscriptionExpiresAt
                      ? String(body.account.subscriptionExpiresAt).slice(0, 10)
                      : prev.subscriptionExpiresAt,
                  }
                : prev,
            );
          }
        }
      } catch {
        /* ignore poll errors */
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [pending, confirmed, code]);

  async function onConfirm(e: FormEvent) {
    e.preventDefault();
    if (!user?.isAccountAdmin) return;
    setError('');
    setInfo('');
    if (!renewPackageId) {
      setError('Select a package to renew');
      return;
    }
    if (amount <= 0) {
      setError('Select a paid package to renew (Trial has no payable amount).');
      return;
    }

    setConfirming(true);
    try {
      const res = await fetch(`/api/saas-accounts/by-code/${encodeURIComponent(code)}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          renewPackageId: Number(renewPackageId),
          months: Number(months),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to confirm renewal');

      setPending(body.renewal ?? null);
      setPayment({
        paymentQrPath: body.payment?.paymentQrPath ?? null,
        upiId: String(body.payment?.upiId ?? ''),
      });
      setInfo(
        body.whatsapp?.ok === false
          ? `${t('Renewal saved, but WhatsApp failed')}: ${body.whatsapp.error || t('send failed')}. ${t('Pay using the QR below and send the screenshot on WhatsApp.')}`
          : t(
              'WhatsApp message sent to your mobile. Pay the amount below and send the payment screenshot on WhatsApp.',
            ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm');
    } finally {
      setConfirming(false);
    }
  }

  if (!code) {
    return (
      <PlatformPage title="Renew package">
        <p className="error">{t('Missing account code.')}</p>
      </PlatformPage>
    );
  }

  const monthsLabel =
    confirmed && confirmed.months === 1
      ? t('month')
      : t('months');

  return (
    <PlatformPage title="Renew package">
      <p className="lede">
        {t('Confirm your renewal, pay SwimIT via UPI / QR, then send the payment screenshot on WhatsApp.')}
      </p>

      {loading ? <p className="pass-empty">{t('Loading…')}</p> : null}
      {error ? <p className="error">{t(error)}</p> : null}
      {info ? <p className="success">{info}</p> : null}

      {!loading && confirmed ? (
        <section className="pass-form-card renew-confirm-card">
          <h2>{t('Payment confirmation')}</h2>
          <p className="success" style={{ marginTop: 0 }}>
            {t('Payment received. Your package has been upgraded.')}
          </p>
          <ul className="renew-confirm-list">
            <li>
              {t('Package')}: <strong>{confirmed.renewPackageName}</strong>
            </li>
            <li>
              {t('Duration')}:{' '}
              <strong>
                {confirmed.months} {monthsLabel}
              </strong>
            </li>
            <li>
              {t('Amount')}:{' '}
              <strong>
                {formatMoney(confirmed.detectedAmount ?? confirmed.expectedAmount)}
              </strong>
            </li>
            <li>
              {t('Transaction ID')}: <strong>{confirmed.transactionId || '—'}</strong>
            </li>
            <li>
              {t('Valid from')} <strong>{formatShortDate(confirmed.renewFrom)}</strong> {t('until')}{' '}
              <strong>{formatShortDate(confirmed.newExpiresAt)}</strong>
            </li>
          </ul>
          <div className="pass-form-actions">
            <button type="button" className="ghost-btn" onClick={() => setConfirmed(null)}>
              {t('Renew again')}
            </button>
            <Link className="menu-link" to={`/${code}/dashboard`}>
              {t('Back to home')}
            </Link>
          </div>
        </section>
      ) : null}

      {!loading && account && user?.isAccountAdmin && !confirmed ? (
        <>
          <form className="pass-form-card renew-form" onSubmit={onConfirm}>
            <div className="renew-field-row">
              <label className="field renew-field-main">
                <span className="label">{t('Current package')}</span>
                <input value={account.packageName || '—'} readOnly disabled />
              </label>
              <p className="renew-field-aside">
                {t('Expires')}: <strong>{formatShortDate(account.subscriptionExpiresAt)}</strong>
              </p>
            </div>

            <div className="renew-field-row">
              <label className="field renew-field-main">
                <span className="label">
                  {t('Renew package')} <span className="req">*</span>
                </span>
                <InPageSelect
                  value={renewPackageId}
                  onChange={setRenewPackageId}
                  options={renewPackageSelectOptions}
                  placeholder={t('Select package')}
                  required
                  disabled={Boolean(pending)}
                  aria-label={t('Renew package')}
                />
              </label>
              <p className="renew-field-aside">
                {t('Applicable from')}: <strong>{formatShortDate(applicableFrom)}</strong>
              </p>
            </div>

            <div className="renew-field-row">
              <label className="field renew-field-main renew-field-duration">
                <span className="label">
                  {t('Duration (months)')} <span className="req">*</span>
                </span>
                <input
                  type="number"
                  min={1}
                  max={36}
                  value={months}
                  onChange={(e) => setMonths(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  required
                  disabled={Boolean(pending)}
                />
              </label>
              <p className="renew-field-aside">
                {t('Next expiry')}: <strong>{formatShortDate(nextExpiry)}</strong>
              </p>
            </div>

            <p className="renew-amount-line">
              {t('Amount to pay')}: <strong>{formatMoney(amount)}</strong>
            </p>

            {!pending ? (
              <div className="pass-form-actions">
                <button type="submit" className="submit" disabled={confirming || amount <= 0}>
                  {confirming ? t('Confirming…') : t('Confirm')}
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => navigate(`/${code}/dashboard`)}
                >
                  {t('Cancel')}
                </button>
              </div>
            ) : (
              <p className="hint">
                {t(
                  'Renewal confirmed. Complete payment below, then send the screenshot on WhatsApp to the same chat.',
                )}
              </p>
            )}
          </form>

          {pending ? (
            <section className="pass-form-card renew-pay-card">
              <h2>{t('Pay SwimIT')}</h2>
              <p className="muted" style={{ marginTop: 0 }}>
                {t('Package')}: <strong>{pending.renewPackageName}</strong> · {pending.months}{' '}
                {pending.months === 1 ? t('month') : t('months')} · {t('Amount')}:{' '}
                <strong>{formatMoney(pending.expectedAmount)}</strong>
                <br />
                {t('Valid from')} {pending.renewFrom} {t('until')} {pending.newExpiresAt}
              </p>

              <div className="online-payment-details">
                {uploadUrl(payment.paymentQrPath) ? (
                  <img
                    src={uploadUrl(payment.paymentQrPath)!}
                    alt={t('SwimIT SaaS payment QR code')}
                    className="online-payment-qr"
                  />
                ) : (
                  <p className="muted">{t('No SaaS payment QR configured yet.')}</p>
                )}
                {payment.upiId ? (
                  <p className="online-payment-upi">
                    <span className="label">{t('UPI ID')}</span>
                    <span className="online-payment-upi-value">{payment.upiId}</span>
                  </p>
                ) : (
                  <p className="muted">{t('No UPI ID configured yet.')}</p>
                )}
              </div>

              <p className="hint">
                {t(
                  'After paying, send the payment screenshot on WhatsApp. When amount and UPI match, your package is upgraded automatically and a confirmation is shown here.',
                )}
              </p>

              <p>
                <Link to={`/${code}/dashboard`}>{t('Back to home')}</Link>
              </p>
            </section>
          ) : null}
        </>
      ) : null}
    </PlatformPage>
  );
}
