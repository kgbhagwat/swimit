const MAX_BYTES = 200 * 1024;
const MAX_DIMENSION = 1600;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Unable to read image'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
  });
}

function drawScaled(img: HTMLImageElement, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

function portraitCropRect(width: number, height: number) {
  const target = 3 / 4;
  const ratio = width / Math.max(1, height);
  if (ratio > target) {
    const sw = height * target;
    return { sx: (width - sw) / 2, sy: 0, sw, sh: height };
  }
  const sh = width / target;
  const extra = height - sh;
  return { sx: 0, sy: extra * 0.22, sw: width, sh };
}

/** Crop a camera photo to a 3:4 portrait so the full face stays in frame. */
export async function cropImageToPortraitFace(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  const img = await loadImage(file);
  const ratio = img.width / Math.max(1, img.height);
  if (ratio <= 0.82 && ratio >= 0.68) return file;
  const { sx, sy, sw, sh } = portraitCropRect(img.width, img.height);
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 960;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 720, 960);
  const blob = await canvasToBlob(canvas, 0.92);
  if (!blob) return file;
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
  return new File([blob], `${baseName}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}

/** Crop a camera photo to 4:3 landscape or 3:4 portrait so a document fills the frame. */
export async function cropImageToDocument(
  file: File,
  orientation: 'landscape' | 'portrait',
): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  const img = await loadImage(file);
  const target = orientation === 'portrait' ? 3 / 4 : 4 / 3;
  const ratio = img.width / Math.max(1, img.height);
  if (orientation === 'landscape' && ratio >= 1.2) return file;
  if (orientation === 'portrait' && ratio <= 0.82 && ratio >= 0.68) return file;
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;
  if (ratio > target) {
    sw = img.height * target;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / target;
    sy = (img.height - sh) / 2;
  }
  const canvas = document.createElement('canvas');
  canvas.width = orientation === 'portrait' ? 720 : 1280;
  canvas.height = orientation === 'portrait' ? 960 : 960;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const blob = await canvasToBlob(canvas, 0.92);
  if (!blob) return file;
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
  return new File([blob], `${baseName}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}

/**
 * If the image is over maxBytes, compress/resize it to fit under the limit.
 * Non-image files or already-small images are returned unchanged.
 */
export async function compressImageToLimit(
  file: File,
  maxBytes = MAX_BYTES,
): Promise<File> {
  if (!file.type.startsWith('image/') || file.size <= maxBytes) {
    return file;
  }

  const img = await loadImage(file);
  let maxSide = Math.min(MAX_DIMENSION, Math.max(img.width, img.height));
  let quality = 0.85;
  let best: Blob | null = null;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const canvas = drawScaled(img, maxSide);
    const blob = await canvasToBlob(canvas, quality);
    if (!blob) break;
    best = blob;
    if (blob.size <= maxBytes) break;

    if (quality > 0.45) {
      quality = Math.max(0.4, quality - 0.12);
    } else {
      maxSide = Math.max(640, Math.round(maxSide * 0.82));
      quality = 0.72;
    }
  }

  if (!best || best.size > maxBytes) {
    throw new Error(`Could not compress image under ${Math.round(maxBytes / 1024)} KB`);
  }

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
  return new File([best], `${baseName}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}
