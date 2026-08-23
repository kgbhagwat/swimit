import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import sharp, { type Sharp } from 'sharp';
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
function addFoundAmount(found: Set<number>, value: number) {
  if (Number.isFinite(value) && value > 0 && value < 10_000_000) {
    found.add(Math.round(value * 100) / 100);
  }
}

/** Amount sitting just above GPay/PhonePe "Transferred" / "Paid" (checkmark often OCRs as ©). */
function amountBesideTransferred(text: string): number | null {
  const raw = latinDigits(String(text ?? '')).replace(/,/g, '');
  const re =
    /(?:^|\n)\s*(?:₹|rs\.?|inr|re\.?|¥|\$)?\s*([0-9]{1,7}(?:\.[0-9]{1,2})?)\s*(?:[^\n\d]{0,24})(?:transferred|paid|successful|completed|success)\b/gi;
  let last: number | null = null;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) != null) {
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > 0 && n < 10_000_000) last = Math.round(n * 100) / 100;
  }
  return last;
}

export function extractPaymentAmounts(text: string): number[] {
  const raw = latinDigits(String(text ?? '')).replace(/,/g, '');
  const normalized = raw.replace(/\s+/g, ' ');

  const found = new Set<number>();
  const patterns = [
    /(?:₹|rs\.?|inr|rupees?|re\.?|¥|\$)\s*([0-9]+(?:\.[0-9]{1,2})?)/gi,
    /(?:amount|paid|payment|total|amt)\s*[:=]?\s*(?:₹|rs\.?|¥|\$)?\s*([0-9]+(?:\.[0-9]{1,2})?)/gi,
    /\b([0-9]{2,7}(?:\.[0-9]{1,2})?)\b/g,
  ];

  for (const re of patterns) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(normalized)) != null) {
      addFoundAmount(found, Number(match[1]));
    }
  }

  const beside = amountBesideTransferred(raw);
  if (beside != null) addFoundAmount(found, beside);

  // GPay shows ₹1 as a huge glyph on its own line; OCR often drops ₹ and leaves "1" or "3".
  for (const line of raw.split(/\r?\n/)) {
    const lone = line.trim().match(/^(?:₹|rs\.?|inr|rupees?|re\.?|¥|\$)?\s*([0-9]{1,7}(?:\.[0-9]{1,2})?)\s*$/i);
    if (lone) addFoundAmount(found, Number(lone[1]));
  }

  const rest = [...found].filter((n) => n !== beside).sort((a, b) => b - a);
  return beside != null ? [beside, ...rest] : rest;
}

export function amountsMatch(expected: number, found: number[], tolerance = 1) {
  const target = Math.round(Number(expected) * 100) / 100;
  if (found.some((a) => Math.abs(a - target) <= tolerance)) return true;
  if (target > 0 && target < 10) {
    // ₹1 is often read as 3 (rupee+1 glyph) or 21 / 71 (₹ → 2 or 7).
    if (found.some((a) => a < 10 && Math.abs(a - target) <= 2)) return true;
    if (found.some((a) => a === 20 + target || a === 70 + target)) return true;
    if (target === 1 && found.some((a) => a === 3 || a === 7)) return true;
  }
  return false;
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
    const height = meta.height ?? 0;
    const targetWidth = width > 0 && width < 1200 ? 1400 : Math.min(Math.max(width, 800), 1800);
    const enhance = (img: Sharp) =>
      img
        .resize({ width: targetWidth, kernel: 'lanczos3' })
        .greyscale()
        .normalise()
        .linear(1.35, -28)
        .png()
        .toBuffer();
    const buffers = [await enhance(sharp(absolutePath).rotate())];
    if (width > 40 && height > 80) {
      buffers.push(
        await enhance(
          sharp(absolutePath)
            .rotate()
            .extract({
              left: 0,
              top: 0,
              width,
              height: Math.max(40, Math.round(height * 0.4)),
            }),
        ),
      );
      const amountTop = Math.round(height * 0.1);
      const amountHeight = Math.max(40, Math.round(height * 0.28));
      buffers.push(
        await enhance(
          sharp(absolutePath)
            .rotate()
            .extract({
              left: Math.round(width * 0.08),
              top: amountTop,
              width: Math.max(20, Math.round(width * 0.84)),
              height: amountHeight,
            })
            .threshold(160),
        ),
      );
    }
    return buffers;
  } catch (err) {
    console.warn('[payment-ocr] preprocess skipped', err);
    return [];
  }
}

export async function ocrImageForAmount(absolutePath: string): Promise<string> {
  const run = async () => {
    try {
      if (!fs.existsSync(absolutePath)) {
        console.warn('[payment-ocr] image missing', absolutePath);
        return '';
      }
      const worker = await getSharedOcrWorker();
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
      const first = await worker.recognize(absolutePath);
      const parts = [String(first.data.text ?? '')];
      const prepared = await preparePaymentOcrImages(absolutePath);
      if (prepared.length) {
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
        for (let i = 0; i < prepared.length; i++) {
          if (i === prepared.length - 1 && prepared.length > 1) {
            await worker.setParameters({
              tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
              tessedit_char_whitelist: '0123456789.',
            });
          }
          const next = await worker.recognize(prepared[i]);
          parts.push(String(next.data.text ?? ''));
        }
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.AUTO,
          tessedit_char_whitelist: '',
        });
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
  const uploadsRoot = path.resolve(__dirname, '../uploads');
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
