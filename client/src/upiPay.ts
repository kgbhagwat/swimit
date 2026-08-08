/** UPI intent URI with amount pre-filled (opens app chooser on mobile). */
export function buildUpiPayUri(upiId: string, amount: number, note = '', payeeName = 'SwimIT') {
  const pa = String(upiId ?? '').trim();
  if (!pa || !(Number(amount) > 0)) return '';
  const q = new URLSearchParams();
  q.set('pa', pa);
  q.set('pn', String(payeeName).trim() || 'SwimIT');
  q.set('am', (Math.round(Number(amount) * 100) / 100).toFixed(2));
  q.set('cu', 'INR');
  const tn = String(note ?? '').trim().slice(0, 80);
  if (tn) q.set('tn', tn);
  return `upi://pay?${q.toString()}`;
}

export function extractUpiPayUri(text: string) {
  const match = String(text ?? '').match(/upi:\/\/pay\?[^\s]+/i);
  return match ? match[0] : '';
}
