export function isValidMobile(value: string) {
  return /^\d{10}$/.test(value.trim());
}

export function isValidEmail(value: string) {
  const email = value.trim();
  return email.includes('@') && email.includes('.') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function mobileHint(value: string) {
  const v = value.trim();
  if (!v) return '';
  if (!/^\d+$/.test(v) || v.length !== 10) return 'Enter a valid 10-digit mobile number';
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
