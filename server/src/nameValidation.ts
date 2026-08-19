export const NAME_INVALID_MSG = 'Enter a name using letters only.';

export function isValidPersonName(value: unknown) {
  const v = String(value ?? '').trim();
  if (v.length < 2) return false;
  if (/\d/.test(v)) return false;
  const letters = v.match(/\p{L}/gu) ?? [];
  return letters.length >= 2 && /^[\p{L}\s.'’-]+$/u.test(v);
}
