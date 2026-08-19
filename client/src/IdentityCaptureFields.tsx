import type { ReactNode } from 'react';
import { identityNumberError } from './identityNumber';
import { useT } from './i18n';
import { RegistrationPhotoField } from './RegistrationPhotoField';

export const IDENTITY_DOCUMENT_OPTIONS = [
  { value: 'Aadhaar', label: 'Aadhaar card' },
  { value: 'PAN', label: 'PAN card' },
  { value: 'Passport', label: 'Passport' },
  { value: 'Driving Licence', label: 'Driving licence' },
  { value: 'School ID', label: 'School / college ID' },
  { value: 'Other', label: 'Other' },
] as const;

function Label({ children, required }: { children: string; required?: boolean }) {
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

type IdentityCaptureFieldsProps = {
  document: string;
  number: string;
  onDocumentChange: (value: string) => void;
  onNumberChange: (value: string) => void;
  documentInvalid?: boolean;
  numberInvalid?: boolean;
  proofFile: File | null;
  proofPreview: string | null;
  proofExistingUrl?: string | null;
  proofInvalid?: boolean;
  onPickProof: (file: File | null) => void;
  onClearProofExisting?: () => void;
  children?: ReactNode;
};

/** Shared identity document / optional number / proof photo used on every registration form. */
export function IdentityCaptureFields({
  document,
  number,
  onDocumentChange,
  onNumberChange,
  documentInvalid,
  numberInvalid,
  proofFile,
  proofPreview,
  proofExistingUrl,
  proofInvalid,
  onPickProof,
  onClearProofExisting,
  children,
}: IdentityCaptureFieldsProps) {
  const t = useT();
  const numberHint = identityNumberError(number);

  return (
    <div className="registration-identity-row">
      <label
        className={`field field-beside registration-identity-doc${
          documentInvalid ? ' field-box-invalid' : ''
        }`}
      >
        <Label required>{t('Identity document')}</Label>
        <select
          className="field-control-sm registration-identity-doc-select"
          value={document}
          onChange={(e) => onDocumentChange(e.target.value)}
          required
          aria-invalid={documentInvalid}
        >
          <option value="">{t('Select document type')}</option>
          {IDENTITY_DOCUMENT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.label)}
            </option>
          ))}
        </select>
      </label>
      <label
        className={`field field-beside registration-identity-number${
          numberInvalid || Boolean(numberHint) ? ' field-box-invalid' : ''
        }`}
      >
        <Label>{t('Identity number')}</Label>
        <input
          className="field-control-sm"
          value={number}
          onChange={(e) => onNumberChange(e.target.value)}
          placeholder={t('Enter document number')}
          autoComplete="off"
          aria-invalid={numberInvalid || Boolean(numberHint)}
        />
        {numberHint ? <span className="field-error">{t(numberHint)}</span> : null}
      </label>
      <RegistrationPhotoField
        label={t('Photo of identity proof')}
        hint={t('Image (max 200 KB) or PDF (max 2 MB) — upload or take a photo of your identity proof')}
        required
        hideLabel
        protectFromCapture
        cameraFacing="environment"
        identityNumberToMask={number}
        file={proofFile}
        preview={proofPreview}
        existingUrl={proofExistingUrl}
        takeLabel={t('Take photo')}
        uploadLabel={t('Upload')}
        invalid={proofInvalid}
        onClearExisting={onClearProofExisting}
        onPick={onPickProof}
      />
      {children}
    </div>
  );
}
