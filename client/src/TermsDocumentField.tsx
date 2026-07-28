import { useRef, useState } from 'react';
import {
  createTunedOcrWorker,
  type OcrLanguageMode,
  recognizeImageFile,
} from './termsOcr';

type Props = {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
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

async function extractPagesFromFiles(files: File[], mode: OcrLanguageMode): Promise<string[]> {
  const texts: string[] = [];
  const imageFiles: File[] = [];
  const otherFiles: File[] = [];

  for (const file of files) {
    const name = file.name.toLowerCase();
    const type = file.type.toLowerCase();
    if (
      type.startsWith('image/') ||
      /\.(png|jpe?g|webp|gif|bmp|tif{1,2})$/i.test(name)
    ) {
      imageFiles.push(file);
    } else if (type.startsWith('text/') || /\.(txt|md|csv)$/i.test(name)) {
      otherFiles.push(file);
    } else {
      throw new Error(`Unsupported file: ${file.name}. Use photos/images or .txt`);
    }
  }

  for (const file of otherFiles) {
    const text = (await file.text()).trim();
    if (text) texts.push(text);
  }

  if (imageFiles.length > 0) {
    const worker = await createTunedOcrWorker(mode);
    try {
      for (const file of imageFiles) {
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
    setStatus(
      files.length > 1
        ? `Scanning ${files.length} pages (${langLabel}, enhanced)…`
        : files[0].type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(files[0].name)
          ? `Scanning page (${langLabel}, enhanced)…`
          : 'Reading file…',
    );

    try {
      const pages = await extractPagesFromFiles(files, langMode);
      if (pages.length === 0) {
        throw new Error('No text found. Try a clearer photo or switch OCR language mode.');
      }
      const beforePages = countPages(valueRef.current);
      const next = joinPages(valueRef.current, pages);
      onChange(next);
      const added = countPages(next) - beforePages;
      setStatus(
        added > 1
          ? `Added ${added} pages. Scan more pages anytime — they append below.`
          : `Added page ${countPages(next)}. Scan more pages anytime — they append below.`,
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
      <p className="hint">Scan or upload one page at a time.</p>
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
            <svg className="icon terms-icon-camera" viewBox="0 0 24 24" aria-hidden>
              <path
                d="M4 8h3l2-2h6l2 2h3v11H4V8z"
                fill="#3b82f6"
                stroke="#1d4ed8"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="13" r="3.5" fill="#93c5fd" stroke="#1e40af" strokeWidth="1.4" />
              <circle cx="12" cy="13" r="1.4" fill="#1e3a8a" />
            </svg>
            {value.trim() ? 'Scan next page' : 'Scan photo'}
          </button>
          <button
            type="button"
            className="photo-btn terms-toolbar-btn"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <svg className="icon terms-icon-upload" viewBox="0 0 24 24" aria-hidden>
              <path
                d="M3 9h6l2-2h10v12H3V9z"
                fill="#f59e0b"
                stroke="#b45309"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              <path
                d="M3 11h18v10H3V11z"
                fill="#fbbf24"
                stroke="#b45309"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
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
        accept="image/*,.txt,.md,text/plain"
        multiple
        hidden
        onChange={(e) => void handleFiles(e.target.files)}
      />
      {busy ? <p className="hint">{status || 'Working…'}</p> : null}
      {!busy && status ? <p className="success">{status}</p> : null}
      {error ? <p className="field-error">{error}</p> : null}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="terms-textarea"
        disabled={busy}
      />
    </div>
  );
}
