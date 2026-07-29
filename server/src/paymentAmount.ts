import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorker } from 'tesseract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Normalize Devanagari digits to Latin. */
function latinDigits(text: string) {
  const map: Record<string, string> = {
    '०': '0',
    '१': '1',
    '२': '2',
    '३': '3',
    '४': '4',
    '५': '5',
    '६': '6',
    '७': '7',
    '८': '8',
    '९': '9',
  };
  return text.replace(/[०-९]/g, (d) => map[d] ?? d);
}

/**
 * Extract likely payment amounts (INR) from free text / OCR.
 * Returns unique amounts sorted descending (largest first).
 */
export function extractPaymentAmounts(text: string): number[] {
  const normalized = latinDigits(String(text ?? ''))
    .replace(/,/g, '')
    .replace(/\s+/g, ' ');

  const found = new Set<number>();
  const patterns = [
    /(?:₹|rs\.?|inr)\s*([0-9]+(?:\.[0-9]{1,2})?)/gi,
    /(?:amount|paid|payment|total|amt)\s*[:=]?\s*(?:₹|rs\.?)?\s*([0-9]+(?:\.[0-9]{1,2})?)/gi,
    /\b([0-9]{2,7}(?:\.[0-9]{1,2})?)\b/g,
  ];

  for (const re of patterns) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(normalized)) != null) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n > 0 && n < 10_000_000) found.add(Math.round(n * 100) / 100);
    }
  }

  return [...found].sort((a, b) => b - a);
}

export function amountsMatch(expected: number, found: number[], tolerance = 1) {
  const target = Math.round(Number(expected) * 100) / 100;
  return found.some((a) => Math.abs(a - target) <= tolerance);
}

/** Best-effort UPI / UTR / transaction reference from caption or OCR. */
export function extractTransactionId(text: string): string | null {
  const normalized = latinDigits(String(text ?? '')).replace(/\s+/g, ' ');
  const labeled = [
    /(?:utr|upi\s*ref(?:erence)?|ref(?:erence)?(?:\s*(?:no|num|number|#))?|txn(?:\s*id)?|transaction\s*(?:id|ref)|payment\s*id)\s*[:\-#]?\s*([A-Za-z0-9]{8,32})/i,
  ];
  for (const re of labeled) {
    const match = re.exec(normalized);
    if (match?.[1]) return match[1].toUpperCase();
  }
  const twelve = normalized.match(/\b(\d{12})\b/);
  if (twelve?.[1]) return twelve[1];
  return null;
}

/** True if configured UPI appears in screenshot/caption text (or no UPI configured). */
export function upiIdPresentInText(configuredUpi: string, text: string) {
  const upi = String(configuredUpi ?? '').trim().toLowerCase();
  if (!upi) return true;
  const hay = latinDigits(String(text ?? '')).toLowerCase().replace(/\s+/g, '');
  const needle = upi.replace(/\s+/g, '');
  if (hay.includes(needle)) return true;
  // Also accept local part match when OCR drops the bank handle
  const local = needle.split('@')[0];
  return Boolean(local && local.length >= 3 && hay.includes(local));
}

/** OCR an image file for payment amount text. Best-effort; returns '' on failure. */
export async function ocrImageForAmount(absolutePath: string): Promise<string> {
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  try {
    worker = await createWorker('eng');
    const result = await worker.recognize(absolutePath);
    return String(result.data.text ?? '');
  } catch (err) {
    console.warn('[payment-ocr] failed', err);
    return '';
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch {
        /* ignore */
      }
    }
  }
}

export function uploadAbsolutePath(relativeUploadPath: string) {
  const uploadsRoot = path.resolve(__dirname, '../../uploads');
  return path.join(uploadsRoot, relativeUploadPath.replace(/^[/\\]+/, ''));
}

export function computeRenewalAmount(params: {
  price: number;
  billingPeriod: string;
  months: number;
}) {
  const months = Math.max(1, Math.min(36, Math.floor(Number(params.months) || 1)));
  const price = Math.max(0, Number(params.price) || 0);
  const period = String(params.billingPeriod ?? 'Month').toLowerCase();
  const amount =
    period === 'year' ? price * (months / 12) : price * months;
  return Math.round(amount * 100) / 100;
}

export function addMonthsDateOnly(fromIsoDate: string, months: number) {
  const base = new Date(`${fromIsoDate.slice(0, 10)}T12:00:00`);
  base.setMonth(base.getMonth() + Math.max(1, months));
  return base.toISOString().slice(0, 10);
}

export function todayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

/** Renew starts from later of today or current expiry. */
export function renewFromDate(currentExpiresAt: string | null | undefined) {
  const today = todayDateOnly();
  const exp = currentExpiresAt ? String(currentExpiresAt).slice(0, 10) : '';
  if (exp && exp > today) return exp;
  return today;
}
