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
