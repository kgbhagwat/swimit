import type { ReactNode } from 'react';
import { mobileHint, sanitizeMobileInput } from './formValidation';

type MobileFieldProps = {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
  className?: string;
  /** Extra invalid state from parent submit checks */
  invalid?: boolean;
};

/** Shared 10-digit Indian mobile input with live validation. */
export function MobileField({
  label,
  value,
  onChange,
  required = false,
  placeholder = '10-digit mobile number',
  autoComplete = 'tel',
  className = 'field',
  invalid = false,
}: MobileFieldProps) {
  const hint = mobileHint(value);
  return (
    <label className={className}>
      <span className="label">
        {label}
        {required ? (
          <>
            {' '}
            <span className="req">*</span>
          </>
        ) : null}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(sanitizeMobileInput(e.target.value))}
        placeholder={placeholder}
        inputMode="numeric"
        autoComplete={autoComplete}
        required={required}
        maxLength={10}
        aria-invalid={invalid || Boolean(hint)}
      />
      {hint ? <span className="field-error">{hint}</span> : null}
    </label>
  );
}
