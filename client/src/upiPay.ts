/**
 * UPI apps reject application/x-www-form-urlencoded query strings
 * (URLSearchParams / Chrome <a href> turns @ into %40 and spaces into +).
 * GPay then shows "This request type is not supported".
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

function sanitizePayeeName(name: string) {
  return String(name ?? '')
    .replace(/\+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function upiQuery(fields: Array<[string, string]>) {
  return fields
    .filter(([, value]) => value !== '')
    .map(([key, value]) => {
      const encoded = encodeURIComponent(value);
      return `${key}=${key === 'pa' ? encoded.replace(/%40/g, '@') : encoded}`;
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
