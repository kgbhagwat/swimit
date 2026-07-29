import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { CameraActionIcon, UploadActionIcon } from './PhotoActionIcons';
import { compressImageToLimit } from './compressImage';
import { getPlatformSession } from './platformSession';
import { hasPlatformAccess } from './platformAccess';

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
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [compressing, setCompressing] = useState(false);
  const display = preview || existingUrl;

  async function handleFile(selected: File | null) {
    if (!selected) {
      onPick(null);
      return;
    }
    setCompressing(true);
    try {
      const ready = await compressImageToLimit(selected);
      onPick(ready);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Unable to process image');
      onPick(null);
    } finally {
      setCompressing(false);
      if (cameraRef.current) cameraRef.current.value = '';
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="photo-field">
      <span className="label">{label}</span>
      {editable ? <p className="hint">{hint}</p> : null}
      {compressing ? <p className="hint">Compressing image…</p> : null}
      {display ? (
        <div className={`preview-wrap${editable ? ' preview-wrap--deletable' : ''}`}>
          <img src={display} alt={label} className="preview pool-core-preview" />
          {editable ? (
            <button
              type="button"
              className="preview-delete-btn"
              aria-label={`Delete ${label}`}
              title="Delete image"
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
        <p className="hint">No image uploaded yet.</p>
      )}
      {editable ? (
        <>
          <div className="photo-actions">
            <button
              type="button"
              className="photo-btn"
              disabled={compressing}
              onClick={() => cameraRef.current?.click()}
            >
              <CameraActionIcon />
              Take photo
            </button>
            <button
              type="button"
              className="photo-btn"
              disabled={compressing}
              onClick={() => fileRef.current?.click()}
            >
              <UploadActionIcon />
              Upload image
            </button>
          </div>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
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

  const qrPreview = useMemo(() => (qrFile ? URL.createObjectURL(qrFile) : null), [qrFile]);

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
    <div className="page">
      <h1>Payment</h1>
      <p className="lede">
        Upload the SwimIT SaaS payment QR code and UPI ID. Pool account admins use these details to
        pay for their subscription.
      </p>

      {loading ? <p className="pass-empty">Loading…</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {success ? <p className="success">{success}</p> : null}

      {!loading ? (
        editing && canManage ? (
          <form className="pass-form-card" onSubmit={onSubmit}>
            <ImageField
              label="SaaS payment QR code"
              hint="Max 200 KB — upload the UPI / payment QR image account holders will scan"
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
                  UPI ID<span className="req"> *</span>
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
                  aria-label="UPI ID"
                />
              </div>
              {upiHint(form.upiId) ? (
                <span className="field-error">{upiHint(form.upiId)}</span>
              ) : null}
            </div>

            <div className="pass-form-actions">
              <button type="submit" className="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        ) : (
          <section className="pass-form-card pool-core-view">
            <div className="photo-field">
              <span className="label">SaaS payment QR code</span>
              {uploadUrl(form.paymentQrPath) ? (
                <div className="preview-wrap">
                  <img
                    src={uploadUrl(form.paymentQrPath)!}
                    alt="SaaS payment QR code"
                    className="preview pool-core-preview"
                  />
                </div>
              ) : (
                <p className="hint">No image uploaded yet.</p>
              )}
            </div>

            <div className="pool-core-view-row">
              <span className="label">UPI ID</span>
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
                  Edit
                </button>
              </div>
            ) : (
              <p className="muted">You do not have permission to edit payment settings.</p>
            )}
          </section>
        )
      ) : null}

      {!loading ? (
        <section className="pass-form-card platform-payment-txns">
          <div className="platform-payment-txns-head">
            <div>
              <h2>Recent payments</h2>
              <p className="muted" style={{ marginTop: 0, marginBottom: 0 }}>
                {txnRangeActive
                  ? `Confirmed payments from ${rangeFrom} to ${rangeTo}.`
                  : 'Last 10 confirmed SaaS subscription payments (amount and UPI verified from screenshot).'}
              </p>
            </div>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                setShowRangeForm((v) => !v);
                setTxnError('');
              }}
            >
              {showRangeForm ? 'Hide date range' : 'More transaction details'}
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
              <label className="field">
                <span className="label">From</span>
                <input
                  type="date"
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span className="label">To</span>
                <input
                  type="date"
                  value={rangeTo}
                  onChange={(e) => setRangeTo(e.target.value)}
                  required
                />
              </label>
              <div className="platform-payment-range-actions">
                <button type="submit" className="csv-btn" disabled={txnLoading}>
                  {txnLoading ? 'Loading…' : 'Get transactions'}
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
                    Show last 10
                  </button>
                ) : null}
              </div>
            </form>
          ) : null}

          {txnError ? <p className="error">{txnError}</p> : null}

          {transactions.length === 0 ? (
            <p className="pass-empty">
              {txnRangeActive
                ? 'No confirmed payments in this date range.'
                : 'No confirmed payments yet.'}
            </p>
          ) : (
            <div className="accounts-table-wrap">
              <table className="accounts-table platform-payment-txn-table">
                <thead>
                  <tr>
                    <th>Account name</th>
                    <th>Code</th>
                    <th>Payment date</th>
                    <th>Duration</th>
                    <th>Amount</th>
                    <th>Transaction ID</th>
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
                        {txn.durationMonths} month{txn.durationMonths === 1 ? '' : 's'}
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
    </div>
  );
}
