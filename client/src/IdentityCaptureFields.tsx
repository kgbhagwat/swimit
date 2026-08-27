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
  documentRequired?: boolean;
  numberRequired?: boolean;
  proofRequired?: boolean;
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
  documentRequired = true,
  numberRequired = false,
  proofRequired = true,
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
        <Label required={documentRequired}>{t('Identity document')}</Label>
        <select
          className="field-control-sm registration-identity-doc-select"
          value={document}
          onChange={(e) => onDocumentChange(e.target.value)}
          required={documentRequired}
          aria-invalid={documentInvalid}
        >
          <option value="">{t('Select document type')}</option>
          {IDENTITY_DOCUMENT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.label)}
            </option>
          ))}
        </select>
        {documentInvalid ? (
          <span className="field-error">{t('This field is required.')}</span>
        ) : null}
      </label>
      <label
        className={`field field-beside registration-identity-number${
          numberInvalid || Boolean(numberHint) ? ' field-box-invalid' : ''
        }`}
      >
        <Label required={numberRequired}>{t('Identity number')}</Label>
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
        hint={t('Image or PDF (max 200 KB) — upload or take a photo of your identity proof')}
        required={proofRequired}
        hideLabel
        protectFromCapture
        cameraFacing="environment"
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
