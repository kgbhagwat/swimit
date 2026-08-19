import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';
import { Resvg } from '@resvg/resvg-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsRoot = path.resolve(__dirname, '../uploads');

export type PassCardImageInput = {
  id: number;
  fullName: string;
  passType: string;
  duration?: string;
  batch: string;
  coach: string;
  passValidUntil: string;
  photoPath?: string | null;
  poolName: string;
  poolAddress: string;
  poolLogoPath?: string | null;
};

function escapeXml(value: string) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatPassDate(value: string) {
  const raw = String(value ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return String(value ?? '').trim() || '—';
  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return date
    .toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    .replace(/ /g, ' ');
}

function splitBatch(batch: string) {
  const value = String(batch ?? '').trim();
  if (!value) return { title: '—', time: '' };
  const timeMatch = value.match(/^(.*?)\s*[—-]\s*(\d{1,2}:\d{2}\s*to\s*\d{1,2}:\d{2})\s*$/i);
  if (timeMatch) return { title: timeMatch[1].trim(), time: timeMatch[2].trim() };
  return { title: value, time: '' };
}

async function fileToDataUri(relativePath: string | null | undefined): Promise<string | null> {
  const rel = String(relativePath ?? '').trim().replace(/^[/\\]+/, '');
  if (!rel) return null;
  try {
    const abs = path.join(uploadsRoot, rel);
    const buf = await fs.readFile(abs);
    const ext = path.extname(rel.replace(/\.enc$/i, '')).toLowerCase();
    if (ext === '.pdf') return null;
    const mime =
      ext === '.png'
        ? 'image/png'
        : ext === '.webp'
          ? 'image/webp'
          : ext === '.gif'
            ? 'image/gif'
            : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

function wrapLines(text: string, maxChars: number, maxLines: number) {
  const words = String(text ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return ['—'];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length >= maxLines - 1) break;
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (words.join(' ').length > lines.join(' ').length) {
    const last = lines[lines.length - 1] ?? '';
    lines[lines.length - 1] = `${last.slice(0, Math.max(0, maxChars - 1))}…`;
  }
  return lines.slice(0, maxLines);
}

export async function renderPassCardPng(input: PassCardImageInput): Promise<Buffer> {
  const qrPng = await QRCode.toBuffer(`SWIMIT:${input.id}`, {
    type: 'png',
    width: 360,
    margin: 1,
    errorCorrectionLevel: 'M',
  });
  const qrUri = `data:image/png;base64,${qrPng.toString('base64')}`;
  const photoUri = await fileToDataUri(input.photoPath);
  const logoUri = await fileToDataUri(input.poolLogoPath);
  const poolName = String(input.poolName ?? '').trim() || 'SwimIT';
  const poolAddress = String(input.poolAddress ?? '').trim();
  const batch = splitBatch(input.batch);
  const validUntil = formatPassDate(input.passValidUntil);
  const addressLines = wrapLines(poolAddress, 22, 2);
  const batchLines = [batch.title, batch.time].filter(Boolean);

  const fields: Array<{ label: string; value: string }> = [
    { label: 'Pass ID', value: String(input.id) },
    { label: 'Pass type', value: String(input.passType || '—') },
  ];
  if (input.duration) fields.push({ label: 'Duration', value: String(input.duration) });
  fields.push(
    { label: 'Batch', value: batchLines.join(' · ') || '—' },
    { label: 'Coach', value: String(input.coach || '—') },
    { label: 'Valid until', value: validUntil },
  );

  let fieldY = 268;
  const fieldRows = fields
    .map((field) => {
      const valueLines = wrapLines(field.value, 14, 2);
      const row = `
        <text x="292" y="${fieldY}" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="18" fill="#5b6b84" font-weight="600">${escapeXml(field.label)}</text>
        ${valueLines
          .map(
            (line, i) =>
              `<text x="400" y="${fieldY + i * 24}" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="20" fill="#1a3568" font-weight="700">${escapeXml(line)}</text>`,
          )
          .join('')}
      `;
      fieldY += 28 + (valueLines.length - 1) * 24;
      return row;
    })
    .join('');

  const logoBlock = logoUri
    ? `<image href="${logoUri}" x="36" y="36" width="72" height="72" preserveAspectRatio="xMidYMid meet" />`
    : `<rect x="36" y="36" width="72" height="72" rx="10" fill="#edf4ff" />
       <text x="72" y="84" text-anchor="middle" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="#1a3568">${escapeXml(
         poolName.slice(0, 1).toUpperCase(),
       )}</text>`;

  const photoBlock = photoUri
    ? `<image href="${photoUri}" x="36" y="156" width="200" height="250" preserveAspectRatio="xMidYMid slice" />`
    : `<rect x="36" y="156" width="200" height="250" fill="#e8eef8" />
       <text x="136" y="290" text-anchor="middle" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="18" fill="#5b6b84">No photo</text>`;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="760" height="460" viewBox="0 0 760 460">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#edf4ff" />
      <stop offset="45%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#d7e4f7" />
    </linearGradient>
  </defs>
  <rect width="760" height="460" rx="28" fill="url(#bg)" stroke="#c5d3ea" stroke-width="2" />
  <rect x="24" y="24" width="712" height="104" rx="18" fill="#ffffff" stroke="#d7e2f5" />
  ${logoBlock}
  <text x="128" y="68" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="#1a3568">${escapeXml(poolName)}</text>
  ${addressLines
    .map(
      (line, i) =>
        `<text x="128" y="${96 + i * 22}" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="16" fill="#5b6b84">${escapeXml(line)}</text>`,
    )
    .join('')}
  <rect x="24" y="140" width="712" height="296" rx="18" fill="#d7e4f7" />
  <clipPath id="photoClip"><rect x="36" y="156" width="200" height="250" rx="14" /></clipPath>
  <g clip-path="url(#photoClip)">${photoBlock}</g>
  <rect x="36" y="156" width="200" height="250" rx="14" fill="none" stroke="#b8c7dc" />
  <rect x="528" y="32" width="192" height="192" rx="12" fill="#ffffff" stroke="#d7e2f5" />
  <image href="${qrUri}" x="537" y="41" width="174" height="174" />
  <text x="292" y="190" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="30" font-weight="700" fill="#1a3568">${escapeXml(
    wrapLines(input.fullName, 14, 1)[0],
  )}</text>
  ${fieldRows}
</svg>`;

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 760 },
    font: {
      loadSystemFonts: true,
      defaultFontFamily: 'DejaVu Sans, Arial, Helvetica, sans-serif',
    },
  });
  return Buffer.from(resvg.render().asPng());
}

export async function renderPassQrPng(registrationId: number): Promise<Buffer> {
  return QRCode.toBuffer(`SWIMIT:${registrationId}`, {
    type: 'png',
    width: 640,
    margin: 2,
    errorCorrectionLevel: 'M',
  });
}

export async function renderUrlQrPng(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, {
    type: 'png',
    width: 640,
    margin: 2,
    errorCorrectionLevel: 'M',
  });
}
