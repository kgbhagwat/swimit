import type { Worker } from 'tesseract.js';

export type OcrLanguageMode = 'marathi' | 'mixed' | 'english';

/** Pinned CDN assets — keeps WASM / PDF worker out of the Vite production bundle. */
const TESSERACT_JS = '7.0.0';
const TESSERACT_CORE = '7.0.0';
const PDFJS = '4.10.38';

const DEV_DIGITS = '०१२३४५६७८९';

/** Upscale + grayscale + contrast so Devanagari and bullets read more clearly. */
export async function preprocessImageForOcr(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = bitmap.width < 1400 ? 2.2 : bitmap.width < 2000 ? 1.6 : 1.25;
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas not available for OCR preprocess');

    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);

    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      // Mild contrast stretch around mid-gray
      const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.35 + 128));
      // Soft threshold keeps thin Devanagari strokes better than hard B/W
      const out = contrasted > 185 ? 255 : contrasted < 70 ? 0 : contrasted;
      data[i] = out;
      data[i + 1] = out;
      data[i + 2] = out;
    }
    ctx.putImageData(image, 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Failed to encode OCR image'))),
        'image/png',
      );
    });
    return blob;
  } finally {
    bitmap.close();
  }
}

function isMostlyDevanagari(line: string) {
  const dev = (line.match(/[\u0900-\u097F]/g) ?? []).length;
  const lat = (line.match(/[A-Za-z]/g) ?? []).length;
  return dev >= 2 && dev >= lat;
}

/** Prefer Devanagari digits on Marathi lines (OCR often emits Latin 0-9). */
export function restoreMarathiDigits(text: string) {
  return text
    .split('\n')
    .map((line) => {
      if (!isMostlyDevanagari(line)) return line;
      return line.replace(/[0-9]/g, (d) => DEV_DIGITS[Number(d)] ?? d);
    })
    .join('\n');
}

/** Normalize common OCR mistakes for list bullets. */
export function normalizeBulletLines(text: string) {
  return text
    .split('\n')
    .map((line) =>
      line
        // leading bullet-like glyphs / OCR junk
        .replace(/^(\s*)(?:[•●○◦▪▫■□◆◇‣∙·￮ㅇ]|[oO0\*]|[-–—=~])(?=\s*\S)/, '$1•')
        .replace(/^(\s*)•\s*/, '$1• '),
    )
    .join('\n');
}

export function cleanupOcrText(text: string) {
  return normalizeBulletLines(restoreMarathiDigits(text))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function langsForMode(mode: OcrLanguageMode): string[] {
  if (mode === 'english') return ['eng'];
  if (mode === 'marathi') return ['mar'];
  // Marathi first reduces English “forced” substitutions on Devanagari text
  return ['mar', 'eng'];
}

export async function createTunedOcrWorker(mode: OcrLanguageMode): Promise<Worker> {
  // JS API from npm (small); WASM + worker script load from CDN at runtime.
  const { createWorker, PSM, OEM } = await import('tesseract.js');
  const worker = await createWorker(langsForMode(mode), OEM.LSTM_ONLY, {
    workerPath: `https://cdn.jsdelivr.net/npm/tesseract.js@${TESSERACT_JS}/dist/worker.min.js`,
    // Directory (not a single .js) so the library picks the right WASM variant.
    corePath: `https://cdn.jsdelivr.net/npm/tesseract.js-core@${TESSERACT_CORE}`,
    langPath: 'https://tessdata.projectnaptha.com/4.0.0',
  });
  await worker.setParameters({
    // Single column of text — better for terms with bullets/numbered lists
    tessedit_pageseg_mode: PSM.SINGLE_COLUMN,
    preserve_interword_spaces: '1',
    user_defined_dpi: '300',
  });
  return worker;
}

export async function recognizeImageFile(worker: Worker, file: File): Promise<string> {
  const prepared = await preprocessImageForOcr(file);
  const result = await worker.recognize(prepared);
  return cleanupOcrText(String(result.data.text ?? ''));
}

async function loadPdfJs() {
  // Main API is code-split by Vite; worker stays on CDN (avoids ~1.4MB minify during Docker build).
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS}/build/pdf.worker.min.mjs`;
  return pdfjs;
}

/** Extract text from a PDF. Text pages use embedded text; scanned pages are OCR’d. */
export async function extractTextFromPdfFile(
  file: File,
  mode: OcrLanguageMode,
  onProgress?: (message: string) => void,
): Promise<string[]> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  let ocrWorker: Worker | null = null;

  try {
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
      onProgress?.(`Reading PDF page ${pageNo} of ${pdf.numPages}…`);
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      const embedded = content.items
        .map((item) => ('str' in item ? String(item.str) : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (embedded.length >= 40) {
        pages.push(cleanupOcrText(embedded.replace(/ (?=[.?!,:;])/g, '')));
        continue;
      }

      // Likely a scanned page — render and OCR
      onProgress?.(`OCR PDF page ${pageNo} of ${pdf.numPages}…`);
      if (!ocrWorker) ocrWorker = await createTunedOcrWorker(mode);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not available for PDF OCR');
      await page.render({ canvasContext: ctx, viewport }).promise;
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Failed to render PDF page'))),
          'image/png',
        );
      });
      const ocrFile = new File([blob], `${file.name}-page-${pageNo}.png`, { type: 'image/png' });
      const text = await recognizeImageFile(ocrWorker, ocrFile);
      if (text) pages.push(text);
    }
  } finally {
    if (ocrWorker) await ocrWorker.terminate();
  }

  return pages;
}
