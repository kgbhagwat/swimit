/** Indian mobile: exactly 10 digits, starting with 6–9. */

export const MOBILE_INVALID_MSG = 'Enter a valid 10-digit mobile number';

export function sanitizeMobileInput(value: string) {
  return String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, 10);
}

export function isValidMobile(value: string) {
  return /^[6-9]\d{9}$/.test(String(value ?? '').trim());
}

export function normalizeMobile(value: string) {
  return sanitizeMobileInput(value).slice(-10);
}

export function sameMobile(a: string, b: string) {
  const left = normalizeMobile(a);
  const right = normalizeMobile(b);
  return isValidMobile(left) && isValidMobile(right) && left === right;
}

/** True when emergency number matches the applicant WhatsApp or other mobile. */
export function emergencyMatchesApplicant(params: {
  emergencyMobile: string;
  whatsappMobile: string;
  otherMobile?: string;
}) {
  if (!isValidMobile(params.emergencyMobile)) return false;
  if (sameMobile(params.emergencyMobile, params.whatsappMobile)) return true;
  if (params.otherMobile?.trim() && sameMobile(params.emergencyMobile, params.otherMobile)) {
    return true;
  }
  return false;
}

export function isValidEmail(value: string) {
  const email = value.trim();
  return email.includes('@') && email.includes('.') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function mobileHint(value: string) {
  const v = value.trim();
  if (!v) return '';
  if (!/^\d+$/.test(v)) return MOBILE_INVALID_MSG;
  if (v.length < 10) return 'Enter all 10 digits';
  if (!/^[6-9]/.test(v)) return 'Mobile number must start with 6, 7, 8, or 9';
  if (!isValidMobile(v)) return MOBILE_INVALID_MSG;
  return '';
}

export function emailHint(value: string) {
  const v = value.trim();
  if (!v) return '';
  if (!v.includes('@') || !v.includes('.') || !isValidEmail(v)) {
    return 'Email must include @ and .';
  }
  return '';
}

export const NAME_INVALID_MSG = 'Enter a name using letters only.';

/** Letters (any language), spaces, hyphen, apostrophe, and initials — no digits. */
export function sanitizeNameInput(value: string) {
  return String(value ?? '')
    .replace(/[^\p{L}\s.'’-]/gu, '')
    .slice(0, 80);
}

export function isValidPersonName(value: string) {
  const v = String(value ?? '').trim();
  if (v.length < 2) return false;
  if (/\d/.test(v)) return false;
  const letters = v.match(/\p{L}/gu) ?? [];
  return letters.length >= 2 && /^[\p{L}\s.'’-]+$/u.test(v);
}

export function nameHint(value: string) {
  const v = value.trim();
  if (!v) return '';
  if (!isValidPersonName(v)) return NAME_INVALID_MSG;
  return '';
}
