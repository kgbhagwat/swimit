import { useRef, useState } from 'react';

type Props = {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
};

async function extractTextFromImage(file: File): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  try {
    const result = await worker.recognize(file);
    return String(result.data.text ?? '').trim();
  } finally {
    await worker.terminate();
  }
}

async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();

  if (
    type.startsWith('image/') ||
    /\.(png|jpe?g|webp|gif|bmp|tif{1,2})$/i.test(name)
  ) {
    return extractTextFromImage(file);
  }

  if (type.startsWith('text/') || /\.(txt|md|csv)$/i.test(name)) {
    return (await file.text()).trim();
  }

  throw new Error('Use a photo/image of the document, or a .txt file');
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
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function handleFile(file: File | null, mode: 'replace' | 'append') {
    if (!file) return;
    setBusy(true);
    setError('');
    setStatus(file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name)
      ? 'Scanning document (OCR)…'
      : 'Reading file…');
    try {
      const text = await extractTextFromFile(file);
      if (!text) {
        throw new Error('No text found in that document. Try a clearer photo.');
      }
      const next =
        mode === 'append' && value.trim()
          ? `${value.trim()}\n\n${text}`
          : text;
      onChange(next);
      setStatus(`Imported ${text.length} characters. Review and edit if needed.`);
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
      <p className="hint">
        Type below, or scan/upload a document photo to extract text (English OCR). You can also upload a
        .txt file.
      </p>
      <div className="photo-actions terms-scan-actions">
        <button
          type="button"
          className="photo-btn"
          disabled={busy}
          onClick={() => cameraRef.current?.click()}
        >
          <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M4 8h3l2-2h6l2 2h3v11H4V8z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
          Scan photo
        </button>
        <button
          type="button"
          className="photo-btn"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M3 7h6l2 2h10v10H3V7z" />
          </svg>
          Upload document
        </button>
        {value.trim() ? (
          <button
            type="button"
            className="photo-btn"
            disabled={busy}
            onClick={() => {
              if (confirm('Clear this terms text?')) {
                onChange('');
                setStatus('');
                setError('');
              }
            }}
          >
            Clear text
          </button>
        ) : null}
      </div>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => void handleFile(e.target.files?.[0] ?? null, 'replace')}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.txt,.md,text/plain"
        hidden
        onChange={(e) => void handleFile(e.target.files?.[0] ?? null, value.trim() ? 'append' : 'replace')}
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
