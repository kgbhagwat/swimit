import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { createWorker, PSM } from 'tesseract.js';

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
    /(?:₹|rs\.?|inr|¥|\$)\s*([0-9]+(?:\.[0-9]{1,2})?)/gi,
    /(?:amount|paid|payment|total|amt)\s*[:=]?\s*(?:₹|rs\.?|¥|\$)?\s*([0-9]+(?:\.[0-9]{1,2})?)/gi,
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
    /(?:utr|upi\s*ref(?:erence)?|ref(?:erence)?(?:\s*(?:no|num|number|#))?|txn(?:\s*id)?|transaction\s*(?:id|1d|ref)|payment\s*id)\s*[:\-#]?\s*([A-Za-z0-9]{8,32})/i,
  ];
  for (const re of labeled) {
    const match = re.exec(normalized);
    if (match?.[1]) return match[1].toUpperCase();
  }
  const twelve = normalized.match(/\b(\d{12})\b/);
  if (twelve?.[1]) return twelve[1];
  return null;
}

function levenshtein(a: string, b: string) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function maxUpiEdits(value: string) {
  return Math.max(2, Math.floor(value.length * 0.35));
}

/** True if configured UPI appears in screenshot/caption text (or no UPI configured). */
export function upiIdPresentInText(configuredUpi: string, text: string) {
  const upi = String(configuredUpi ?? '').trim().toLowerCase();
  if (!upi) return true;
  const hay = latinDigits(String(text ?? '')).toLowerCase().replace(/\s+/g, '');
  const needle = upi.replace(/\s+/g, '');
  if (hay.includes(needle)) return true;
  const local = needle.split('@')[0] ?? '';
  const handle = needle.split('@')[1] ?? '';
  if (local.length >= 3 && hay.includes(local)) return true;
  if (handle.length >= 3 && hay.includes(handle) && local.length >= 6) {
    const alpha = local.replace(/[^a-z]/g, '');
    if (alpha.length >= 6 && hay.includes(alpha.slice(0, 6))) return true;
  }

  const tokens = hay.match(/[a-z0-9]{8,32}/g) ?? [];
  if (local.length >= 8) {
    const alpha = local.replace(/[^a-z]/g, '');
    for (const token of tokens) {
      if (levenshtein(local, token) <= maxUpiEdits(local)) return true;
      const tokenAlpha = token.replace(/[0-9]/g, '');
      if (alpha.length >= 8 && tokenAlpha.length >= 8 && levenshtein(alpha, tokenAlpha) <= maxUpiEdits(alpha)) {
        return true;
      }
    }
  }

  // Dark BHIM/GPay receipts often OCR the banking name but garble the VPA.
  const alpha = local.replace(/[^a-z]/g, '');
  if (alpha.length >= 10) {
    const prefix = alpha.slice(0, 6);
    const suffix = alpha.slice(-6);
    if (hay.includes(prefix) && hay.includes(suffix)) return true;
  }
  return false;
}

/** OCR an image file for payment amount text. Best-effort; returns '' on failure. */
type OcrWorker = Awaited<ReturnType<typeof createWorker>>;

let sharedOcrWorker: OcrWorker | null = null;
let sharedOcrWorkerPromise: Promise<OcrWorker> | null = null;
let ocrQueue: Promise<unknown> = Promise.resolve();

async function getSharedOcrWorker() {
  if (sharedOcrWorker) return sharedOcrWorker;
  if (!sharedOcrWorkerPromise) {
    sharedOcrWorkerPromise = createWorker('eng')
      .then((worker) => {
        sharedOcrWorker = worker;
        return worker;
      })
      .catch((err) => {
        sharedOcrWorkerPromise = null;
        throw err;
      });
  }
  return sharedOcrWorkerPromise;
}

async function preparePaymentOcrImages(absolutePath: string): Promise<Buffer[]> {
  try {
    const meta = await sharp(absolutePath).rotate().metadata();
    const width = meta.width ?? 0;
    const targetWidth = width > 0 && width < 1200 ? 1400 : Math.min(Math.max(width, 800), 1800);
    const buf = await sharp(absolutePath)
      .rotate()
      .resize({ width: targetWidth, kernel: 'lanczos3' })
      .greyscale()
      .normalise()
      .linear(1.35, -28)
      .png()
      .toBuffer();
    return [buf];
  } catch (err) {
    console.warn('[payment-ocr] preprocess skipped', err);
    return [];
  }
}

export async function ocrImageForAmount(absolutePath: string): Promise<string> {
  const run = async () => {
    try {
      const worker = await getSharedOcrWorker();
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
      const first = await worker.recognize(absolutePath);
      const parts = [String(first.data.text ?? '')];
      const prepared = await preparePaymentOcrImages(absolutePath);
      if (prepared.length) {
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
        for (const buf of prepared) {
          const next = await worker.recognize(buf);
          parts.push(String(next.data.text ?? ''));
        }
        await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
      }
      return parts.join('\n');
    } catch (err) {
      console.warn('[payment-ocr] failed', err);
      return '';
    }
  };

  const next = ocrQueue.then(run, run);
  ocrQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
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
