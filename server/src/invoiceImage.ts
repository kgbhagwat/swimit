import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Resvg } from '@resvg/resvg-js';
import { formatInvoiceInr, money, type PassInvoiceDto } from './passInvoice.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsRoot = path.resolve(__dirname, '../uploads');

function escapeXml(value: string) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatInvoiceDate(value: string) {
  const raw = String(value ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return String(value ?? '').trim() || '—';
  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function wrapLines(text: string, maxChars: number, maxLines: number) {
  const words = String(text ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return [] as string[];
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
  return lines.slice(0, maxLines);
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

function metaRow(x: number, y: number, label: string, value: string) {
  return `
    <text x="${x}" y="${y}" font-family="Segoe UI, Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="700" fill="#61738f">${escapeXml(label.toUpperCase())}</text>
    <text x="${x}" y="${y + 22}" font-family="Segoe UI, Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="700" fill="#1a3568">${escapeXml(value || '—')}</text>
  `;
}

export async function renderPassInvoicePng(invoice: PassInvoiceDto): Promise<Buffer> {
  const poolName = invoice.poolName.trim() || 'SwimIT';
  const poolAddress = invoice.poolAddress.trim();
  const logoUri = await fileToDataUri(invoice.poolLogoPath);
  const dateLabel = formatInvoiceDate(invoice.paymentDate);
  const particulars = [invoice.passType || 'Pass', invoice.passDuration].filter(Boolean).join(' · ');
  const total = formatInvoiceInr(money(invoice.amount));
  const poolAddressLines = wrapLines(poolAddress, 36, 2);
  const billAddressLines = wrapLines(invoice.swimmerAddress, 52, 2);

  const logoBlock = logoUri
    ? `<image href="${logoUri}" x="36" y="32" width="52" height="52" preserveAspectRatio="xMidYMid meet" />`
    : `<rect x="36" y="32" width="52" height="52" rx="10" fill="#edf4ff" />
       <text x="62" y="66" text-anchor="middle" font-family="Segoe UI, Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="800" fill="#1a3568">${escapeXml(
         poolName.slice(0, 1).toUpperCase(),
       )}</text>`;

  const billLines = [
    invoice.swimmerName,
    invoice.swimmerContact,
    invoice.swimmerEmail,
    ...billAddressLines,
  ].filter(Boolean);

  const hasTxn = Boolean(invoice.transactionId);
  const height = hasTxn ? 800 : 750;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="760" height="${height}" viewBox="0 0 760 ${height}">
  <rect width="760" height="${height}" fill="#ffffff" />
  ${logoBlock}
  <text x="104" y="52" font-family="Segoe UI, Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="800" fill="#1a3568">${escapeXml(poolName)}</text>
  ${poolAddressLines
    .map(
      (line, i) =>
        `<text x="104" y="${76 + i * 18}" font-family="Segoe UI, Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="14" fill="#4a5d7c">${escapeXml(line)}</text>`,
    )
    .join('')}
  <text x="724" y="50" text-anchor="end" font-family="Segoe UI, Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="800" fill="#1a3568">Tax Invoice</text>
  <text x="724" y="74" text-anchor="end" font-family="Segoe UI, Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="700" fill="#2d6a3f">Inclusive of all taxes</text>
  <line x1="36" y1="108" x2="724" y2="108" stroke="#e4ebf6" stroke-width="1" />
  ${metaRow(36, 136, 'Invoice number', invoice.invoiceNumber)}
  ${metaRow(400, 136, 'Invoice date', dateLabel)}
  ${metaRow(36, 190, 'Payment date', dateLabel)}
  ${metaRow(400, 190, 'Mode', invoice.paymentMode || '—')}
  ${hasTxn ? metaRow(36, 244, 'Transaction ID', invoice.transactionId) : ''}
  <text x="36" y="${hasTxn ? 310 : 256}" font-family="Segoe UI, Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="700" fill="#61738f">BILL TO</text>
  ${billLines
    .map(
      (line, i) =>
        `<text x="36" y="${(hasTxn ? 336 : 282) + i * 22}" font-family="Segoe UI, Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="${i === 0 ? 18 : 15}" font-weight="${i === 0 ? 800 : 500}" fill="#12325f">${escapeXml(line)}</text>`,
    )
    .join('')}
  <text x="36" y="${hasTxn ? 470 : 416}" font-family="Segoe UI, Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="700" fill="#61738f">PARTICULARS</text>
  <text x="724" y="${hasTxn ? 470 : 416}" text-anchor="end" font-family="Segoe UI, Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="700" fill="#61738f">AMOUNT</text>
  <line x1="36" y1="${hasTxn ? 482 : 428}" x2="724" y2="${hasTxn ? 482 : 428}" stroke="#e4ebf6" stroke-width="1" />
  <text x="36" y="${hasTxn ? 514 : 460}" font-family="Segoe UI, Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="700" fill="#1a3568">${escapeXml(particulars)}</text>
  <text x="36" y="${hasTxn ? 536 : 482}" font-family="Segoe UI, Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="13" fill="#6a7b95">Pass charges</text>
  <text x="724" y="${hasTxn ? 514 : 460}" text-anchor="end" font-family="Segoe UI, Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="700" fill="#1a3568">${escapeXml(total)}</text>
  <line x1="36" y1="${hasTxn ? 568 : 514}" x2="724" y2="${hasTxn ? 568 : 514}" stroke="#d7e2f5" stroke-width="1.5" />
  <text x="36" y="${hasTxn ? 604 : 550}" font-family="Segoe UI, Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="800" fill="#1a3568">TOTAL</text>
  <text x="724" y="${hasTxn ? 604 : 550}" text-anchor="end" font-family="Segoe UI, Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="800" fill="#1a3568">${escapeXml(total)}</text>
  <text x="36" y="${hasTxn ? 644 : 590}" font-family="Segoe UI, Noto Sans, DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="700" fill="#2d6a3f">Inclusive of all taxes</text>
</svg>`;

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 760 },
    font: {
      loadSystemFonts: true,
      defaultFontFamily: 'Segoe UI, Noto Sans, DejaVu Sans, Arial, sans-serif',
    },
  });
  return Buffer.from(resvg.render().asPng());
}
