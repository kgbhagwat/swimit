import type JSZip from 'jszip';

type MammothApi = {
  convertToHtml: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
  extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
};

const OFFICE_OPEN_XML = /\.(docx|docm|dotx|dotm)$/i;
const LEGACY_WORD = /\.(doc|dot)$/i;
const OPEN_DOCUMENT = /\.(odt|fodt)$/i;
const APPLE_PAGES = /\.pages$/i;
const RTF = /\.rtf$/i;

function isZipFile(bytes: Uint8Array) {
  return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function isOleDoc(bytes: Uint8Array) {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0
  );
}

function isRtfBytes(bytes: Uint8Array) {
  const head = new TextDecoder('latin1').decode(bytes.slice(0, 12));
  return head.startsWith('{\\rtf');
}

function htmlToPlainTerms(html: string) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const lines: string[] = [];

  function pushText(el: Element) {
    const text = (el.textContent ?? '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .trim();
    if (text) lines.push(text);
  }

  function walk(node: Node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (['p', 'h1', 'h2', 'h3', 'h4', 'li', 'tr', 'pre'].includes(tag)) {
      pushText(el);
      return;
    }
    if (tag === 'br') {
      lines.push('');
      return;
    }
    Array.from(el.childNodes).forEach(walk);
  }

  walk(doc.body);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function xmlToPlainParagraphs(xml: string) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) return '';
  const lines: string[] = [];
  for (const el of Array.from(doc.getElementsByTagName('*'))) {
    const local = el.localName.toLowerCase();
    if (!['p', 'h', 'h1', 'h2', 'h3', 'li', 'title'].includes(local)) continue;
    if (el.querySelector('p, h, h1, h2, h3, li')) continue;
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (text) lines.push(text);
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function fromCharCodes(codes: number[]) {
  const parts: string[] = [];
  for (let i = 0; i < codes.length; i += 4096) {
    parts.push(String.fromCharCode(...codes.slice(i, i + 4096)));
  }
  return parts.join('');
}

function looksLikeProse(text: string) {
  const letters = (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
  return letters >= 8 && letters / Math.max(text.length, 1) > 0.4;
}

function extractOleWordText(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  let i = 0;
  while (i + 1 < bytes.length) {
    const chars: number[] = [];
    while (i + 1 < bytes.length) {
      const code = bytes[i] | (bytes[i + 1] << 8);
      const ok =
        code === 9 ||
        code === 10 ||
        code === 13 ||
        (code >= 32 && code < 0xd800) ||
        (code >= 0xe000 && code <= 0xfffd);
      if (!ok) break;
      chars.push(code);
      i += 2;
    }
    if (chars.length >= 16) {
      const piece = fromCharCodes(chars)
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .trim();
      if (piece.length >= 16 && looksLikeProse(piece)) chunks.push(piece);
    }
    i += 2;
  }
  return chunks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

function rtfToPlain(rtf: string) {
  let text = rtf.replace(/\r\n/g, '\n');
  text = text.replace(/\\u(-?\d+)\??/g, (_, n) => {
    const code = Number(n);
    return String.fromCharCode(code < 0 ? code + 65536 : code);
  });
  text = text.replace(/\\'[0-9a-fA-F]{2}/g, (m) =>
    String.fromCharCode(parseInt(m.slice(2), 16)),
  );
  text = text.replace(/\\par[d]?\b/g, '\n');
  text = text.replace(/\\line\b/g, '\n');
  text = text.replace(/\\tab\b/g, '\t');
  text = text.replace(/\{\\\*[^{}]*\}/g, '');
  text = text.replace(/\\[a-zA-Z]+\s?-?\d*\s?/g, '');
  text = text.replace(/\\[{}\\]/g, '');
  text = text.replace(/[{}]/g, '');
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function extractDocxText(arrayBuffer: ArrayBuffer) {
  const mammoth = (await import('mammoth')) as unknown as MammothApi;
  const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
  const fromHtml = htmlToPlainTerms(htmlResult.value);
  if (fromHtml) return fromHtml;
  const raw = await mammoth.extractRawText({ arrayBuffer });
  return String(raw.value ?? '')
    .replace(/\r\n/g, '\n')
    .trim();
}

async function loadZip(arrayBuffer: ArrayBuffer) {
  const JSZip = (await import('jszip')).default;
  return JSZip.loadAsync(arrayBuffer);
}

function zipEntry(zip: JSZip, test: (name: string) => boolean) {
  return Object.keys(zip.files).find((name) => !zip.files[name].dir && test(name));
}

async function extractOdtText(arrayBuffer: ArrayBuffer) {
  const zip = await loadZip(arrayBuffer);
  const path = zipEntry(zip, (name) => /(^|\/)content\.xml$/i.test(name));
  if (!path) throw new Error('Not a valid OpenDocument (.odt) file.');
  const xml = await zip.files[path].async('string');
  const text = xmlToPlainParagraphs(xml);
  if (!text) throw new Error('No text was found in the OpenDocument file.');
  return text;
}

async function extractPagesText(arrayBuffer: ArrayBuffer) {
  const zip = await loadZip(arrayBuffer);
  const xmlPath = zipEntry(
    zip,
    (name) => /(^|\/)(index|preview|content)\.xml$/i.test(name),
  );
  if (xmlPath) {
    const xml = await zip.files[xmlPath].async('string');
    const text = xmlToPlainParagraphs(xml);
    if (text) return text;
  }

  const pdfPath = zipEntry(zip, (name) => /preview\.pdf$/i.test(name));
  if (pdfPath) {
    const blob = await zip.files[pdfPath].async('blob');
    const pdfFile = new File([blob], 'preview.pdf', { type: 'application/pdf' });
    const { extractTextFromPdfFile } = await import('./termsOcr');
    const pages = await extractTextFromPdfFile(pdfFile, 'mixed');
    const text = pages.join('\n\n').trim();
    if (text) return text;
  }

  const imagePath = zipEntry(zip, (name) => /preview\.(jpg|jpeg|png)$/i.test(name));
  if (imagePath) {
    const blob = await zip.files[imagePath].async('blob');
    const type = imagePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    const imageFile = new File([blob], 'preview.jpg', { type });
    const { createTunedOcrWorker, recognizeImageFile } = await import('./termsOcr');
    const worker = await createTunedOcrWorker('mixed');
    try {
      const text = await recognizeImageFile(worker, imageFile);
      if (text) return text;
    } finally {
      await worker.terminate();
    }
  }

  throw new Error(
    'Could not read this Pages document. Export it as Word (.docx) from Pages and upload again.',
  );
}

export function isRichDocument(file: File) {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return (
    type === 'application/msword' ||
    type === 'application/rtf' ||
    type === 'text/rtf' ||
    type.includes('wordprocessingml') ||
    type.includes('opendocument.text') ||
    type.includes('iwork-pages') ||
    type.includes('vnd.apple.pages') ||
    OFFICE_OPEN_XML.test(name) ||
    LEGACY_WORD.test(name) ||
    OPEN_DOCUMENT.test(name) ||
    APPLE_PAGES.test(name) ||
    RTF.test(name)
  );
}

/** @deprecated use isRichDocument */
export const isWordDocument = isRichDocument;

export async function readWordDocumentText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  if (RTF.test(name) || isRtfBytes(bytes)) {
    const text = rtfToPlain(new TextDecoder('latin1').decode(bytes));
    if (!text) throw new Error('No text was found in the RTF file.');
    return text;
  }

  if (name.endsWith('.fodt')) {
    const text = xmlToPlainParagraphs(new TextDecoder().decode(bytes));
    if (!text) throw new Error('No text was found in the OpenDocument file.');
    return text;
  }

  if (OPEN_DOCUMENT.test(name) || (isZipFile(bytes) && name.endsWith('.odt'))) {
    return extractOdtText(arrayBuffer);
  }

  if (APPLE_PAGES.test(name)) {
    if (!isZipFile(bytes)) {
      throw new Error(
        'Could not read this Pages document. Export it as Word (.docx) from Pages and upload again.',
      );
    }
    return extractPagesText(arrayBuffer);
  }

  if (isZipFile(bytes)) {
    const zip = await loadZip(arrayBuffer);
    if (zipEntry(zip, (n) => /(^|\/)content\.xml$/i.test(n))) {
      return extractOdtText(arrayBuffer);
    }
    if (zipEntry(zip, (n) => /(^|\/)word\/document\.xml$/i.test(n)) || OFFICE_OPEN_XML.test(name)) {
      const text = await extractDocxText(arrayBuffer);
      if (!text) throw new Error('No text was found in the Word document.');
      return text;
    }
    if (
      zipEntry(zip, (n) => /preview\.(pdf|jpg|jpeg|png)$/i.test(n)) ||
      zipEntry(zip, (n) => /(^|\/)index\.xml$/i.test(n))
    ) {
      return extractPagesText(arrayBuffer);
    }
    if (OFFICE_OPEN_XML.test(name) || name.endsWith('.docx')) {
      const text = await extractDocxText(arrayBuffer);
      if (!text) throw new Error('No text was found in the Word document.');
      return text;
    }
  }

  if (OFFICE_OPEN_XML.test(name)) {
    const text = await extractDocxText(arrayBuffer);
    if (!text) throw new Error('No text was found in the Word document.');
    return text;
  }

  if (isOleDoc(bytes) || LEGACY_WORD.test(name)) {
    const text = extractOleWordText(arrayBuffer);
    if (!text) {
      throw new Error(
        'Could not read this .doc file. Please save it as .docx in Word or Pages and upload again.',
      );
    }
    return text;
  }

  throw new Error('This file does not look like a Word, Pages, or OpenDocument file.');
}
