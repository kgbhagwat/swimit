import { useEffect, useState } from 'react';
import { useT } from './i18n';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

export function todayIsoLocal(now = new Date()) {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** Completed years of age as of today's local date (not year-of-birth subtraction). */
export function ageYearsAsOfToday(isoBirthdate: string, now = new Date()): number | null {
  const birth = String(isoBirthdate ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) return null;
  const today = todayIsoLocal(now);
  if (birth > today) return null;
  const by = Number(birth.slice(0, 4));
  const bm = Number(birth.slice(5, 7));
  const bd = Number(birth.slice(8, 10));
  const ty = Number(today.slice(0, 4));
  const tm = Number(today.slice(5, 7));
  const td = Number(today.slice(8, 10));
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age >= 0 ? age : null;
}

function isoToDisplay(iso: string) {
  const match = String(iso ?? '')
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function isRealDate(year: number, month: number, day: number) {
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day
  );
}

/** Accept DD/MM/YYYY (and close variants) or ISO YYYY-MM-DD. */
export function parseBirthdateInput(raw: string): string {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    return isRealDate(year, month, day) ? `${iso[1]}-${iso[2]}-${iso[3]}` : '';
  }
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 8) return '';
  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));
  if (!isRealDate(year, month, day)) return '';
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function maskBirthdateInput(raw: string) {
  const iso = String(raw ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return isoToDisplay(iso);
  const digits = iso.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

type BirthDateFieldProps = {
  value: string;
  onChange: (isoDate: string) => void;
  required?: boolean;
  invalid?: boolean;
  className?: string;
};

/** Typeable DD/MM/YYYY birth date; stores ISO YYYY-MM-DD. */
export function BirthDateField({
  value,
  onChange,
  required,
  invalid,
  className,
}: BirthDateFieldProps) {
  const t = useT();
  const [text, setText] = useState(() => isoToDisplay(value));
  const age = ageYearsAsOfToday(value);

  useEffect(() => {
    if (!value) {
      setText((prev) => (parseBirthdateInput(prev) ? '' : prev));
      return;
    }
    setText((prev) => (parseBirthdateInput(prev) === value ? prev : isoToDisplay(value)));
  }, [value]);

  return (
    <span className="birthdate-field-control">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="bday"
        className={className}
        value={text}
        placeholder={t('DD/MM/YYYY')}
        maxLength={10}
        required={required}
        aria-invalid={invalid}
        aria-label={t('Birth Date')}
        onChange={(e) => {
          const next = maskBirthdateInput(e.target.value);
          setText(next);
          onChange(parseBirthdateInput(next));
        }}
      />
      {age !== null ? (
        <span className="hint birthdate-age">
          {t('Age')}: {age} {t('years')} ({t('as of today')})
        </span>
      ) : null}
    </span>
  );
}
