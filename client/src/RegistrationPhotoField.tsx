import { useId, useState } from 'react';
import { compressImageToLimit } from './compressImage';
import { FilePreview } from './FilePreview';
import { useT } from './i18n';
import { shouldMaskIdentityNumber } from './identityNumber';
import { maskIdentityProofImage } from './maskIdentityProofImage';
import { SensitiveSurface, useSensitiveScreen } from './sensitiveScreen';
import { isPdfFile, prepareUploadFile } from './uploadFile';
import { useObjectUrl, useObjectUrls } from './useObjectUrl';
import { PhotoPickerButtons, type CameraFacing } from './WebcamCapture';

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
  /** Block save/print/screenshot affordances while this photo is on screen. */
  protectFromCapture?: boolean;
  /**
   * When set (identity proof uploads), mask this number on the image so only
   * the last 4 characters remain visible before the file is accepted.
   */
  identityNumberToMask?: string;
  /** Rear camera for ID / certificates; front camera for portraits. */
  cameraFacing?: CameraFacing;
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
  protectFromCapture = false,
  identityNumberToMask,
  cameraFacing = 'user',
}: RegistrationPhotoFieldProps) {
  const t = useT();
  const resolvedTake = takeLabel ?? t('Take photo');
  const resolvedUpload = uploadLabel ?? t('Upload');
  const previewClass =
    cameraFacing === 'user' ? 'preview pool-core-preview preview--portrait' : 'preview pool-core-preview';
  const [open, setOpen] = useState(false);
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [masking, setMasking] = useState(false);
  const draftPreview = useObjectUrl(draftFile);
  const display = preview || existingUrl || null;
  const modalTitleId = useId();
  // Modal draft preview also counts as photo-on-screen.
  useSensitiveScreen(protectFromCapture && open);

  function closeModal(discardDraft: boolean) {
    if (discardDraft) setDraftFile(null);
    setCompressing(false);
    setMasking(false);
    setOpen(false);
  }

  async function handleDraftFile(selected: File | null) {
    if (!selected) {
      setDraftFile(null);
      return;
    }
    setCompressing(true);
    try {
      const ready = await prepareUploadFile(selected);
      setDraftFile(ready);
    } catch (err) {
      alert(err instanceof Error ? t(err.message) : t('Unable to process image'));
      setDraftFile(null);
    } finally {
      setCompressing(false);
    }
  }

  async function confirmDraft() {
    if (!draftFile || masking || compressing) return;
    const idNumber = String(identityNumberToMask ?? '').trim();
    if (shouldMaskIdentityNumber(idNumber) && !isPdfFile(draftFile)) {
      setMasking(true);
      try {
        const masked = await maskIdentityProofImage(draftFile, idNumber);
        const ready = await compressImageToLimit(masked);
        onPick(ready);
        closeModal(true);
      } catch (err) {
        alert(
          err instanceof Error
            ? err.message
            : t('Unable to mask identity number on the proof photo'),
        );
      } finally {
        setMasking(false);
      }
      return;
    }
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
        <SensitiveSurface
          className="photo-field-sensitive"
          label="SwimIT · Confidential"
          enabled={protectFromCapture}
        >
          <div className="preview-wrap preview-wrap--deletable">
            <FilePreview
              src={display}
              file={file}
              alt={label}
              className={previewClass}
              draggable={protectFromCapture ? false : undefined}
            />
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
        </SensitiveSurface>
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
              {t('Take a photo or upload an image or PDF, then confirm with OK.')}
              {hint ? ` ${hint}` : ''}
            </p>
            <div className="modal-scroll">
              <PhotoPickerButtons
                disabled={compressing}
                takeLabel={resolvedTake}
                uploadLabel={resolvedUpload}
                facing={cameraFacing}
                guide={cameraFacing === 'user' ? 'face' : 'document'}
                onPickFile={(file) => void handleDraftFile(file)}
              />
              {compressing ? <p className="hint">{t('Compressing image…')}</p> : null}
              {masking ? (
                <p className="hint">{t('Masking identity number on proof…')}</p>
              ) : null}
              {draftPreview ? (
                <div className="preview-wrap pool-core-image-modal-preview">
                  <FilePreview
                    src={draftPreview}
                    file={draftFile}
                    alt={`${label} ${t('preview')}`}
                    className={previewClass}
                    draggable={protectFromCapture ? false : undefined}
                  />
                </div>
              ) : null}
              {draftFile ? (
                <p className="file-name">
                  {draftFile.name} ({Math.ceil(draftFile.size / 1024)} KB)
                </p>
              ) : null}
              {shouldMaskIdentityNumber(identityNumberToMask) && !isPdfFile(draftFile) ? (
                <p className="hint">
                  {t('On OK, the identity number on this photo is masked — only the last 4 digits stay visible.')}
                </p>
              ) : null}
            </div>
            <div className="modal-footer accounts-delete-modal-footer">
              <button
                type="button"
                className="ghost-btn"
                disabled={masking}
                onClick={() => closeModal(true)}
              >
                {t('Cancel')}
              </button>
              <button
                type="button"
                className="submit"
                disabled={!draftFile || compressing || masking}
                onClick={() => void confirmDraft()}
              >
                {masking ? t('Masking…') : t('OK')}
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
  cameraFacing?: CameraFacing;
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
  cameraFacing = 'environment',
}: MultiCertificateFieldProps) {
  const t = useT();
  const resolvedTake = takeLabel ?? t('Take photo');
  const resolvedUpload = uploadLabel ?? t('Upload');
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
  }

  async function addFiles(selected: FileList | File[] | null) {
    if (!selected || selected.length === 0) return;
    const incoming = Array.from(selected);
    setCompressing(true);
    try {
      const compressed: File[] = [];
      for (const nextFile of incoming) {
        compressed.push(await prepareUploadFile(nextFile));
      }
      setDraftFiles((prev) => [...prev, ...compressed].slice(0, MAX_CERTIFICATE_COUNT));
    } catch (err) {
      alert(err instanceof Error ? t(err.message) : t('Unable to process image'));
    } finally {
      setCompressing(false);
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
              <FilePreview
                src={src}
                file={files[i]}
                alt={`${label} ${i + 1}`}
                className="preview pool-core-preview"
              />
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
              {t('Upload one or more certificate photos or PDFs (up to 3). Images over 200 KB are compressed; PDFs can be up to 2 MB.')}
              {hint ? ` ${hint}` : ''}
            </p>
            <div className="modal-scroll">
              <PhotoPickerButtons
                disabled={compressing || draftFiles.length >= MAX_CERTIFICATE_COUNT}
                takeLabel={resolvedTake}
                uploadLabel={resolvedUpload}
                facing={cameraFacing}
                guide="document"
                onPickFile={(file) => void addFiles([file])}
                onPickFiles={(files) => void addFiles(files)}
                multiple
              />
              {compressing ? <p className="hint">{t('Compressing image…')}</p> : null}
              {draftFiles.length > 0 ? (
                <div className="multi-certificate-drafts">
                  {draftFiles.map((file, i) => (
                    <div className="multi-certificate-draft" key={`${file.name}-${i}`}>
                      {draftPreviews[i] ? (
                        <FilePreview
                          src={draftPreviews[i]}
                          file={file}
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
