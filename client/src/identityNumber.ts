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
