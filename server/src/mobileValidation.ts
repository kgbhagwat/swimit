/** Indian mobile: exactly 10 digits, starting with 6–9. */

export const MOBILE_INVALID_MSG = 'Enter a valid 10-digit mobile number';

export function sanitizeMobile(value: unknown) {
  return String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, 10);
}

export function isValidMobile(value: unknown) {
  return /^[6-9]\d{9}$/.test(sanitizeMobile(value));
}
