import { useRef, useState } from 'react';
import { CameraActionIcon, UploadActionIcon } from './PhotoActionIcons';
import type { OcrLanguageMode } from './termsOcr';

type Props = {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
  /** When false, hide scan/upload toolbar and make the textarea read-only. */
  editable?: boolean;
};

function countPages(text: string) {
  const matches = text.match(/---\s*Page\s+\d+\s*---/gi);
  if (matches?.length) return matches.length;
  return text.trim() ? 1 : 0;
}

function joinPages(existing: string, pages: string[]) {
  let next = existing.trim();
  let pageNo = countPages(next);
  for (const pageText of pages) {
    const text = pageText.trim();
    if (!text) continue;
    pageNo += 1;
    const block = pageNo === 1 && !next ? text : `--- Page ${pageNo} ---\n\n${text}`;
    next = next ? `${next}\n\n${block}` : block;
  }
  return next;
}

function isImageFile(file: File) {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|tif{1,2})$/i.test(name);
}

function isTextFile(file: File) {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return type.startsWith('text/') || /\.(txt|md|csv)$/i.test(name);
}

function isPdfFile(file: File) {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return type === 'application/pdf' || name.endsWith('.pdf');
}

async function extractPagesFromFiles(
  files: File[],
  mode: OcrLanguageMode,
  onProgress: (message: string) => void,
): Promise<string[]> {
  // Lazy-load OCR/PDF stack only when the user scans or uploads a document.
  const { createTunedOcrWorker, extractTextFromPdfFile, recognizeImageFile } = await import(
    './termsOcr'
  );

  const texts: string[] = [];
  const imageFiles: File[] = [];
  const textFiles: File[] = [];
  const pdfFiles: File[] = [];

  for (const file of files) {
    if (isImageFile(file)) imageFiles.push(file);
    else if (isTextFile(file)) textFiles.push(file);
    else if (isPdfFile(file)) pdfFiles.push(file);
    else {
      throw new Error(
        `Unsupported file: ${file.name}. Use images, .txt, or .pdf`,
      );
    }
  }

  for (const file of textFiles) {
    onProgress(`Reading ${file.name}…`);
    const text = (await file.text()).trim();
    if (text) texts.push(text);
  }

  for (const file of pdfFiles) {
    onProgress(`Opening PDF ${file.name}…`);
    const pages = await extractTextFromPdfFile(file, mode, onProgress);
    texts.push(...pages);
  }

  if (imageFiles.length > 0) {
    const worker = await createTunedOcrWorker(mode);
    try {
      for (let i = 0; i < imageFiles.length; i += 1) {
        const file = imageFiles[i];
        onProgress(
          imageFiles.length > 1
            ? `Scanning image ${i + 1} of ${imageFiles.length}…`
            : `Scanning ${file.name}…`,
        );
        const text = await recognizeImageFile(worker, file);
        if (text) texts.push(text);
      }
    } finally {
      await worker.terminate();
    }
  }

  return texts;
}

export function TermsDocumentField({
  label,
  value,
  onChange,
  placeholder,
  rows = 10,
  editable = true,
}: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const [langMode, setLangMode] = useState<OcrLanguageMode>('marathi');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function handleFiles(fileList: FileList | null) {
    const files = fileList ? Array.from(fileList) : [];
    if (files.length === 0) return;

    setBusy(true);
    setError('');
    const langLabel =
      langMode === 'marathi' ? 'Marathi' : langMode === 'english' ? 'English' : 'Marathi + English';
    setStatus(`Reading file(s) (${langLabel})…`);

    try {
      const pages = await extractPagesFromFiles(files, langMode, setStatus);
      if (pages.length === 0) {
        throw new Error(
          'No text found. Try a clearer photo/PDF, a .txt file, or switch OCR language mode.',
        );
      }
      const beforePages = countPages(valueRef.current);
      const next = joinPages(valueRef.current, pages);
      onChange(next);
      const added = countPages(next) - beforePages;
      setStatus(
        added > 1
          ? `Added ${added} pages/sections. Upload more anytime — they append below.`
          : `Added page ${countPages(next)}. Upload more anytime — they append below.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read document');
      setStatus('');
    } finally {
      setBusy(false);
      if (cameraRef.current) cameraRef.current.value = '';
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="field terms-document-field">
      <span className="label">{label}</span>
      {editable ? (
        <p className="hint">Scan or upload text (.txt), PDF, or image — one or more files.</p>
      ) : null}
      {editable ? (
        <div className="terms-toolbar">
          <label className="terms-ocr-lang">
            <span className="label">Language of Document</span>
            <select
              value={langMode}
              disabled={busy}
              onChange={(e) => setLangMode(e.target.value as OcrLanguageMode)}
            >
              <option value="marathi">Marathi</option>
              <option value="mixed">Marathi+English</option>
              <option value="english">English</option>
            </select>
          </label>
          <div className="terms-toolbar-actions">
            <button
              type="button"
              className="photo-btn terms-toolbar-btn"
              disabled={busy}
              onClick={() => cameraRef.current?.click()}
            >
              <CameraActionIcon />
              {value.trim() ? 'Scan next page' : 'Scan photo'}
            </button>
            <button
              type="button"
              className="photo-btn terms-toolbar-btn"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <UploadActionIcon />
              Upload page(s)
            </button>
            <button
              type="button"
              className="photo-btn terms-toolbar-btn"
              disabled={busy || !value.trim()}
              onClick={() => {
                if (confirm('Clear all terms text?')) {
                  onChange('');
                  setStatus('');
                  setError('');
                }
              }}
            >
              Clear text
            </button>
          </div>
        </div>
      ) : null}
      {editable ? (
        <>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => void handleFiles(e.target.files)}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.txt,.md,text/plain,application/pdf,.pdf"
            multiple
            hidden
            onChange={(e) => void handleFiles(e.target.files)}
          />
        </>
      ) : null}
      {editable && busy ? <p className="hint">{status || 'Working…'}</p> : null}
      {editable && !busy && status ? <p className="success">{status}</p> : null}
      {editable && error ? <p className="field-error">{error}</p> : null}
      {editable ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="terms-textarea"
          disabled={busy}
        />
      ) : (
        <div className="pool-core-view-text">
          {value.trim() ? value : '—'}
        </div>
      )}
    </div>
  );
}
