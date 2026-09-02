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
    // Do not treat "Paid in 1.9 Seconds" as a rupee amount.
    /(?:(?:amount|payment|total|amt)\b|paid(?!\s*in))\s*[:=]?\s*(?:₹|rs\.?|¥|\$)?\s*([0-9]+(?:\.[0-9]{1,2})?)/gi,
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

export function amountsMatch(expected: number, found: number[], tolerance = 0.05) {
  const target = Math.round(Number(expected) * 100) / 100;
  if (!Number.isFinite(target) || target <= 0 || !found.length) return false;
  const primary = found[0];
  if (Math.abs(primary - target) <= tolerance) return true;
  const rupeeOneOcr = target === 1 && (primary === 3 || primary === 21 || primary === 71);
  // Largest/transferred amount is the payment. Do not let leftover OCR (₹1, 1.9s) match a cheaper pass.
  if (!rupeeOneOcr && primary >= 10 && Math.abs(primary - target) > 1) return false;
  if (found.some((a) => Math.abs(a - target) <= tolerance)) return true;
  if (target === 1 && found.some((a) => a === 3 || a === 21 || a === 71)) return true;
  return false;
}

const MONTH_NAME_TO_NUMBER: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function toIsoDateParts(year: number, month: number, day: number): string | null {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const y = year < 100 ? year + 2000 : year;
  if (y < 2000 || y > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const probe = new Date(Date.UTC(y, month - 1, day));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Extract likely payment dates (YYYY-MM-DD) from caption or OCR, newest first. */
export function extractPaymentDates(text: string): string[] {
  const raw = latinDigits(String(text ?? ''));
  const found = new Set<string>();

  const add = (iso: string | null) => {
    if (iso) found.add(iso);
  };

  let match: RegExpExecArray | null;
  const dmy = /\b([0-3]?\d)[/.-]([0-1]?\d)[/.-]((?:20)?\d{2})\b/g;
  while ((match = dmy.exec(raw)) != null) {
    add(toIsoDateParts(Number(match[3]), Number(match[2]), Number(match[1])));
  }

  const iso = /\b(20\d{2})-([0-1]\d)-([0-3]\d)\b/g;
  while ((match = iso.exec(raw)) != null) {
    add(toIsoDateParts(Number(match[1]), Number(match[2]), Number(match[3])));
  }

  const named = /\b([0-3]?\d)\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[a-z]*[,\s]+((?:20)?\d{2,4})\b/gi;
  while ((match = named.exec(raw)) != null) {
    const month = MONTH_NAME_TO_NUMBER[String(match[2]).slice(0, 3).toLowerCase()];
    add(toIsoDateParts(Number(match[3]), month ?? 0, Number(match[1])));
  }

  const ymdNamed =
    /\b((?:20)?\d{2,4})[,\s]+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[a-z]*[,\s]+([0-3]?\d)\b/gi;
  while ((match = ymdNamed.exec(raw)) != null) {
    const month = MONTH_NAME_TO_NUMBER[String(match[2]).slice(0, 3).toLowerCase()];
    add(toIsoDateParts(Number(match[1]), month ?? 0, Number(match[3])));
  }

  return [...found].sort((a, b) => b.localeCompare(a));
}

/** Best-effort payment date from screenshot text. Prefer dates near "paid"/"completed" labels. */
export function pickPaymentDateFromText(text: string): string | null {
  const normalized = latinDigits(String(text ?? ''));
  const labeled = [
    /(?:paid|payment|completed|successful|transferred|date)\b[^\n]{0,40}?([0-3]?\d[/.-][0-1]?\d[/.-](?:20)?\d{2})/i,
    /(?:paid|payment|completed|successful|transferred|date)\b[^\n]{0,40}?([0-3]?\d\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[,\s]+(?:20)?\d{2,4})/i,
  ];
  for (const re of labeled) {
    const hit = re.exec(normalized);
    if (hit?.[1]) {
      const picked = extractPaymentDates(hit[1])[0];
      if (picked) return picked;
    }
  }
  return extractPaymentDates(text)[0] ?? null;
}

/**
 * Full-payment screenshot date rule:
 * - payment date must be on or before the day the screenshot was received
 * - payment date must be the same day as screenshot received, OR on/after pass selections were saved
 */
export function paymentDateValidForFullScreenshot(params: {
  paymentDate: string;
  screenshotReceivedDate: string;
  intentSavedDate: string | null;
}) {
  const paymentDate = String(params.paymentDate ?? '').slice(0, 10);
  const received = String(params.screenshotReceivedDate ?? '').slice(0, 10);
  const saved = params.intentSavedDate ? String(params.intentSavedDate).slice(0, 10) : null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate) || !/^\d{4}-\d{2}-\d{2}$/.test(received)) {
    return { ok: false as const, reason: 'invalid_date' as const };
  }
  if (paymentDate > received) {
    return { ok: false as const, reason: 'after_received' as const };
  }
  if (paymentDate === received) {
    return { ok: true as const };
  }
  if (saved && paymentDate >= saved) {
    return { ok: true as const };
  }
  if (saved && paymentDate < saved) {
    return { ok: false as const, reason: 'before_saved' as const };
  }
  return { ok: false as const, reason: 'not_same_day' as const };
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

export function normalizeUpiId(value: string) {
  return latinDigits(String(value ?? ''))
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/\.+$/, '');
}

export function extractUpiIds(text: string): string[] {
  const hay = latinDigits(String(text ?? '')).toLowerCase().replace(/\s*@\s*/g, '@');
  const found = new Set<string>();
  const re = /[a-z0-9][a-z0-9._-]{1,254}@[a-z][a-z0-9.-]{1,63}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(hay)) != null) {
    found.add(normalizeUpiId(match[0]));
  }
  return [...found];
}

function upiIdsEqual(a: string, b: string) {
  const left = normalizeUpiId(a);
  const right = normalizeUpiId(b);
  if (!left || !right) return false;
  return left === right;
}

/** True if configured payee VPA appears as a UPI ID in the screenshot/caption. Empty config never matches. */
export function upiIdPresentInText(configuredUpi: string, text: string) {
  const want = normalizeUpiId(configuredUpi);
  if (!want.includes('@')) return false;
  return extractUpiIds(text).some((id) => upiIdsEqual(id, want));
}

/** True when the screenshot was paid to platform UPI, not the pool UPI. */
export function paymentIsToPlatformUpi(text: string, platformUpi: string, poolUpi: string) {
  const platformOk = upiIdPresentInText(platformUpi, text);
  if (!platformOk) return false;
  if (!upiIdPresentInText(poolUpi, text)) return true;
  const labeled = /(?:to|payee|paid to)\s*[:\-]?\s*([a-z0-9._-]+@[a-z0-9.-]+)/i.exec(
    latinDigits(String(text ?? '')).toLowerCase().replace(/\s*@\s*/g, '@'),
  );
  if (labeled?.[1] && upiIdsEqual(labeled[1], platformUpi) && !upiIdsEqual(labeled[1], poolUpi)) {
    return true;
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
