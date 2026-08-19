import { useEffect, useRef, useState } from 'react';
import { TermsBlocks } from './TermsBlocks';
import { isWordDocument, readWordDocumentText } from './termsWord';

type Props = {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
  /** When false, make the field read-only. */
  editable?: boolean;
  /** Show numbered clause headings in bold while editing. */
  richHeadings?: boolean;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Plain terms → HTML with bold headings for contenteditable. */
export function termsPlainToHtml(text: string) {
  const lines = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  if (!lines.length) return '';

  return lines
    .map((line) => {
      const raw = line;
      if (!raw.trim()) return '<div><br></div>';

      const withHeading = raw.match(/^((?:\d+|[०-९]+)[).]\s+)(.+?)\s+[–—-]\s+(.+)$/u);
      if (withHeading) {
        const [, number, heading, body] = withHeading;
        return `<div><strong>${escapeHtml(number + heading)}</strong> – ${escapeHtml(body)}</div>`;
      }

      const numberOnly = raw.match(/^((?:\d+|[०-९]+)[).]\s+)(.+)$/u);
      if (numberOnly) {
        const [, number, body] = numberOnly;
        return `<div><strong>${escapeHtml(number.trimEnd())}</strong> ${escapeHtml(body)}</div>`;
      }

      return `<div>${escapeHtml(raw)}</div>`;
    })
    .join('');
}

/** Contenteditable HTML → plain terms text for storage. */
export function termsHtmlToPlain(root: HTMLElement) {
  const blocks = Array.from(root.querySelectorAll(':scope > div, :scope > p'));
  const nodes = blocks.length ? blocks : [root];
  return nodes
    .map((node) => {
      const text = (node.textContent ?? '').replace(/\u00a0/g, ' ').trimEnd();
      return text;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

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
    isWordDocument(file) ||
    type.includes('pdf') ||
    /\.(txt|md|csv|rtf|pdf)$/i.test(name)
  );
}

async function readDocumentText(file: File): Promise<string> {
  if (file.type.includes('pdf') || /\.pdf$/i.test(file.name)) {
    const { extractTextFromPdfFile } = await import('./termsOcr');
    const pages = await extractTextFromPdfFile(file, 'mixed');
    const text = pages.join('\n\n').trim();
    if (!text) throw new Error('No text was found in the PDF.');
    return text;
  }
  if (isWordDocument(file)) {
    return readWordDocumentText(file);
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
  richHeadings = false,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  const lastEmittedRef = useRef(value);
  valueRef.current = value;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Sync external value (language switch / load) into the rich editor.
  useEffect(() => {
    if (!richHeadings || !editable) return;
    const el = editorRef.current;
    if (!el) return;
    if (value === lastEmittedRef.current && el.innerHTML) return;
    if (document.activeElement === el) return;
    el.innerHTML = termsPlainToHtml(value);
    lastEmittedRef.current = value;
  }, [value, richHeadings, editable]);

  async function handleFile(fileList: FileList | null) {
    const file = fileList?.[0] ?? null;
    if (!file) return;

    setBusy(true);
    setError('');
    try {
      if (!isTextFile(file)) {
        throw new Error(
          'Please select a Word, Pages, OpenDocument, PDF, or text file (.docx, .doc, .pages, .odt, .pdf, .rtf, .txt).',
        );
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

  function emitFromEditor() {
    const el = editorRef.current;
    if (!el) return;
    const plain = termsHtmlToPlain(el);
    lastEmittedRef.current = plain;
    onChange(plain);
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
            accept=".txt,.md,.csv,.rtf,.pdf,.doc,.docx,.docm,.dotx,.odt,.pages,text/plain,text/rtf,application/pdf,application/msword,application/rtf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text,application/vnd.apple.pages"
            hidden
            onChange={(e) => void handleFile(e.target.files)}
          />
          {error ? <p className="field-error">{error}</p> : null}
          {richHeadings ? (
            <div
              ref={editorRef}
              className="terms-textarea terms-rich-editor"
              contentEditable={!busy}
              role="textbox"
              aria-multiline="true"
              data-placeholder={placeholder}
              suppressContentEditableWarning
              style={{ minHeight: `${Math.max(rows, 4) * 1.35}rem` }}
              onInput={emitFromEditor}
              onBlur={emitFromEditor}
            />
          ) : (
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              rows={rows}
              className="terms-textarea"
              disabled={busy}
            />
          )}
        </>
      ) : (
        <div className="pool-core-view-text">
          {value.trim() ? <TermsBlocks text={value} /> : '—'}
        </div>
      )}
    </div>
  );
}
