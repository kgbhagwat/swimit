import type { Request } from 'express';
import type { FileFilterCallback } from 'multer';
import { randomUUID } from 'node:crypto';

export const UPLOAD_MAX_BYTES = 200 * 1024;

export const IMAGE_OR_PDF_MIME_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'application/pdf': '.pdf',
  'application/x-pdf': '.pdf',
};

export function randomUploadFilename(
  file: { mimetype?: string },
  mimeExtensions: Readonly<Record<string, string>> = IMAGE_OR_PDF_MIME_EXTENSIONS,
) {
  const extension = mimeExtensions[String(file.mimetype ?? '').toLowerCase()];
  if (!extension) throw new Error('Unsupported upload file type');
  return `${randomUUID()}${extension}`;
}

export function isAllowedImageOrPdf(file: { mimetype?: string; originalname?: string }) {
  const mime = String(file.mimetype || '').toLowerCase();
  return Object.hasOwn(IMAGE_OR_PDF_MIME_EXTENSIONS, mime);
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
