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
  const am = formatUpiAmount(amount);
  if (!pa || !am) return '';
  const pn = sanitizePayeeName(payeeName) || 'SwimIT';
  const tn = sanitizePayeeName(note).slice(0, 80);
  const fields: Array<[string, string]> = [
    ['pa', pa],
    ['pn', pn],
    ['am', am],
    ['cu', 'INR'],
    ['mode', '00'],
  ];
  if (tn) fields.push(['tn', tn]);
  return `upi://pay?${upiQuery(fields)}`;
}

export function isAndroidDevice() {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}

/** WhatsApp / Instagram / Facebook in-app browsers intercept upi:// as WhatsApp Pay. */
export function isInAppBrowser() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /WhatsApp|FBAN|FBAV|Instagram|Line\/|; wv\)/i.test(ua);
}

export function isMobileUpiClient() {
  return typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function upiPayQuery(upiUri: string) {
  const raw = String(upiUri ?? '').trim();
  const q = raw.indexOf('?');
  return q >= 0 ? raw.slice(q + 1) : '';
}

export const UPI_APP_CHOICES = [
  { id: 'gpay', label: 'Google Pay' },
  { id: 'phonepe', label: 'PhonePe' },
  { id: 'paytm', label: 'Paytm' },
  { id: 'bhim', label: 'BHIM' },
] as const;

export type UpiAppId = (typeof UPI_APP_CHOICES)[number]['id'];

const UPI_APP_ANDROID_PACKAGE: Record<UpiAppId, string> = {
  gpay: 'com.google.android.apps.nbu.paisa.user',
  phonepe: 'com.phonepe.app',
  paytm: 'net.one97.paytm',
  bhim: 'in.org.npci.upiapp',
};

/** tez:// is rejected by current GPay as "This request type is not supported". */
function withUpiLaunchParams(query: string) {
  const raw = String(query ?? '').replace(/^[?&]+/, '');
  const parts = [raw];
  if (!/(?:^|&)mode=/.test(raw)) parts.push('mode=00');
  if (!/(?:^|&)tr=/.test(raw)) parts.push(`tr=SW${Date.now().toString(36)}`);
  return parts.filter(Boolean).join('&');
}

export function upiAppLaunchHref(appId: UpiAppId, query: string) {
  const q = withUpiLaunchParams(query);
  if (isAndroidDevice()) {
    return `intent://pay?${q}#Intent;scheme=upi;package=${UPI_APP_ANDROID_PACKAGE[appId]};end`;
  }
  if (appId === 'gpay') return `gpay://upi/pay?${q}`;
  if (appId === 'phonepe') return `phonepe://upi/pay?${q}`;
  if (appId === 'paytm') return `paytmmp://pay?${q}`;
  return `bhim://upi/pay?${q}`;
}

/** Chrome encodes upi:// hrefs; Android intent:// keeps @ in the VPA and shows the app chooser. */
export function toAndroidUpiIntent(upiUri: string) {
  const raw = String(upiUri ?? '').trim();
  if (!raw.toLowerCase().startsWith('upi:')) return raw;
  const rest = raw.slice(raw.indexOf(':') + 1); // //pay?...
  return `intent:${rest}#Intent;scheme=upi;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;launchFlags=0x10000000;end`;
}

/** Open the current https pay page in Chrome so Android can show the system UPI app list. */
export function chromeHttpsIntent(httpsUrl: string) {
  try {
    const u = new URL(httpsUrl);
    u.searchParams.set('chooser', '1');
    const dest = u.toString();
    const path = `${u.host}${u.pathname}${u.search}`;
    return `intent://${path}#Intent;scheme=${u.protocol.replace(':', '')};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(dest)};end`;
  } catch {
    return httpsUrl;
  }
}

export function openUpiPay(upiUri: string) {
  const uri = String(upiUri ?? '').trim();
  if (!uri || typeof window === 'undefined') return;
  const launch = uri.includes('mode=') ? uri : `${uri}${uri.includes('?') ? '&' : '?'}mode=00`;
  if (isAndroidDevice()) {
    window.location.assign(toAndroidUpiIntent(launch));
    return;
  }
  window.location.assign(launch);
}

export function openUpiAppChoice(href: string) {
  const next = String(href ?? '').trim();
  if (!next || typeof window === 'undefined') return;
  window.location.assign(next);
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

export function isPayLaunchValue(value: string) {
  const raw = String(value ?? '').trim();
  if (!raw) return false;
  return /^upi:\/\/pay\?/i.test(raw) || /\/open\/upi-pay(\?|$)/i.test(raw);
}

/** QR payload that opens the same app-picker page as Pay now (https when the host is public). */
export function paymentQrPayload(value: string) {
  const raw = String(value ?? '').trim();
  if (!isPayLaunchValue(raw)) return raw;
  if (/^https:\/\//i.test(raw)) return raw;
  const path = upiUriToLaunchPath(raw);
  if (!path || typeof window === 'undefined') return raw;
  const origin = window.location.origin.replace(/\/$/, '');
  if (!/^https:\/\//i.test(origin) || isLocalAppHost(origin)) return raw;
  return `${origin}${path}`;
}

export function upiUriToLaunchPath(upiUri: string) {
  const raw = String(upiUri ?? '').trim();
  if (!raw) return '';
  if (raw.startsWith('/open/upi-pay')) return raw;
  if (/^https?:\/\//i.test(raw) && /\/open\/upi-pay\?/i.test(raw)) {
    try {
      const u = new URL(raw);
      return `${u.pathname}${u.search}`;
    } catch {
      return raw;
    }
  }
  if (!raw.toLowerCase().startsWith('upi://pay?')) return '';
  const incoming = new URLSearchParams(raw.slice(raw.indexOf('?') + 1));
  const q = new URLSearchParams();
  for (const key of ['pa', 'pn', 'am', 'cu', 'tn']) {
    const value = incoming.get(key);
    if (value) q.set(key, value);
  }
  return q.get('pa') && q.get('am') ? `/open/upi-pay?${q.toString()}` : '';
}

/** Open the https pay page (app picker) instead of handing UPI to WhatsApp. */
export function openPayLaunch(href: string) {
  const raw = String(href ?? '').trim();
  if (!raw || typeof window === 'undefined') return;
  const path = upiUriToLaunchPath(raw);
  if (path) {
    window.location.assign(path);
    return;
  }
  if (/^https?:\/\//i.test(raw)) {
    window.location.assign(raw);
    return;
  }
  openUpiPay(raw);
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
  const am = formatUpiAmount(params.amount);
  if (!base || !pa || !am) return '';
  const q = new URLSearchParams();
  q.set('pa', pa);
  q.set('pn', sanitizePayeeName(params.payeeName ?? 'SwimIT') || 'SwimIT');
  q.set('am', am);
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
