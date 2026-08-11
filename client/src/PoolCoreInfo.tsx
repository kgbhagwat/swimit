import { FormEvent, useEffect, useRef, useState } from 'react';
import { useLanguage, useT } from './i18n';
import { PlatformPage } from './PlatformPage';
import { CameraActionIcon, UploadActionIcon } from './PhotoActionIcons';
import { compressImageToLimit } from './compressImage';
import { TermsDocumentField } from './TermsDocumentField';
import { TermsBlocks } from './TermsBlocks';
import {
  defaultCoachTerms,
  isDefaultCoachTerms,
  resolveCoachTerms,
} from './coachTermsDefaults';
import {
  defaultSwimmerTerms,
  isDefaultSwimmerTerms,
  resolveSwimmerTerms,
} from './swimmerTermsDefaults';
import { useObjectUrl } from './useObjectUrl';

type PoolCoreInfoData = {
  poolName: string;
  poolAddress: string;
  googleMapsUrl: string;
  locationSet: boolean;
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

function upiContainsTenDigits(value: string) {
  return /\d{10}/.test(String(value ?? ''));
}

function upiHint(value: string) {
  const v = value.trim();
  if (!v) return '';
  if (upiContainsTenDigits(v)) {
    return 'UPI ID should not contain mobile no.';
  }
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
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [compressing, setCompressing] = useState(false);
  const draftPreview = useObjectUrl(draftFile);
  const display = preview || existingUrl;

  function closeModal(discardDraft: boolean) {
    if (discardDraft) setDraftFile(null);
    setCompressing(false);
    setOpen(false);
    if (cameraRef.current) cameraRef.current.value = '';
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleDraftFile(selected: File | null) {
    if (!selected) {
      setDraftFile(null);
      return;
    }
    setCompressing(true);
    try {
      const ready = await compressImageToLimit(selected);
      setDraftFile(ready);
    } catch (err) {
      alert(err instanceof Error ? err.message : t('Unable to process image'));
      setDraftFile(null);
    } finally {
      setCompressing(false);
      if (cameraRef.current) cameraRef.current.value = '';
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function confirmDraft() {
    if (!draftFile) return;
    onPick(draftFile);
    closeModal(true);
  }

  return (
    <div className="photo-field">
      <div className="pool-core-image-heading">
        <span className="label">{label}</span>
        {editable ? (
          <button
            type="button"
            className="photo-btn pool-core-upload-trigger"
            onClick={() => {
              setDraftFile(null);
              setOpen(true);
            }}
          >
            {t('Upload')}
          </button>
        ) : null}
        {editable && hint ? <span className="pool-core-upload-hint">{hint}</span> : null}
        {display ? (
          <div className="pool-core-image-preview-row">
            <div className="preview-wrap">
              <img src={display} alt={label} className="preview pool-core-preview" />
            </div>
            {editable ? (
              <button
                type="button"
                className="preview-delete-btn pool-core-preview-delete"
                aria-label={`${t('Delete')} ${label}`}
                title={t('Delete image')}
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
        ) : null}
      </div>
      {editable && file ? (
        <p className="file-name">
          {file.name} ({Math.ceil(file.size / 1024)} KB)
        </p>
      ) : null}

      {open ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pool-core-image-modal-title"
          onClick={() => closeModal(true)}
        >
          <div
            className="modal-panel pool-core-image-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="pool-core-image-modal-title">{label}</h2>
            <p className="modal-intro">
              {t('Take a photo or upload an image, then confirm with OK.')}
            </p>
            <div className="modal-scroll">
              <div className="photo-actions">
                <button
                  type="button"
                  className="photo-btn"
                  disabled={compressing}
                  onClick={() => cameraRef.current?.click()}
                >
                  <CameraActionIcon />
                  {t('Take photo')}
                </button>
                <button
                  type="button"
                  className="photo-btn"
                  disabled={compressing}
                  onClick={() => fileRef.current?.click()}
                >
                  <UploadActionIcon />
                  {t('Upload image')}
                </button>
              </div>
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => void handleDraftFile(e.target.files?.[0] ?? null)}
              />
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => void handleDraftFile(e.target.files?.[0] ?? null)}
              />
              {compressing ? <p className="hint">{t('Compressing image…')}</p> : null}
              {draftPreview ? (
                <div className="preview-wrap pool-core-image-modal-preview">
                  <img
                    src={draftPreview}
                    alt={`${label} ${t('preview')}`}
                    className="preview pool-core-preview"
                  />
                </div>
              ) : null}
              {draftFile ? (
                <p className="file-name">
                  {draftFile.name} ({Math.ceil(draftFile.size / 1024)} KB)
                </p>
              ) : null}
            </div>
            <div className="modal-footer accounts-delete-modal-footer">
              <button type="button" className="ghost-btn" onClick={() => closeModal(true)}>
                {t('Cancel')}
              </button>
              <button
                type="button"
                className="submit"
                disabled={!draftFile || compressing}
                onClick={confirmDraft}
              >
                {t('OK')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PoolCoreInfo() {
  const t = useT();
  const { lang } = useLanguage();
  const [form, setForm] = useState<PoolCoreInfoData>(() => ({
    poolName: '',
    poolAddress: '',
    googleMapsUrl: '',
    locationSet: false,
    poolLogoPath: null,
    swimmerTerms: defaultSwimmerTerms('en'),
    staffTerms: defaultCoachTerms('en'),
    // Application preview starts unchecked; account pages keep prior defaults until load.
    paymentAcceptCash: false,
    paymentAcceptOnline: false,
    paymentQrPath: null,
    upiDetails: '',
    setupCompleted: false,
  }));
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [clearLogo, setClearLogo] = useState(false);
  const [clearQr, setClearQr] = useState(false);
  const [editing, setEditing] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const logoPreview = useObjectUrl(logoFile);
  const qrPreview = useObjectUrl(qrFile);

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
        googleMapsUrl: String(body.googleMapsUrl ?? ''),
        locationSet: Boolean(body.locationSet),
        poolLogoPath: body.poolLogoPath ?? null,
        // Empty / built-in default → language text so the account can edit them.
        swimmerTerms: resolveSwimmerTerms(String(body.swimmerTerms ?? ''), lang),
        staffTerms: resolveCoachTerms(String(body.staffTerms ?? ''), lang),
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

  // When UI language changes, swap built-in default terms (keep custom edits).
  useEffect(() => {
    if (loading) return;
    setForm((prev) => {
      let next = prev;
      if (isDefaultSwimmerTerms(prev.swimmerTerms)) {
        const swimmer = defaultSwimmerTerms(lang);
        if (prev.swimmerTerms !== swimmer) next = { ...next, swimmerTerms: swimmer };
      }
      if (isDefaultCoachTerms(prev.staffTerms)) {
        const staff = defaultCoachTerms(lang);
        if (prev.staffTerms !== staff) next = { ...next, staffTerms: staff };
      }
      return next;
    });
  }, [lang, loading]);

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
    if (upiHint(form.upiDetails)) {
      setError(upiHint(form.upiDetails));
      return;
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
      data.append('googleMapsUrl', form.googleMapsUrl.trim());
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
        googleMapsUrl: String(body.googleMapsUrl ?? ''),
        locationSet: Boolean(body.locationSet),
        poolLogoPath: body.poolLogoPath ?? null,
        swimmerTerms: resolveSwimmerTerms(String(body.swimmerTerms ?? ''), lang),
        staffTerms: resolveCoachTerms(String(body.staffTerms ?? ''), lang),
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

  const paymentOptionsLabel = [
    form.paymentAcceptCash ? t('Cash') : null,
    form.paymentAcceptOnline ? t('Online') : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <PlatformPage
      title="Core Info"
      actions={
        !loading ? (
          editing ? (
            <>
              <button
                type="button"
                className="pass-cancel"
                onClick={() => {
                  setForm((prev) => ({
                    ...prev,
                    poolName: '',
                    poolAddress: '',
                    googleMapsUrl: '',
                    locationSet: false,
                    swimmerTerms: '',
                    staffTerms: '',
                    paymentAcceptCash: false,
                    paymentAcceptOnline: false,
                    upiDetails: '',
                  }));
                  setLogoFile(null);
                  setQrFile(null);
                  setClearLogo(true);
                  setClearQr(true);
                  setError('');
                  setSuccess('');
                }}
                disabled={saving}
              >
                {t('Reset')}
              </button>
              <button type="submit" form="pool-core-info-form" className="submit" disabled={saving}>
                {saving ? t('Saving…') : t('Save')}
              </button>
            </>
          ) : (
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
          )
        ) : undefined
      }
    >
      <p className="lede batch-list-lede">
        {t(
          'Pool name, address, map location (for remote login checks), terms, payment options, and branding images.',
        )}
      </p>
      {loading ? <p className="pass-empty">{t('Loading…')}</p> : null}
      {error && !editing ? <p className="error">{t(error)}</p> : null}
      {success && !editing ? <p className="success">{t(success)}</p> : null}

      {!loading && !editing ? (
        <section className="pass-form-card pool-core-form pool-core-view">
          <div className="form-grid-2">
            <div className="pool-core-view-row">
              <span className="label">{t('Pool Name')}</span>
              <p className="pool-core-view-value">{form.poolName.trim() || '—'}</p>
            </div>

            <div className="pool-core-view-row">
              <span className="label">{t('Pool Address')}</span>
              <p className="pool-core-view-value pool-core-view-multiline">
                {form.poolAddress.trim() || '—'}
              </p>
            </div>
          </div>

          <div className="form-grid-2">
            <div className="pool-core-view-row">
              <span className="label">{t('Google location of swimming pool')}</span>
              <p className="pool-core-view-value pool-core-view-multiline">
                {form.googleMapsUrl.trim() ? (
                  <a
                    href={form.googleMapsUrl.trim()}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {form.googleMapsUrl.trim()}
                  </a>
                ) : form.locationSet ? (
                  t('Location saved')
                ) : (
                  '—'
                )}
              </p>
            </div>
          </div>

          <div className="form-grid-2 pool-core-payment-options-row">
            <div className="pool-core-view-row pool-core-view-row--inline">
              <span className="label">{t('Payment Options')}</span>
              <p className="pool-core-view-value">{paymentOptionsLabel || '—'}</p>
            </div>
            <div className="pool-core-view-row pool-core-view-row--inline">
              <span className="label">{t('UPI ID')}</span>
              <p className="pool-core-view-value">
                {form.upiDetails.trim() ? <code>{form.upiDetails.trim()}</code> : '—'}
              </p>
            </div>
          </div>

          <div className="grid-2 photos">
            <div className="photo-field">
              <span className="label">{t('Pool Logo')}</span>
              {uploadUrl(form.poolLogoPath) ? (
                <div className="preview-wrap">
                  <img
                    src={uploadUrl(form.poolLogoPath)!}
                    alt={t('Pool Logo')}
                    className="preview pool-core-preview"
                  />
                </div>
              ) : (
                <p className="hint">{t('No logo uploaded.')}</p>
              )}
            </div>
            <div className="photo-field">
              <span className="label">{t('Payment QR code')}</span>
              {uploadUrl(form.paymentQrPath) ? (
                <div className="preview-wrap">
                  <img
                    src={uploadUrl(form.paymentQrPath)!}
                    alt={t('Payment QR code')}
                    className="preview pool-core-preview"
                  />
                </div>
              ) : (
                <p className="hint">{t('No payment QR uploaded.')}</p>
              )}
            </div>
          </div>

          <hr className="pool-core-section-divider" />

          <div className="form-grid-2">
            <div className="pool-core-view-row">
              <span className="label">{t('Terms & Conditions for swimmer')}</span>
              <div className="pool-core-view-text">
                <TermsBlocks text={form.swimmerTerms.trim() || defaultSwimmerTerms(lang)} />
              </div>
            </div>

            <div className="pool-core-view-row">
              <span className="label">{t('Terms & Conditions for staff')}</span>
              <div className="pool-core-view-text">
                <TermsBlocks text={form.staffTerms.trim() || defaultCoachTerms(lang)} />
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {!loading && editing ? (
        <form
          id="pool-core-info-form"
          className="pass-form-card pool-core-form"
          onSubmit={onSubmit}
        >
          <div className="form-grid-2">
            <label className="field field-beside">
              <span className="label">
                {t('Pool Name')} <span className="req">*</span>
              </span>
              <input
                value={form.poolName}
                onChange={(e) => setForm((prev) => ({ ...prev, poolName: e.target.value }))}
                placeholder={t('e.g. Demo Pool')}
                required
              />
            </label>

            <label className="field field-beside">
              <span className="label">
                {t('Pool Address')} <span className="req">*</span>
              </span>
              <textarea
                value={form.poolAddress}
                onChange={(e) => setForm((prev) => ({ ...prev, poolAddress: e.target.value }))}
                placeholder={t('e.g. 12 Lake View Road, Pune')}
                rows={2}
                required
              />
            </label>
          </div>

          <label className="field field-beside pool-core-maps-field">
            <span className="label">{t('Google location of swimming pool')}</span>
            <input
              value={form.googleMapsUrl}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, googleMapsUrl: e.target.value }))
              }
              placeholder={t(
                'Open your pool in Google Maps, tap Share, copy the link, and paste it here.',
              )}
              autoComplete="off"
              spellCheck={false}
            />
          </label>

          <div className="form-grid-2 pool-core-payment-options-row">
            <div
              className="field payment-options-field"
              role="group"
              aria-labelledby="payment-options-label"
            >
              <div className="payment-options-heading">
                <span id="payment-options-label" className="label">
                  {t('Payment Options')} <span className="req">*</span>
                </span>
                <div className="payment-option-checks">
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={form.paymentAcceptCash}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, paymentAcceptCash: e.target.checked }))
                      }
                    />
                    <span>{t('Cash')}</span>
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={form.paymentAcceptOnline}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, paymentAcceptOnline: e.target.checked }))
                      }
                    />
                    <span>{t('Online')}</span>
                    <span className="payment-online-note">
                      {t('(Payment QR and UPI ID are required.)')}
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div className="field upi-id-field">
              <div className="upi-id-row">
                <span className="label">
                  {t('UPI ID')}
                  {form.paymentAcceptOnline ? <span className="req"> *</span> : null}
                </span>
                <input
                  value={form.upiDetails}
                  onChange={(e) => setForm((prev) => ({ ...prev, upiDetails: e.target.value }))}
                  placeholder="name@upi"
                  inputMode="email"
                  autoComplete="off"
                  required={form.paymentAcceptOnline}
                  aria-invalid={Boolean(upiHint(form.upiDetails))}
                  aria-label={t('UPI ID')}
                />
              </div>
              {upiHint(form.upiDetails) ? (
                <span className="field-error">{t(upiHint(form.upiDetails))}</span>
              ) : (
                <span className="upi-id-note">{t('UPI ID should not contain mobile no.')}</span>
              )}
            </div>
          </div>

          <div className="grid-2 photos">
            <ImageField
              label={t('Pool Logo')}
              hint={t('Max 200 KB')}
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
              label={
                form.paymentAcceptOnline ? `${t('Payment QR code')} *` : t('Payment QR code')
              }
              hint=""
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

          <hr className="pool-core-section-divider" />

          <div className="form-grid-2">
            <div className="pool-core-terms-edit">
              <TermsDocumentField
                label={t('Terms & Conditions for swimmer')}
                value={form.swimmerTerms}
                onChange={(swimmerTerms) => setForm((prev) => ({ ...prev, swimmerTerms }))}
                placeholder={t('Type or Upload .doc or .txt file.')}
                rows={8}
                editable
                richHeadings
              />
              <p className="hint pool-core-terms-hint">
                {t(
                  'Default swimmer terms are shown. Edit and save to customize them for your pool.',
                )}
              </p>
            </div>

            <div className="pool-core-terms-edit">
              <TermsDocumentField
                label={t('Terms & Conditions for staff')}
                value={form.staffTerms}
                onChange={(staffTerms) => setForm((prev) => ({ ...prev, staffTerms }))}
                placeholder={t('Type or Upload .doc or .txt file.')}
                rows={8}
                editable
                richHeadings
              />
              <p className="hint pool-core-terms-hint">
                {t(
                  'Default coach terms are shown. Edit and save to customize them for your pool.',
                )}
              </p>
            </div>
          </div>

          {error ? <p className="error">{t(error)}</p> : null}
          {success ? <p className="success">{t(success)}</p> : null}
        </form>
      ) : null}
    </PlatformPage>
  );
}
