import type { Request } from 'express';
import type { FileFilterCallback } from 'multer';

export const UPLOAD_MAX_BYTES = 2 * 1024 * 1024;

export function isAllowedImageOrPdf(file: { mimetype?: string; originalname?: string }) {
  const mime = String(file.mimetype || '').toLowerCase();
  const name = String(file.originalname || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  if (mime === 'application/pdf' || mime === 'application/x-pdf') return true;
  if (name.endsWith('.pdf')) return true;
  return false;
}

export function imageOrPdfFileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
) {
  if (!isAllowedImageOrPdf(file)) {
    cb(new Error('Only image or PDF files are allowed'));
    return;
  }
  cb(null, true);
}
