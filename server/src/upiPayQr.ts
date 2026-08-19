import QRCode from 'qrcode';
import { randomBytes } from 'node:crypto';

/**
 * UPI apps reject application/x-www-form-urlencoded query strings
 * (URLSearchParams turns @ into %40 and spaces into +). GPay then shows
 * "This request type is not supported". Keep @ in the VPA. Do not percent-encode
 * payee names — GPay displays "SPM%20swimming%20pool" and rejects the request.
 */
function normalizeVpa(upiId: string) {
  let pa = String(upiId ?? '').trim();
  try {
    pa = decodeURIComponent(pa.replace(/\+/g, '%20'));
  } catch {
    pa = pa.replace(/\+/g, '');
  }
  return pa.replace(/\s+/g, '');
}

function decodePercentName(name: string) {
  let value = String(name ?? '').trim();
  for (let i = 0; i < 3; i += 1) {
    if (!/%[0-9A-Fa-f]{2}/.test(value) && !value.includes('+')) break;
    try {
      const next = decodeURIComponent(value.replace(/\+/g, '%20'));
      if (next === value) break;
      value = next;
    } catch {
      break;
    }
  }
  return value.replace(/\+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** GPay-safe payee / note: ASCII, hyphens instead of spaces, never %20. */
function sanitizePayeeName(name: string) {
  const cleaned = decodePercentName(name)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return cleaned || 'SwimIT';
}

/** Whole rupees only — GPay rejects am=10.00 for some collect requests. */
function formatUpiAmount(amount: number) {
  const rupees = Math.round(Number(amount));
  if (!Number.isFinite(rupees) || rupees <= 0) return '';
  return String(rupees);
}

function upiQuery(fields: Array<[string, string]>) {
  return fields
    .filter(([, value]) => value !== '')
    .map(([key, value]) => {
      if (key === 'pa') {
        return `${key}=${encodeURIComponent(value).replace(/%40/g, '@')}`;
      }
      // pn/tn must stay unescaped so Chrome/intent does not turn spaces into %2520.
      if (key === 'pn' || key === 'tn') {
        return `${key}=${value}`;
      }
      return `${key}=${encodeURIComponent(value)}`;
    })
    .join('&');
}

/** UPI intent URI with amount pre-filled (scan-to-pay, no manual amount entry). */
export function buildUpiPayUri(params: {
  upiId: string;
  amount: number;
  payeeName?: string;
  note?: string;
}) {
  const pa = normalizeVpa(params.upiId);
  if (!pa) throw new Error('UPI ID is required to create a payment QR');
  const amount = Number(params.amount);
  const am = formatUpiAmount(amount);
  if (!am) {
    throw new Error('Payment amount must be greater than zero');
  }
  const pn = sanitizePayeeName(params.payeeName ?? 'SwimIT') || 'SwimIT';
  const note = sanitizePayeeName(params.note ?? '').slice(0, 80);
  const fields: Array<[string, string]> = [
    ['pa', pa],
    ['pn', pn],
    ['am', am],
    ['cu', 'INR'],
    ['mode', '00'],
  ];
  if (note) fields.push(['tn', note]);
  return `upi://pay?${upiQuery(fields)}`;
}

/** https link for WhatsApp — landing page opens UPI without Chrome encoding the VPA. */
export function buildUpiHttpsLaunchUrl(params: {
  publicAppUrl?: string;
  upiId: string;
  amount: number;
  payeeName?: string;
  note?: string;
}) {
  const base = String(params.publicAppUrl ?? '').trim().replace(/\/$/, '');
  const pa = normalizeVpa(params.upiId);
  const am = formatUpiAmount(params.amount);
  if (!base || !pa || !am) return '';
  try {
    const parsed = new URL(base);
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '0.0.0.0' ||
      host.endsWith('.local') ||
      !host.includes('.')
    ) {
      return '';
    }
  } catch {
    return '';
  }
  const q = new URLSearchParams();
  q.set('pa', pa);
  q.set('pn', sanitizePayeeName(params.payeeName ?? 'SwimIT') || 'SwimIT');
  q.set('am', am);
  q.set('cu', 'INR');
  const note = sanitizePayeeName(params.note ?? '').slice(0, 80);
  if (note) q.set('tn', note);
  return `${base}/open/upi-pay?${q.toString()}`;
}

export function newPaymentShareToken() {
  return randomBytes(12).toString('base64url');
}

function isPublicDnsHost(host: string) {
  const h = String(host ?? '').toLowerCase();
  if (!h.includes('.') || h === 'localhost' || h.endsWith('.local')) return false;
  if (h === '127.0.0.1' || h === '0.0.0.0' || h === '::1') return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return false;
  if (h.includes(':')) return false;
  return true;
}

function httpsOriginIfPublic(raw?: string | null) {
  const base = String(raw ?? '').trim().replace(/\/$/, '');
  if (!base) return '';
  try {
    const parsed = new URL(base.includes('://') ? base : `https://${base}`);
    if (!isPublicDnsHost(parsed.hostname)) return '';
    return `https://${parsed.host}`;
  } catch {
    return '';
  }
}

/** Origin WhatsApp will auto-link (https + real domain, never localhost / @). */
export function publicHttpsAppUrl(preferred?: string | null) {
  for (const raw of [preferred, process.env.PUBLIC_APP_URL, process.env.CORS_ORIGIN]) {
    const origin = httpsOriginIfPublic(raw);
    if (origin) return origin;
  }
  return '';
}

/** Short https pay page — no @ in the URL, so WhatsApp keeps it tappable. */
export function whatsAppPayShareUrl(token: string, preferredBase?: string | null) {
  const shareToken = String(token ?? '').trim();
  if (!shareToken) return '';
  const fromRequest = httpsOriginIfPublic(preferredBase);
  if (fromRequest) return `${fromRequest}/open/upi-pay?t=${encodeURIComponent(shareToken)}`;
  // Operator is on localhost: a staging PUBLIC_APP_URL would be tappable but 404.
  if (String(preferredBase ?? '').trim()) return '';
  const fromEnv = publicHttpsAppUrl();
  if (!fromEnv) return '';
  return `${fromEnv}/open/upi-pay?t=${encodeURIComponent(shareToken)}`;
}

export async function renderUpiPayQrPng(params: {
  upiId: string;
  amount: number;
  payeeName?: string;
  note?: string;
  /** Encode this instead of upi:// so WhatsApp does not open WhatsApp Pay. */
  qrContent?: string;
}): Promise<Buffer> {
  const uri = String(params.qrContent ?? '').trim() || buildUpiPayUri(params);
  return QRCode.toBuffer(uri, {
    type: 'png',
    width: 640,
    margin: 2,
    errorCorrectionLevel: 'M',
  });
}
