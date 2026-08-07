import { useId, useRef, useState } from 'react';
import { compressImageToLimit } from './compressImage';
import { useT } from './i18n';
import { CameraActionIcon, UploadActionIcon } from './PhotoActionIcons';
import { useObjectUrl, useObjectUrls } from './useObjectUrl';

function FieldLabel({ children, required }: { children: string; required?: boolean }) {
  return (
    <span className="label">
      {children}
      {required ? (
        <>
          {' '}
          <span className="req">*</span>
        </>
      ) : null}
    </span>
  );
}

type RegistrationPhotoFieldProps = {
  label: string;
  hint?: string;
  required?: boolean;
  file: File | null;
  preview: string | null;
  existingUrl?: string | null;
  takeLabel?: string;
  uploadLabel?: string;
  onPick: (file: File | null) => void;
  onClearExisting?: () => void;
  invalid?: boolean;
  /** Hide the field label (e.g. identity proof beside document dropdown). */
  hideLabel?: boolean;
};

/** Upload trigger + modal (Take photo / Upload → OK), matching Core Info. */
export function RegistrationPhotoField({
  label,
  hint = '',
  required,
  file,
  preview,
  existingUrl,
  takeLabel,
  uploadLabel,
  onPick,
  onClearExisting,
  invalid,
  hideLabel = false,
}: RegistrationPhotoFieldProps) {
  const t = useT();
  const resolvedTake = takeLabel ?? t('Take photo');
  const resolvedUpload = uploadLabel ?? t('Upload');
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [compressing, setCompressing] = useState(false);
  const draftPreview = useObjectUrl(draftFile);
  const display = preview || existingUrl || null;
  const modalTitleId = useId();

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

  function clearImage() {
    onPick(null);
    onClearExisting?.();
  }

  return (
    <div
      className={`photo-field${invalid ? ' field-box-invalid' : ''}${
        hideLabel ? ' photo-field--upload-only' : ''
      }`}
    >
      <div className="pool-core-image-heading">
        {hideLabel ? null : <FieldLabel required={required}>{label}</FieldLabel>}
        <button
          type="button"
          className="photo-btn pool-core-upload-trigger"
          onClick={() => {
            setDraftFile(null);
            setOpen(true);
          }}
        >
          {resolvedUpload}
        </button>
      </div>
      {display ? (
        <div className="preview-wrap preview-wrap--deletable">
          <img src={display} alt={label} className="preview pool-core-preview" />
          <button
            type="button"
            className="preview-delete-btn"
            aria-label={`${t('Delete')} ${label}`}
            title={t('Delete image')}
            onClick={clearImage}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M4 7h16" />
              <path d="M9 7V5h6v2" />
              <path d="M7 7l1 13h8l1-13" />
              <path d="M10 11v6M14 11v6" />
            </svg>
          </button>
        </div>
      ) : null}
      {file ? (
        <p className="file-name">
          {file.name} ({Math.ceil(file.size / 1024)} KB)
        </p>
      ) : null}

      {open ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby={modalTitleId}
          onClick={() => closeModal(true)}
        >
          <div
            className="modal-panel pool-core-image-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id={modalTitleId}>{label}</h2>
            <p className="modal-intro">
              {t('Take a photo or upload an image, then confirm with OK.')}
              {hint ? ` ${hint}` : ''}
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
                  {resolvedTake}
                </button>
                <button
                  type="button"
                  className="photo-btn"
                  disabled={compressing}
                  onClick={() => fileRef.current?.click()}
                >
                  <UploadActionIcon />
                  {resolvedUpload}
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

const MAX_CERTIFICATE_COUNT = 3;

type MultiCertificateFieldProps = {
  label: string;
  hint?: string;
  files: (File | null)[];
  previews: (string | null)[];
  existingUrls: (string | null)[];
  takeLabel?: string;
  uploadLabel?: string;
  onChangeFiles: (next: (File | null)[]) => void;
  onChangeExisting: (next: (string | null)[]) => void;
};

/** Multi-image certificate upload with one Upload modal. */
export function MultiCertificateField({
  label,
  hint = '',
  files,
  previews,
  existingUrls,
  takeLabel,
  uploadLabel,
  onChangeFiles,
  onChangeExisting,
}: MultiCertificateFieldProps) {
  const t = useT();
  const resolvedTake = takeLabel ?? t('Take photo');
  const resolvedUpload = uploadLabel ?? t('Upload');
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [draftFiles, setDraftFiles] = useState<File[]>([]);
  const [compressing, setCompressing] = useState(false);
  const draftPreviews = useObjectUrls(draftFiles);
  const modalTitleId = useId();

  const filledCount =
    files.filter(Boolean).length + existingUrls.filter((u, i) => u && !files[i]).length;

  function closeModal(discardDraft: boolean) {
    if (discardDraft) setDraftFiles([]);
    setCompressing(false);
    setOpen(false);
    if (cameraRef.current) cameraRef.current.value = '';
    if (fileRef.current) fileRef.current.value = '';
  }

  async function addFiles(selected: FileList | File[] | null) {
    if (!selected || selected.length === 0) return;
    const incoming = Array.from(selected);
    setCompressing(true);
    try {
      const compressed: File[] = [];
      for (const nextFile of incoming) {
        compressed.push(await compressImageToLimit(nextFile));
      }
      setDraftFiles((prev) => [...prev, ...compressed].slice(0, MAX_CERTIFICATE_COUNT));
    } catch (err) {
      alert(err instanceof Error ? err.message : t('Unable to process image'));
    } finally {
      setCompressing(false);
      if (cameraRef.current) cameraRef.current.value = '';
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function confirmDraft() {
    const next: (File | null)[] = [null, null, null];
    draftFiles.slice(0, MAX_CERTIFICATE_COUNT).forEach((file, i) => {
      next[i] = file;
    });
    onChangeFiles(next);
    onChangeExisting([null, null, null]);
    closeModal(true);
  }

  function clearSlot(index: number) {
    onChangeFiles(files.map((f, i) => (i === index ? null : f)));
    onChangeExisting(existingUrls.map((u, i) => (i === index ? null : u)));
  }

  function removeDraft(index: number) {
    setDraftFiles((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="photo-field multi-certificate-field">
      <div className="pool-core-image-heading">
        <FieldLabel>{label}</FieldLabel>
        <button
          type="button"
          className="photo-btn pool-core-upload-trigger"
          onClick={() => {
            setDraftFiles(files.filter((f): f is File => Boolean(f)));
            setOpen(true);
          }}
        >
          {resolvedUpload}
        </button>
      </div>
      <div className="multi-certificate-previews">
        {[0, 1, 2].map((i) => {
          const src = previews[i] || existingUrls[i];
          if (!src) return null;
          return (
            <div className="preview-wrap preview-wrap--deletable" key={`cert-preview-${i}`}>
              <img src={src} alt={`${label} ${i + 1}`} className="preview pool-core-preview" />
              <button
                type="button"
                className="preview-delete-btn"
                aria-label={`${t('Delete')} ${label} ${i + 1}`}
                title={t('Delete')}
                onClick={() => clearSlot(i)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M4 7h16" />
                  <path d="M9 7V5h6v2" />
                  <path d="M7 7l1 13h8l1-13" />
                  <path d="M10 11v6M14 11v6" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
      {filledCount > 0 ? (
        <p className="file-name">
          {filledCount}{' '}
          {filledCount === 1 ? t('certificate attached') : t('certificates attached')}
        </p>
      ) : null}

      {open ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby={modalTitleId}
          onClick={() => closeModal(true)}
        >
          <div
            className="modal-panel pool-core-image-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id={modalTitleId}>{label}</h2>
            <p className="modal-intro">
              {t('Upload one or more certificate photos (up to 3). Each image must be max 200 KB — larger photos are compressed automatically.')}
              {hint ? ` ${hint}` : ''}
            </p>
            <div className="modal-scroll">
              <div className="photo-actions">
                <button
                  type="button"
                  className="photo-btn"
                  disabled={compressing || draftFiles.length >= MAX_CERTIFICATE_COUNT}
                  onClick={() => cameraRef.current?.click()}
                >
                  <CameraActionIcon />
                  {resolvedTake}
                </button>
                <button
                  type="button"
                  className="photo-btn"
                  disabled={compressing || draftFiles.length >= MAX_CERTIFICATE_COUNT}
                  onClick={() => fileRef.current?.click()}
                >
                  <UploadActionIcon />
                  {resolvedUpload}
                </button>
              </div>
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => void addFiles(e.target.files)}
              />
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => void addFiles(e.target.files)}
              />
              {compressing ? <p className="hint">{t('Compressing image…')}</p> : null}
              {draftFiles.length > 0 ? (
                <div className="multi-certificate-drafts">
                  {draftFiles.map((file, i) => (
                    <div className="multi-certificate-draft" key={`${file.name}-${i}`}>
                      {draftPreviews[i] ? (
                        <img
                          src={draftPreviews[i]!}
                          alt={`${t('Certificate')} ${i + 1}`}
                          className="preview pool-core-preview"
                        />
                      ) : null}
                      <p className="file-name">
                        {file.name} ({Math.ceil(file.size / 1024)} KB)
                      </p>
                      <button type="button" className="linkish" onClick={() => removeDraft(i)}>
                        {t('Remove')}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="hint">{t('No certificates selected yet.')}</p>
              )}
            </div>
            <div className="modal-footer accounts-delete-modal-footer">
              <button type="button" className="ghost-btn" onClick={() => closeModal(true)}>
                {t('Cancel')}
              </button>
              <button
                type="button"
                className="submit"
                disabled={draftFiles.length === 0 || compressing}
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
