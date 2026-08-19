import { FormEvent, useEffect, useState } from 'react';
import { useT } from './i18n';
import { FilePreview } from './FilePreview';
import { prepareUploadFile } from './uploadFile';
import { PlatformPage } from './PlatformPage';
import { getPlatformSession } from './platformSession';
import { hasPlatformAccess } from './platformAccess';
import { useObjectUrl } from './useObjectUrl';
import { PhotoPickerButtons } from './WebcamCapture';

type PaymentSettings = {
  paymentQrPath: string | null;
  upiId: string;
};

type PaymentTransaction = {
  id: number;
  accountName: string;
  accountCode: string;
  paymentDate: string | null;
  durationMonths: number;
  amount: number;
  transactionId: string;
  packageName: string;
};

function uploadUrl(filename: string | null | undefined) {
  if (!filename) return null;
  return `/uploads/${filename}`;
}

function isValidUpiId(value: string) {
  const v = value.trim();
  if (!v) return false;
  return /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/.test(v);
}

function upiHint(value: string) {
  const v = value.trim();
  if (!v) return 'UPI ID is required';
  if (!isValidUpiId(v)) return 'Enter a valid UPI ID (e.g. name@upi)';
  return '';
}

function ImageField({
  label,
  hint,
  file,
  preview,
  existingUrl,
  editable,
  onPick,
  onClear,
}: {
  label: string;
  hint: string;
  file: File | null;
  preview: string | null;
  existingUrl: string | null;
  editable: boolean;
  onPick: (file: File | null) => void;
  onClear: () => void;
}) {
  const t = useT();
  const [compressing, setCompressing] = useState(false);
  const display = preview || existingUrl;

  async function handleFile(selected: File | null) {
    if (!selected) {
      onPick(null);
      return;
    }
    setCompressing(true);
    try {
      const ready = await prepareUploadFile(selected);
      onPick(ready);
    } catch (err) {
      alert(err instanceof Error ? t(err.message) : t('Unable to process image'));
      onPick(null);
    } finally {
      setCompressing(false);
    }
  }

  return (
    <div className="photo-field">
      <span className="label">{t(label)}</span>
      {editable ? <p className="hint">{t(hint)}</p> : null}
      {compressing ? <p className="hint">{t('Compressing image…')}</p> : null}
      {display ? (
        <div className={`preview-wrap${editable ? ' preview-wrap--deletable' : ''}`}>
          <FilePreview src={display} file={file} alt={label} className="preview pool-core-preview" />
          {editable ? (
            <button
              type="button"
              className="preview-delete-btn"
              aria-label={`Delete ${label}`}
              title={t('Delete image')}
              disabled={compressing}
              onClick={onClear}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M4 7h16" />
                <path d="M9 7V5h6v2" />
                <path d="M7 7l1 13h8l1-13" />
                <path d="M10 11v6M14 11v6" />
              </svg>
            </button>
          ) : null}
        </div>
      ) : (
        <p className="hint">{t('No image uploaded yet.')}</p>
      )}
      {editable ? (
        <>
          <PhotoPickerButtons
            disabled={compressing}
            takeLabel={t('Take photo')}
            uploadLabel={t('Upload')}
            facing="environment"
            onPickFile={(file) => void handleFile(file)}
          />
          {file ? (
            <p className="file-name">
              {file.name} ({Math.ceil(file.size / 1024)} KB)
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function PlatformPayment() {
  const t = useT();
  const session = getPlatformSession();
  const canManage = Boolean(
    session && hasPlatformAccess(session.menuAccess, 'payment', session.isAccountAdmin),
  );

  const [form, setForm] = useState<PaymentSettings>({
    paymentQrPath: null,
    upiId: '',
  });
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [txnRangeActive, setTxnRangeActive] = useState(false);
  const [showRangeForm, setShowRangeForm] = useState(false);
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [txnLoading, setTxnLoading] = useState(false);
  const [txnError, setTxnError] = useState('');
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [clearQr, setClearQr] = useState(false);
  const [editing, setEditing] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const qrPreview = useObjectUrl(qrFile);

  function mapTransactions(rows: unknown[]): PaymentTransaction[] {
    if (!Array.isArray(rows)) return [];
    return rows.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: Number(r.id),
        accountName: String(r.accountName ?? ''),
        accountCode: String(r.accountCode ?? ''),
        paymentDate: r.paymentDate ? String(r.paymentDate) : null,
        durationMonths: Number(r.durationMonths ?? 0),
        amount: Number(r.amount ?? 0),
        transactionId: String(r.transactionId ?? '—'),
        packageName: String(r.packageName ?? ''),
      };
    });
  }

  async function loadTransactions(params?: { from?: string; to?: string }) {
    const qs =
      params?.from && params?.to
        ? `?from=${encodeURIComponent(params.from)}&to=${encodeURIComponent(params.to)}`
        : '';
    const res = await fetch(`/api/platform-payment/transactions${qs}`);
    const body = await res.json().catch(() => []);
    if (!res.ok) {
      throw new Error(
        body && typeof body === 'object' && 'error' in body
          ? String((body as { error?: string }).error ?? 'Failed to load transactions')
          : 'Failed to load transactions',
      );
    }
    setTransactions(mapTransactions(body));
    setTxnRangeActive(Boolean(params?.from && params?.to));
  }

  async function load() {
    setLoading(true);
    setError('');
    setTxnError('');
    try {
      const [settingsRes] = await Promise.all([
        fetch('/api/platform-payment'),
        loadTransactions(),
      ]);
      const body = await settingsRes.json().catch(() => ({}));
      if (!settingsRes.ok) throw new Error(body.error ?? 'Failed to load payment settings');
      setForm({
        paymentQrPath: body.paymentQrPath ?? null,
        upiId: String(body.upiId ?? ''),
      });
      setQrFile(null);
      setClearQr(false);
      const hasSaved =
        Boolean(body.paymentQrPath) || Boolean(String(body.upiId ?? '').trim());
      setEditing(!hasSaved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canManage || !editing) return;
    setError('');
    setSuccess('');

    if (!form.upiId.trim()) {
      setError('UPI ID is required');
      return;
    }
    if (!isValidUpiId(form.upiId)) {
      setError('Enter a valid UPI ID (e.g. name@upi)');
      return;
    }

    setSaving(true);
    try {
      const data = new FormData();
      data.append('upiId', form.upiId.trim());
      if (clearQr) data.append('clearPaymentQr', '1');
      if (qrFile) data.append('paymentQr', qrFile);

      const res = await fetch('/api/platform-payment', { method: 'PUT', body: data });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to save');

      setForm({
        paymentQrPath: body.paymentQrPath ?? null,
        upiId: String(body.upiId ?? ''),
      });
      setQrFile(null);
      setClearQr(false);
      setEditing(false);
      setSuccess('Payment details saved. Account holders can use these to pay.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PlatformPage title="Payment" className="platform-payment-page">
      <p className="lede">
        {t('Upload the SwimIT SaaS payment QR code and UPI ID. Pool account admins use these details to pay for their subscription.')}
      </p>

      {loading ? <p className="pass-empty">{t('Loading…')}</p> : null}
      {error ? <p className="error">{t(error)}</p> : null}
      {success ? <p className="success">{t(success)}</p> : null}

      {!loading ? (
        editing && canManage ? (
          <form className="pass-form-card platform-payment-details-card" onSubmit={onSubmit}>
            <ImageField
              label="SaaS payment QR code"
              hint="Image (max 200 KB) or PDF (max 2 MB) — upload the UPI / payment QR account holders will scan"
              file={qrFile}
              preview={qrPreview}
              existingUrl={clearQr ? null : uploadUrl(form.paymentQrPath)}
              editable
              onPick={(file) => {
                setQrFile(file);
                setClearQr(false);
                setError('');
                setSuccess('');
              }}
              onClear={() => {
                setQrFile(null);
                setClearQr(true);
                setError('');
                setSuccess('');
              }}
            />

            <div className="field upi-id-field">
              <div className="upi-id-row">
                <span className="label">
                  {t('UPI ID')}<span className="req"> *</span>
                </span>
                <input
                  value={form.upiId}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, upiId: e.target.value }));
                    setError('');
                    setSuccess('');
                  }}
                  placeholder="name@upi"
                  autoComplete="off"
                  required
                  aria-invalid={Boolean(upiHint(form.upiId))}
                  aria-label={t('UPI ID')}
                />
              </div>
              {upiHint(form.upiId) ? (
                <span className="field-error">{t(upiHint(form.upiId))}</span>
              ) : null}
            </div>

            <div className="pass-form-actions">
              <button type="submit" className="submit" disabled={saving}>
                {saving ? t('Saving…') : t('Save')}
              </button>
            </div>
          </form>
        ) : (
          <section className="pass-form-card pool-core-view platform-payment-details-card">
            <div className="photo-field">
              <span className="label">{t('SaaS payment QR code')}</span>
              {uploadUrl(form.paymentQrPath) ? (
                <div className="preview-wrap">
                  <FilePreview
                    src={uploadUrl(form.paymentQrPath)}
                    alt={t('SaaS payment QR code')}
                    className="preview pool-core-preview"
                  />
                </div>
              ) : (
                <p className="hint">{t('No image uploaded yet.')}</p>
              )}
            </div>

            <div className="pool-core-view-row pool-core-view-row--inline">
              <span className="label">{t('UPI ID')}</span>
              <span className="pool-core-view-sep" aria-hidden="true">
                –
              </span>
              <p className="pool-core-view-value">
                {form.upiId.trim() ? <code>{form.upiId.trim()}</code> : '—'}
              </p>
            </div>

            {canManage ? (
              <div className="pass-form-actions">
                <button
                  type="button"
                  className="submit"
                  onClick={() => {
                    setEditing(true);
                    setSuccess('');
                    setError('');
                  }}
                >
                  {t('Edit')}
                </button>
              </div>
            ) : (
              <p className="muted">{t('You do not have permission to edit payment settings.')}</p>
            )}
          </section>
        )
      ) : null}

      {!loading ? (
        <section className="pass-form-card platform-payment-txns">
          <div className="platform-payment-txns-head">
            <h2>{t('Recent payments')}</h2>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                setShowRangeForm((v) => !v);
                setTxnError('');
              }}
            >
              {showRangeForm ? t('Hide') : t('More transactions')}
            </button>
          </div>

          {showRangeForm ? (
            <form
              className="platform-payment-range"
              onSubmit={(e) => {
                e.preventDefault();
                setTxnError('');
                if (!rangeFrom || !rangeTo) {
                  setTxnError('Select both from and to dates');
                  return;
                }
                if (rangeFrom > rangeTo) {
                  setTxnError('From date must be on or before to date');
                  return;
                }
                setTxnLoading(true);
                void loadTransactions({ from: rangeFrom, to: rangeTo })
                  .catch((err) => {
                    setTxnError(err instanceof Error ? err.message : 'Failed to load');
                  })
                  .finally(() => setTxnLoading(false));
              }}
            >
              <label className="field platform-payment-range-field">
                <span className="label">{t('From')}</span>
                <input
                  type="date"
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(e.target.value)}
                  required
                />
              </label>
              <label className="field platform-payment-range-field">
                <span className="label">{t('To')}</span>
                <input
                  type="date"
                  value={rangeTo}
                  onChange={(e) => setRangeTo(e.target.value)}
                  required
                />
              </label>
              <button type="submit" className="submit platform-payment-get-btn" disabled={txnLoading}>
                {txnLoading ? t('Loading…') : t('Get')}
              </button>
              {txnRangeActive ? (
                <button
                  type="button"
                  className="ghost-btn"
                  disabled={txnLoading}
                  onClick={() => {
                    setTxnError('');
                    setTxnLoading(true);
                    void loadTransactions()
                      .then(() => {
                        setRangeFrom('');
                        setRangeTo('');
                      })
                      .catch((err) => {
                        setTxnError(err instanceof Error ? err.message : 'Failed to load');
                      })
                      .finally(() => setTxnLoading(false));
                  }}
                >
                  {t('Show last 10')}
                </button>
              ) : null}
            </form>
          ) : null}

          <p className="muted platform-payment-txns-lede">
            {txnRangeActive
              ? `${t('Confirmed payments from')} ${rangeFrom} ${t('to')} ${rangeTo}.`
              : t('Last 10 confirmed SaaS subscription payments.')}
          </p>

          {txnError ? <p className="error">{t(txnError)}</p> : null}

          {transactions.length === 0 ? (
            <p className="pass-empty">
              {txnRangeActive
                ? t('No confirmed payments in this date range.')
                : t('No confirmed payments yet.')}
            </p>
          ) : (
            <div className="accounts-table-wrap">
              <table className="accounts-table platform-payment-txn-table">
                <thead>
                  <tr>
                    <th>{t('Account name')}</th>
                    <th>{t('Code')}</th>
                    <th>{t('Payment date')}</th>
                    <th>{t('Duration')}</th>
                    <th>{t('Amount')}</th>
                    <th>{t('Transaction ID')}</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((txn) => (
                    <tr key={txn.id}>
                      <td>
                        {txn.accountName}
                        {txn.packageName ? (
                          <span className="muted"> · {txn.packageName}</span>
                        ) : null}
                      </td>
                      <td>
                        <code>{txn.accountCode}</code>
                      </td>
                      <td>
                        {txn.paymentDate
                          ? new Date(txn.paymentDate).toLocaleString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </td>
                      <td>
                        {txn.durationMonths} {txn.durationMonths === 1 ? t('month') : t('months')}
                      </td>
                      <td>₹{txn.amount.toLocaleString('en-IN')}</td>
                      <td>{txn.transactionId || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </PlatformPage>
  );
}
