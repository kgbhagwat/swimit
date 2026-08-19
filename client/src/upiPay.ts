/**
 * UPI apps reject application/x-www-form-urlencoded query strings
 * (URLSearchParams turns @ into %40 and spaces into +). GPay then shows
 * "This request type is not supported". Keep @ in the VPA and encode spaces as %20.
 */
function normalizeVpa(upiId: string) {
  let pa = String(upiId ?? '').trim();
  try {
    pa = decodeURIComponent(pa);
  } catch {
    // keep the trimmed value
  }
  return pa.replace(/\s+/g, '');
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
  const pn = String(payeeName).trim() || 'SwimIT';
  const am = (Math.round(Number(amount) * 100) / 100).toFixed(2);
  const tn = String(note ?? '').trim().slice(0, 80);
  const fields: Array<[string, string]> = [
    ['pa', pa],
    ['pn', pn],
    ['am', am],
    ['cu', 'INR'],
  ];
  if (tn) fields.push(['tn', tn]);
  return `upi://pay?${upiQuery(fields)}`;
}

export function extractUpiPayUri(text: string) {
  const match = String(text ?? '').match(/upi:\/\/pay\?[^\s]+/i);
  return match ? match[0] : '';
}
