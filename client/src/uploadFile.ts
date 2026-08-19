import { compressImageToLimit } from './compressImage';

export const ACCEPT_IMAGE_OR_PDF = 'image/*,application/pdf,.pdf';
export const PDF_MAX_BYTES = 2 * 1024 * 1024;

export function isPdfName(name: string | null | undefined) {
  return /\.pdf(\.enc)?$/i.test(String(name ?? '').split(/[?#]/)[0].trim());
}

export function isPdfUrl(url: string | null | undefined) {
  return isPdfName(String(url ?? ''));
}

export function isPdfFile(file: { type?: string; name?: string } | null | undefined) {
  if (!file) return false;
  const type = String(file.type ?? '').toLowerCase();
  if (type.includes('pdf')) return true;
  return isPdfName(file.name);
}

export function headerLooksLikePdf(bytes: ArrayBuffer | Uint8Array) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return u8.length >= 4 && u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46;
}

/** Compress photos; keep PDFs as-is (max 2 MB). Reject other types. */
export async function prepareUploadFile(file: File): Promise<File> {
  if (isPdfFile(file)) {
    if (file.size > PDF_MAX_BYTES) {
      throw new Error('PDF must be 2 MB or smaller');
    }
    if (file.type && file.type !== 'application/pdf') {
      return new File([file], file.name, {
        type: 'application/pdf',
        lastModified: file.lastModified,
      });
    }
    return file;
  }
  if (file.type && !file.type.startsWith('image/')) {
    throw new Error('Please upload an image or a PDF');
  }
  return compressImageToLimit(file);
}
