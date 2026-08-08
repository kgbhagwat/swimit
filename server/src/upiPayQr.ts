import QRCode from 'qrcode';

/** UPI intent URI with amount pre-filled (scan-to-pay, no manual amount entry). */
export function buildUpiPayUri(params: {
  upiId: string;
  amount: number;
  payeeName?: string;
  note?: string;
}) {
  const pa = String(params.upiId ?? '').trim();
  if (!pa) throw new Error('UPI ID is required to create a payment QR');
  const amount = Number(params.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Payment amount must be greater than zero');
  }
  const am = (Math.round(amount * 100) / 100).toFixed(2);
  const q = new URLSearchParams();
  q.set('pa', pa);
  q.set('pn', String(params.payeeName ?? 'SwimIT').trim() || 'SwimIT');
  q.set('am', am);
  q.set('cu', 'INR');
  const note = String(params.note ?? '').trim().slice(0, 80);
  if (note) q.set('tn', note);
  return `upi://pay?${q.toString()}`;
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
