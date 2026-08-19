/** Compact identity number: strip spaces and common separators. */
export function compactIdentityNumber(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/[\s\-_/]/g, '');
}

/** True when a number was entered and is long enough to mask on the proof photo. */
export function shouldMaskIdentityNumber(value: unknown): boolean {
  return compactIdentityNumber(value).length >= 4;
}

export function identityNumberError(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (compactIdentityNumber(raw).length < 4) {
    return 'Identity number must be at least 4 characters';
  }
  return '';
}

/** Mask identity number for ID cards — only last 4 characters visible. */
export function maskIdentityNumber(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const chars = raw.replace(/\s+/g, '');
  if (chars.length <= 4) return chars;
  const last4 = chars.slice(-4);
  if (chars.length >= 12 && /^\d+$/.test(chars)) {
    return `XXXX XXXX ${last4}`;
  }
  const hidden = chars.slice(0, -4).replace(/[A-Za-z0-9]/g, 'X');
  return `${hidden}${last4}`;
}
