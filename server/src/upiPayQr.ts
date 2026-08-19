import QRCode from 'qrcode';

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
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Payment amount must be greater than zero');
  }
  const am = (Math.round(amount * 100) / 100).toFixed(2);
  const pn = String(params.payeeName ?? 'SwimIT').trim() || 'SwimIT';
  const note = String(params.note ?? '').trim().slice(0, 80);
  const fields: Array<[string, string]> = [
    ['pa', pa],
    ['pn', pn],
    ['am', am],
    ['cu', 'INR'],
  ];
  if (note) fields.push(['tn', note]);
  return `upi://pay?${upiQuery(fields)}`;
}

export async function renderUpiPayQrPng(params: {
  upiId: string;
  amount: number;
  payeeName?: string;
  note?: string;
}): Promise<Buffer> {
  const uri = buildUpiPayUri(params);
  return QRCode.toBuffer(uri, {
    type: 'png',
    width: 640,
    margin: 2,
    errorCorrectionLevel: 'M',
  });
}
