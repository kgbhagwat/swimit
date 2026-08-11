import { maskIdentityNumber } from './identityNumber';

type Box = { x0: number; y0: number; x1: number; y1: number };

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Unable to read identity proof image'));
    };
    img.src = url;
  });
}

function normalizeIdToken(value: string) {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[\s\-_/]/g, '');
}

function canvasToJpegFile(canvas: HTMLCanvasElement, baseName: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to encode masked identity proof'));
          return;
        }
        resolve(
          new File([blob], `${baseName || 'identity-proof'}-masked.jpg`, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          }),
        );
      },
      'image/jpeg',
      0.92,
    );
  });
}

function expandBox(box: Box, pad: number, width: number, height: number): Box {
  return {
    x0: Math.max(0, Math.floor(box.x0 - pad)),
    y0: Math.max(0, Math.floor(box.y0 - pad)),
    x1: Math.min(width, Math.ceil(box.x1 + pad)),
    y1: Math.min(height, Math.ceil(box.y1 + pad)),
  };
}

function unionBoxes(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  return {
    x0: Math.min(...boxes.map((b) => b.x0)),
    y0: Math.min(...boxes.map((b) => b.y0)),
    x1: Math.max(...boxes.map((b) => b.x1)),
    y1: Math.max(...boxes.map((b) => b.y1)),
  };
}

function sameLine(a: Box, b: Box) {
  const aMid = (a.y0 + a.y1) / 2;
  const bMid = (b.y0 + b.y1) / 2;
  const tol = Math.max(8, ((a.y1 - a.y0) + (b.y1 - b.y0)) / 3);
  return Math.abs(aMid - bMid) <= tol;
}

type OcrWord = { text: string; bbox: Box };

function collectMatchBoxes(words: OcrWord[], identityNumber: string): Box[] {
  const target = normalizeIdToken(identityNumber);
  if (target.length < 4) return [];

  const usable = words
    .map((w) => ({
      text: normalizeIdToken(w.text),
      bbox: w.bbox,
    }))
    .filter((w) => w.text.length > 0)
    .sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);

  const hits: Box[] = [];

  // Single-word hits (full or partial chunks of the id).
  for (const word of usable) {
    if (word.text.length < 3) continue;
    if (target.includes(word.text) || word.text.includes(target)) {
      hits.push(word.bbox);
    }
  }

  // Adjacent same-line words that concatenate to the id / a 12-digit Aadhaar.
  for (let i = 0; i < usable.length; i += 1) {
    let combined = '';
    const group: Box[] = [];
    for (let j = i; j < usable.length; j += 1) {
      const word = usable[j];
      if (group.length && !sameLine(group[group.length - 1], word.bbox)) break;
      if (group.length) {
        const prev = group[group.length - 1];
        if (word.bbox.x0 - prev.x1 > Math.max(40, (prev.x1 - prev.x0) * 1.2)) break;
      }
      combined += word.text;
      group.push(word.bbox);
      if (combined === target || (combined.length === 12 && /^\d{12}$/.test(combined) && target === combined)) {
        hits.push(...group);
        break;
      }
      if (combined.length > target.length + 4) break;
    }
  }

  // Generic Aadhaar-like 12-digit runs even if typed number differs slightly.
  if (/^\d{12}$/.test(target)) {
    for (let i = 0; i < usable.length; i += 1) {
      let combined = '';
      const group: Box[] = [];
      for (let j = i; j < usable.length; j += 1) {
        const word = usable[j];
        if (!/^\d+$/.test(word.text)) break;
        if (group.length && !sameLine(group[group.length - 1], word.bbox)) break;
        combined += word.text;
        group.push(word.bbox);
        if (combined.length === 12) {
          hits.push(...group);
          break;
        }
        if (combined.length > 12) break;
      }
    }
  }

  return hits;
}

function paintMaskedRegion(
  ctx: CanvasRenderingContext2D,
  box: Box,
  maskedLabel: string,
) {
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  ctx.fillStyle = '#eceff3';
  ctx.fillRect(box.x0, box.y0, width, height);
  ctx.strokeStyle = '#c5ceda';
  ctx.lineWidth = 1;
  ctx.strokeRect(box.x0 + 0.5, box.y0 + 0.5, width - 1, height - 1);

  const fontSize = Math.max(12, Math.min(28, Math.floor(height * 0.62)));
  ctx.fillStyle = '#1a2433';
  ctx.font = `700 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const textY = box.y0 + height / 2;
  const textX = box.x0 + Math.max(4, Math.floor(width * 0.04));
  ctx.fillText(maskedLabel, textX, textY, Math.max(8, width - 8));
}

/**
 * Mask identity number digits on an uploaded identity-proof photo.
 * Uses OCR to locate the number, covers it, and redraws a masked value
 * with only the last 4 characters visible.
 */
export async function maskIdentityProofImage(
  file: File,
  identityNumber: string,
): Promise<File> {
  const target = normalizeIdToken(identityNumber);
  if (target.length < 4) return file;

  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0);

  const { createWorker, PSM, OEM } = await import('tesseract.js');
  const worker = await createWorker('eng', OEM.LSTM_ONLY, {
    workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js',
    corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0',
    langPath: 'https://tessdata.projectnaptha.com/4.0.0',
  });

  let words: OcrWord[] = [];
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: '1',
    });
    const result = await worker.recognize(canvas, {}, { text: true, blocks: true });
    const blocks = result.data.blocks ?? [];
    for (const block of blocks) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const line of paragraph.lines ?? []) {
          for (const word of line.words ?? []) {
            const text = String(word.text ?? '').trim();
            if (!text || !word.bbox) continue;
            words.push({
              text,
              bbox: {
                x0: Number(word.bbox.x0),
                y0: Number(word.bbox.y0),
                x1: Number(word.bbox.x1),
                y1: Number(word.bbox.y1),
              },
            });
          }
        }
      }
    }
  } finally {
    await worker.terminate().catch(() => undefined);
  }

  const matchBoxes = collectMatchBoxes(words, target);
  const maskedLabel = maskIdentityNumber(identityNumber);
  if (matchBoxes.length === 0) {
    // Fallback strip so the proof never shows a full typed number unmasked in-app.
    const stripH = Math.max(28, Math.round(canvas.height * 0.06));
    paintMaskedRegion(
      ctx,
      {
        x0: Math.round(canvas.width * 0.08),
        y0: canvas.height - stripH - 12,
        x1: Math.round(canvas.width * 0.92),
        y1: canvas.height - 12,
      },
      `ID: ${maskedLabel}`,
    );
  } else {
    const merged = unionBoxes(
      matchBoxes.map((b) => expandBox(b, 3, canvas.width, canvas.height)),
    );
    if (merged) {
      paintMaskedRegion(ctx, expandBox(merged, 4, canvas.width, canvas.height), maskedLabel);
    }
  }

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'identity-proof';
  return canvasToJpegFile(canvas, baseName);
}
