/**
 * UPI apps reject application/x-www-form-urlencoded query strings
 * (URLSearchParams / Chrome <a href> turns @ into %40 and spaces into +).
 * GPay then shows "This request type is not supported". Keep @ in the VPA.
 * Never percent-encode the payee name — GPay shows "SPM%20swimming%20pool".
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

function upiQuery(fields: Array<[string, string]>) {
  return fields
    .filter(([, value]) => value !== '')
    .map(([key, value]) => {
      if (key === 'pa') {
        return `${key}=${encodeURIComponent(value).replace(/%40/g, '@')}`;
      }
      if (key === 'pn' || key === 'tn') {
        return `${key}=${value}`;
      }
      return `${key}=${encodeURIComponent(value)}`;
    })
    .join('&');
}

/** UPI intent URI with amount pre-filled (opens app chooser on mobile). */
export function buildUpiPayUri(upiId: string, amount: number, note = '', payeeName = 'SwimIT') {
  const pa = normalizeVpa(upiId);
  if (!pa || !(Number(amount) > 0)) return '';
  const pn = sanitizePayeeName(payeeName) || 'SwimIT';
  const am = (Math.round(Number(amount) * 100) / 100).toFixed(2);
  const tn = sanitizePayeeName(note).slice(0, 80);
  const fields: Array<[string, string]> = [
    ['pa', pa],
    ['pn', pn],
    ['am', am],
    ['cu', 'INR'],
  ];
  if (tn) fields.push(['tn', tn]);
  return `upi://pay?${upiQuery(fields)}`;
}

/** Chrome encodes upi:// hrefs; Android intent:// keeps @ in the VPA. */
export function toAndroidUpiIntent(upiUri: string) {
  const raw = String(upiUri ?? '').trim();
  if (!raw.toLowerCase().startsWith('upi:')) return raw;
  const rest = raw.slice(raw.indexOf(':') + 1); // //pay?...
  const withMode = /[?&]mode=/.test(rest) ? rest : `${rest}&mode=02`;
  return `intent:${withMode}#Intent;scheme=upi;action=android.intent.action.VIEW;end`;
}

export function openUpiPay(upiUri: string) {
  const uri = String(upiUri ?? '').trim();
  if (!uri || typeof window === 'undefined') return;
  const android = /Android/i.test(navigator.userAgent);
  window.location.assign(android ? toAndroidUpiIntent(uri) : uri);
}

export function extractUpiPayUri(text: string) {
  const match = String(text ?? '').match(/upi:\/\/pay\?[^\s]+/i);
  return match ? match[0] : '';
}

export function extractPayLaunchHref(text: string) {
  const https = String(text ?? '').match(/https?:\/\/[^\s]*\/open\/upi-pay\?[^\s]+/i);
  if (https) return https[0];
  return extractUpiPayUri(text);
}

/** WhatsApp does not auto-link localhost / LAN hosts. */
export function isLocalAppHost(url: string) {
  try {
    const host = new URL(url.includes('://') ? url : `http://${url}`).hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '0.0.0.0' ||
      host.endsWith('.local')
    );
  } catch {
    return /localhost|127\.0\.0\.1/i.test(url);
  }
}

export function publicAppUrlForWhatsApp(url?: string | null) {
  const base = String(url ?? '').trim().replace(/\/$/, '');
  if (!base || !/^https?:\/\//i.test(base) || isLocalAppHost(base)) return '';
  try {
    const host = new URL(base).hostname.toLowerCase();
    if (!host.includes('.') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return '';
  } catch {
    return '';
  }
  return base;
}

/** WhatsApp auto-links https domains only — not upi://, localhost, or URLs containing @. */
export function whatsAppTappablePayLink(url?: string | null) {
  const value = String(url ?? '').trim();
  if (!value.startsWith('https://') || value.includes('@')) return '';
  return publicAppUrlForWhatsApp(value) ? value : '';
}

/** https launch page so WhatsApp/Chrome do not encode @ in the VPA. */
export function buildUpiHttpsLaunchUrl(params: {
  publicAppUrl?: string;
  upiId: string;
  amount: number;
  payeeName?: string;
  note?: string;
}) {
  const base = String(params.publicAppUrl ?? '').trim().replace(/\/$/, '');
  const pa = normalizeVpa(params.upiId);
  const amount = Number(params.amount);
  if (!base || !pa || !Number.isFinite(amount) || amount <= 0) return '';
  const q = new URLSearchParams();
  q.set('pa', pa);
  q.set('pn', sanitizePayeeName(params.payeeName ?? 'SwimIT') || 'SwimIT');
  q.set('am', (Math.round(amount * 100) / 100).toFixed(2));
  q.set('cu', 'INR');
  const note = sanitizePayeeName(params.note ?? '').slice(0, 80);
  if (note) q.set('tn', note);
  return `${base}/open/upi-pay?${q.toString()}`;
}

/** Same body WhatsApp would send for a pass payment request. */
export function buildPassPaymentRequestMessage(params: {
  fullName: string;
  passType: string;
  amount: number;
  passValidUntil: string;
  upiId: string;
  poolName?: string;
  publicAppUrl?: string;
  /** WhatsApp-tappable https link. Never pass upi:// or localhost. */
  payLink?: string;
}) {
  const amountLabel = `₹${Number(params.amount).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
  const upiId = String(params.upiId ?? '').trim();
  const hasAmountQr = Boolean(upiId) && Number(params.amount) > 0;
  const payLink = whatsAppTappablePayLink(params.payLink);
  const body = [
    `Hello ${params.fullName},`,
    '',
    'Please complete your SwimIT pass payment.',
    `Pass: ${params.passType}`,
    `Amount: *${amountLabel}*`,
    `Valid until: ${params.passValidUntil}`,
    '',
    hasAmountQr
      ? payLink
        ? 'Scan the payment QR below, or tap the link to open your UPI app.'
        : 'Copy the payment QR and attach it in this chat so they can scan it.'
      : 'Pay using the pool QR code / UPI shown.',
    payLink ? `Pay now:\n\n${payLink}` : '',
    upiId
      ? `After paying, send the screenshot with visible *${upiId}* on WhatsApp.`
      : 'After paying, send the payment screenshot on WhatsApp.',
    upiId ? `UPI ID: *${upiId}*` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return { body, payLink };
}
