import { useRef, useState } from 'react';

type Props = {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
  /** When false, make the field read-only. */
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

function isTextFile(file: File) {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return (
    type.startsWith('text/') ||
    type === 'application/msword' ||
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    /\.(txt|md|csv|doc|docx|rtf)$/i.test(name)
  );
}

async function readDocumentText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (/\.(doc|docx)$/i.test(name) || file.type.includes('word')) {
    throw new Error(
      'Word (.doc/.docx) files are not supported yet. Please upload a .txt file.',
    );
  }
  const text = (await file.text()).trim();
  if (!text) throw new Error('The selected file is empty.');
  return text;
}

export function TermsDocumentField({
  label,
  value,
  onChange,
  placeholder,
  rows = 10,
  editable = true,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(fileList: FileList | null) {
    const file = fileList?.[0] ?? null;
    if (!file) return;

    setBusy(true);
    setError('');
    try {
      if (!isTextFile(file)) {
        throw new Error('Please select a text or document file (.txt, .md, .rtf).');
      }
      const text = await readDocumentText(file);
      onChange(joinPages(valueRef.current, [text]));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read document');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="field terms-document-field">
      <div className="pool-core-image-heading">
        <span className="label">{label}</span>
        {editable ? (
          <button
            type="button"
            className="photo-btn pool-core-upload-trigger"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? 'Reading…' : 'Upload document'}
          </button>
        ) : null}
      </div>
      {editable ? (
        <>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.md,.csv,.rtf,text/plain,text/markdown,text/csv,text/rtf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            hidden
            onChange={(e) => void handleFile(e.target.files)}
          />
          {error ? <p className="field-error">{error}</p> : null}
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={rows}
            className="terms-textarea"
            disabled={busy}
          />
        </>
      ) : (
        <div className="pool-core-view-text">{value.trim() ? value : '—'}</div>
      )}
    </div>
  );
}
