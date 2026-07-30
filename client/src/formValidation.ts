export function isValidMobile(value: string) {
  return /^\d{10}$/.test(value.trim());
}

export function normalizeMobile(value: string) {
  return value.replace(/\D/g, '').slice(-10);
}

export function sameMobile(a: string, b: string) {
  const left = normalizeMobile(a);
  const right = normalizeMobile(b);
  return left.length === 10 && right.length === 10 && left === right;
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
