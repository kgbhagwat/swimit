import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { MenuBackLink } from './MenuBackLink';
import { CameraActionIcon, UploadActionIcon } from './PhotoActionIcons';
import { compressImageToLimit } from './compressImage';
import { TermsDocumentField } from './TermsDocumentField';

type PoolCoreInfoData = {
  poolName: string;
  poolAddress: string;
  poolLogoPath: string | null;
  swimmerTerms: string;
  staffTerms: string;
  paymentAcceptCash: boolean;
  paymentAcceptOnline: boolean;
  paymentQrPath: string | null;
  upiDetails: string;
  setupCompleted: boolean;
};

function uploadUrl(filename: string | null | undefined) {
  if (!filename) return null;
  return `/uploads/${filename}`;
}

function isValidUpiId(value: string) {
  const v = value.trim();
  if (!v) return true;
  return /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/.test(v);
}

function upiHint(value: string) {
  const v = value.trim();
  if (!v) return '';
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

export function PoolCoreInfo() {
  const [form, setForm] = useState<PoolCoreInfoData>({
    poolName: '',
    poolAddress: '',
    poolLogoPath: null,
    swimmerTerms: '',
    staffTerms: '',
    paymentAcceptCash: true,
    paymentAcceptOnline: true,
    paymentQrPath: null,
    upiDetails: '',
    setupCompleted: false,
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [clearLogo, setClearLogo] = useState(false);
  const [clearQr, setClearQr] = useState(false);
  const [editing, setEditing] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const logoPreview = useMemo(
    () => (logoFile ? URL.createObjectURL(logoFile) : null),
    [logoFile],
  );
  const qrPreview = useMemo(() => (qrFile ? URL.createObjectURL(qrFile) : null), [qrFile]);

  async function load(opts?: { keepEditing?: boolean }) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/pool-core-info');
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to load pool core info');
      const next: PoolCoreInfoData = {
        poolName: body.poolName ?? '',
        poolAddress: body.poolAddress ?? '',
        poolLogoPath: body.poolLogoPath ?? null,
        swimmerTerms: body.swimmerTerms ?? '',
        staffTerms: body.staffTerms ?? '',
        paymentAcceptCash: body.paymentAcceptCash !== false,
        paymentAcceptOnline: body.paymentAcceptOnline !== false,
        paymentQrPath: body.paymentQrPath ?? null,
        upiDetails: body.upiDetails ?? '',
        setupCompleted: body.setupCompleted === true,
      };
      setForm(next);
      setLogoFile(null);
      setQrFile(null);
      setClearLogo(false);
      setClearQr(false);
      if (!opts?.keepEditing) {
        // Seeded account name/address alone is not a submitted setup.
        setEditing(!next.setupCompleted);
      }
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
    if (!editing) return;
    setError('');
    setSuccess('');
    if (!form.paymentAcceptCash && !form.paymentAcceptOnline) {
      setError('Select at least one payment option (Cash or Online)');
      return;
    }
    if (form.paymentAcceptOnline) {
      const hasQr = Boolean(qrFile) || (Boolean(form.paymentQrPath) && !clearQr);
      if (!hasQr) {
        setError('Payment QR code is required when Online is selected');
        return;
      }
      if (!form.upiDetails.trim()) {
        setError('UPI ID is required when Online is selected');
        return;
      }
    }
    if (!isValidUpiId(form.upiDetails)) {
      setError('Enter a valid UPI ID (e.g. name@upi)');
      return;
    }
    setSaving(true);
    try {
      const data = new FormData();
      data.append('poolName', form.poolName.trim());
      data.append('poolAddress', form.poolAddress.trim());
      data.append('swimmerTerms', form.swimmerTerms);
      data.append('staffTerms', form.staffTerms);
      data.append('upiDetails', form.upiDetails.trim());
      data.append('paymentAcceptCash', form.paymentAcceptCash ? '1' : '0');
      data.append('paymentAcceptOnline', form.paymentAcceptOnline ? '1' : '0');
      if (logoFile) data.append('poolLogo', logoFile);
      if (qrFile) data.append('paymentQr', qrFile);
      if (clearLogo && !logoFile) data.append('clearPoolLogo', '1');
      if (clearQr && !qrFile) data.append('clearPaymentQr', '1');

      const res = await fetch('/api/pool-core-info', { method: 'PUT', body: data });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to save');
      setForm({
        poolName: body.poolName ?? '',
        poolAddress: body.poolAddress ?? '',
        poolLogoPath: body.poolLogoPath ?? null,
        swimmerTerms: body.swimmerTerms ?? '',
        staffTerms: body.staffTerms ?? '',
        paymentAcceptCash: body.paymentAcceptCash !== false,
        paymentAcceptOnline: body.paymentAcceptOnline !== false,
        paymentQrPath: body.paymentQrPath ?? null,
        upiDetails: body.upiDetails ?? '',
        setupCompleted: body.setupCompleted === true,
      });
      setLogoFile(null);
      setQrFile(null);
      setClearLogo(false);
      setClearQr(false);
      setEditing(false);
      setSuccess('Pool core info saved successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div className="top-row">
        <MenuBackLink />
      </div>

      <h1>Pool Core Info</h1>

      {loading ? <p className="pass-empty">Loading…</p> : null}
      {error && !editing ? <p className="error">{error}</p> : null}
      {success && !editing ? <p className="success">{success}</p> : null}

      {!loading && !editing ? (
        <section className="pass-form-card pool-core-form pool-core-view">
          <div className="pool-core-view-row">
            <span className="label">Pool Name</span>
            <p className="pool-core-view-value">{form.poolName.trim() || '—'}</p>
          </div>

          <div className="pool-core-view-row">
            <span className="label">Pool Address</span>
            <p className="pool-core-view-value pool-core-view-multiline">
              {form.poolAddress.trim() || '—'}
            </p>
          </div>

          <div className="pool-core-view-row">
            <span className="label">Payment Option</span>
            <p className="pool-core-view-value">
              {[
                form.paymentAcceptCash ? 'Cash' : null,
                form.paymentAcceptOnline ? 'Online' : null,
              ]
                .filter(Boolean)
                .join(', ') || '—'}
            </p>
          </div>

          <div className="grid-2 photos">
            <div className="photo-field">
              <span className="label">Pool Logo</span>
              {uploadUrl(form.poolLogoPath) ? (
                <div className="preview-wrap">
                  <img
                    src={uploadUrl(form.poolLogoPath)!}
                    alt="Pool Logo"
                    className="preview pool-core-preview"
                  />
                </div>
              ) : (
                <p className="hint">No logo uploaded.</p>
              )}
            </div>
            <div className="photo-field">
              <span className="label">Payment QR code</span>
              {uploadUrl(form.paymentQrPath) ? (
                <div className="preview-wrap">
                  <img
                    src={uploadUrl(form.paymentQrPath)!}
                    alt="Payment QR code"
                    className="preview pool-core-preview"
                  />
                </div>
              ) : (
                <p className="hint">No payment QR uploaded.</p>
              )}
            </div>
          </div>

          <div className="pool-core-view-row">
            <span className="label">UPI ID</span>
            <p className="pool-core-view-value">
              {form.upiDetails.trim() ? <code>{form.upiDetails.trim()}</code> : '—'}
            </p>
          </div>

          <div className="pool-core-view-row">
            <span className="label">Terms & Conditions for swimmer</span>
            <div className="pool-core-view-text">
              {form.swimmerTerms.trim() || '—'}
            </div>
          </div>

          <div className="pool-core-view-row">
            <span className="label">Terms & Conditions for staff</span>
            <div className="pool-core-view-text">
              {form.staffTerms.trim() || '—'}
            </div>
          </div>

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
        </section>
      ) : null}

      {!loading && editing ? (
        <form className="pass-form-card pool-core-form" onSubmit={onSubmit}>
          <label className="field">
            <span className="label">
              Pool Name <span className="req">*</span>
            </span>
            <input
              value={form.poolName}
              onChange={(e) => setForm((prev) => ({ ...prev, poolName: e.target.value }))}
              placeholder="e.g. Blue Wave Swimming Pool"
              required
            />
          </label>

          <label className="field">
            <span className="label">
              Pool Address <span className="req">*</span>
            </span>
            <textarea
              value={form.poolAddress}
              onChange={(e) => setForm((prev) => ({ ...prev, poolAddress: e.target.value }))}
              placeholder="Full facility address"
              rows={3}
              required
            />
          </label>

          <fieldset className="field payment-options-field">
            <legend className="label">
              Payment Option <span className="req">*</span>
            </legend>
            <p className="hint">Tick the payment methods this pool accepts.</p>
            <div className="payment-option-checks">
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={form.paymentAcceptCash}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, paymentAcceptCash: e.target.checked }))
                  }
                />
                <span>Cash</span>
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={form.paymentAcceptOnline}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, paymentAcceptOnline: e.target.checked }))
                  }
                />
                <span>Online</span>
              </label>
            </div>
            {form.paymentAcceptOnline ? (
              <p className="hint">Online selected — Payment QR and UPI ID are required.</p>
            ) : null}
          </fieldset>

          <div className="grid-2 photos">
            <ImageField
              label="Pool Logo"
              hint="Max 200 KB — square or landscape logo works best"
              file={logoFile}
              preview={logoPreview}
              existingUrl={clearLogo ? null : uploadUrl(form.poolLogoPath)}
              editable
              onPick={(file) => {
                setLogoFile(file);
                if (file) setClearLogo(false);
              }}
              onClear={() => {
                setLogoFile(null);
                setClearLogo(true);
              }}
            />
            <ImageField
              label={form.paymentAcceptOnline ? 'Payment QR code *' : 'Payment QR code'}
              hint={
                form.paymentAcceptOnline
                  ? 'Required for Online — Max 200 KB — upload UPI / payment QR image'
                  : 'Max 200 KB — upload UPI / payment QR image'
              }
              file={qrFile}
              preview={qrPreview}
              existingUrl={clearQr ? null : uploadUrl(form.paymentQrPath)}
              editable
              onPick={(file) => {
                setQrFile(file);
                if (file) setClearQr(false);
              }}
              onClear={() => {
                setQrFile(null);
                setClearQr(true);
              }}
            />
          </div>

          <div className="field upi-id-field">
            <div className="upi-id-row">
              <span className="label">
                UPI ID{form.paymentAcceptOnline ? <span className="req"> *</span> : null}
              </span>
              <input
                value={form.upiDetails}
                onChange={(e) => setForm((prev) => ({ ...prev, upiDetails: e.target.value }))}
                placeholder="name@upi"
                inputMode="email"
                autoComplete="off"
                required={form.paymentAcceptOnline}
                aria-invalid={Boolean(upiHint(form.upiDetails))}
                aria-label="UPI ID"
              />
            </div>
            {upiHint(form.upiDetails) ? (
              <span className="field-error">{upiHint(form.upiDetails)}</span>
            ) : null}
          </div>

          <TermsDocumentField
            label="Terms & Conditions for swimmer"
            value={form.swimmerTerms}
            onChange={(swimmerTerms) => setForm((prev) => ({ ...prev, swimmerTerms }))}
            placeholder="Shown on swimmer registration"
            rows={10}
            editable
          />

          <TermsDocumentField
            label="Terms & Conditions for staff"
            value={form.staffTerms}
            onChange={(staffTerms) => setForm((prev) => ({ ...prev, staffTerms }))}
            placeholder="Shown on staff registration"
            rows={10}
            editable
          />

          {error ? <p className="error">{error}</p> : null}
          {success ? <p className="success">{success}</p> : null}

          <div className="pass-form-actions">
            <button
              type="button"
              className="pass-cancel"
              onClick={() => void load({ keepEditing: true })}
              disabled={saving}
            >
              Reset
            </button>
            <button type="submit" className="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
