import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { MenuBackLink } from './MenuBackLink';
import { compressImageToLimit } from './compressImage';

type PoolCoreInfoData = {
  poolName: string;
  poolAddress: string;
  poolLogoPath: string | null;
  swimmerTerms: string;
  staffTerms: string;
  paymentQrPath: string | null;
  upiDetails: string;
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
  onPick,
}: {
  label: string;
  hint: string;
  file: File | null;
  preview: string | null;
  existingUrl: string | null;
  onPick: (file: File | null) => void;
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
      <p className="hint">{hint}</p>
      {compressing ? <p className="hint">Compressing image…</p> : null}
      {display ? (
        <div className="preview-wrap">
          <img src={display} alt={label} className="preview pool-core-preview" />
          {file ? (
            <button type="button" className="linkish" onClick={() => onPick(null)}>
              Remove new upload
            </button>
          ) : null}
        </div>
      ) : (
        <p className="hint">No image uploaded yet.</p>
      )}
      <div className="photo-actions">
        <button
          type="button"
          className="photo-btn"
          disabled={compressing}
          onClick={() => cameraRef.current?.click()}
        >
          <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M4 8h3l2-2h6l2 2h3v11H4V8z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
          Take photo
        </button>
        <button
          type="button"
          className="photo-btn"
          disabled={compressing}
          onClick={() => fileRef.current?.click()}
        >
          <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M3 7h6l2 2h10v10H3V7z" />
          </svg>
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
    paymentQrPath: null,
    upiDetails: '',
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const logoPreview = useMemo(
    () => (logoFile ? URL.createObjectURL(logoFile) : null),
    [logoFile],
  );
  const qrPreview = useMemo(() => (qrFile ? URL.createObjectURL(qrFile) : null), [qrFile]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/pool-core-info');
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to load pool core info');
      setForm({
        poolName: body.poolName ?? '',
        poolAddress: body.poolAddress ?? '',
        poolLogoPath: body.poolLogoPath ?? null,
        swimmerTerms: body.swimmerTerms ?? '',
        staffTerms: body.staffTerms ?? '',
        paymentQrPath: body.paymentQrPath ?? null,
        upiDetails: body.upiDetails ?? '',
      });
      setLogoFile(null);
      setQrFile(null);
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
    setError('');
    setSuccess('');
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
      if (logoFile) data.append('poolLogo', logoFile);
      if (qrFile) data.append('paymentQr', qrFile);

      const res = await fetch('/api/pool-core-info', { method: 'PUT', body: data });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to save');
      setForm({
        poolName: body.poolName ?? '',
        poolAddress: body.poolAddress ?? '',
        poolLogoPath: body.poolLogoPath ?? null,
        swimmerTerms: body.swimmerTerms ?? '',
        staffTerms: body.staffTerms ?? '',
        paymentQrPath: body.paymentQrPath ?? null,
        upiDetails: body.upiDetails ?? '',
      });
      setLogoFile(null);
      setQrFile(null);
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
      <p className="lede">Facility identity, terms, and payment details used across SwimIT.</p>

      {loading ? (
        <p className="pass-empty">Loading…</p>
      ) : (
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

          <div className="grid-2 photos">
            <ImageField
              label="Pool Logo"
              hint="Max 200 KB — square or landscape logo works best"
              file={logoFile}
              preview={logoPreview}
              existingUrl={uploadUrl(form.poolLogoPath)}
              onPick={setLogoFile}
            />
            <ImageField
              label="Payment QR code"
              hint="Max 200 KB — upload UPI / payment QR image"
              file={qrFile}
              preview={qrPreview}
              existingUrl={uploadUrl(form.paymentQrPath)}
              onPick={setQrFile}
            />
          </div>

          <div className="field upi-id-field">
            <div className="upi-id-row">
              <span className="label">UPI ID</span>
              <input
                value={form.upiDetails}
                onChange={(e) => setForm((prev) => ({ ...prev, upiDetails: e.target.value }))}
                placeholder="name@upi"
                inputMode="email"
                autoComplete="off"
                aria-invalid={Boolean(upiHint(form.upiDetails))}
                aria-label="UPI ID"
              />
            </div>
            {upiHint(form.upiDetails) ? (
              <span className="field-error">{upiHint(form.upiDetails)}</span>
            ) : null}
          </div>

          <label className="field">
            <span className="label">Terms & Conditions for swimmer</span>
            <textarea
              value={form.swimmerTerms}
              onChange={(e) => setForm((prev) => ({ ...prev, swimmerTerms: e.target.value }))}
              placeholder="Shown on swimmer registration"
              rows={10}
              className="terms-textarea"
            />
          </label>

          <label className="field">
            <span className="label">Terms & Conditions for staff</span>
            <textarea
              value={form.staffTerms}
              onChange={(e) => setForm((prev) => ({ ...prev, staffTerms: e.target.value }))}
              placeholder="Shown on staff registration"
              rows={10}
              className="terms-textarea"
            />
          </label>

          {error ? <p className="error">{error}</p> : null}
          {success ? <p className="success">{success}</p> : null}

          <div className="pass-form-actions">
            <button type="button" className="pass-cancel" onClick={() => void load()} disabled={saving}>
              Reset
            </button>
            <button type="submit" className="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
