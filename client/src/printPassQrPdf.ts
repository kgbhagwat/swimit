import QRCode from 'qrcode';
import { fetchPoolBrand, formatBatchDisplay, type PoolBrand } from './IdCard';
import {
  fetchSwimmerPass,
  formatDisplayDate,
  idCardUrl,
  type SwimmerPassDetails,
} from './swimmerPass';

const PASS_ROWS_PER_PAGE = 5;
const PASSES_PER_PAGE = PASS_ROWS_PER_PAGE * 2;
const PAGE_W = 1240;
const PAGE_H = 1754;
const A4_PT_W = 595.28;
const A4_PT_H = 841.89;

type PrintableSwimmer = { id: number; name: string };

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = String(text ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return ['—'];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
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

function loadImage(src: string | null | undefined): Promise<HTMLImageElement | null> {
  const url = String(src ?? '').trim();
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function drawPassCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  pass: SwimmerPassDetails,
  brand: PoolBrand,
  photo: HTMLImageElement | null,
  logo: HTMLImageElement | null,
  qr: HTMLImageElement | null,
) {
  const poolName = brand.poolName?.trim() || 'SwimIT';
  const poolAddress = brand.poolAddress?.trim() || '';
  const batch = formatBatchDisplay(pass.batch);

  roundRect(ctx, x, y, w, h, 14);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#c5d3e6';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const headerH = Math.round(h * 0.28);
  ctx.save();
  roundRect(ctx, x, y, w, headerH + 12, 14);
  ctx.clip();
  ctx.fillStyle = '#edf4ff';
  ctx.fillRect(x, y, w, headerH + 12);
  ctx.restore();

  const logoSize = Math.round(headerH * 0.72);
  const logoX = x + 12;
  const logoY = y + 10;
  const pad = 10;
  const qrSize = Math.round(Math.min(h * 0.69, w * 0.48, 192));
  const qrX = x + w - pad - qrSize;
  const qrY = y + 10;
  const headerTextW = Math.max(40, qrX - (logoX + logoSize + 10) - 8);

  roundRect(ctx, logoX, logoY, logoSize, logoSize, 8);
  ctx.fillStyle = '#f7faff';
  ctx.fill();
  if (logo) {
    ctx.save();
    roundRect(ctx, logoX, logoY, logoSize, logoSize, 8);
    ctx.clip();
    ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
    ctx.restore();
  } else {
    ctx.fillStyle = '#1a3568';
    ctx.font = `700 ${Math.round(logoSize * 0.45)}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(poolName.slice(0, 1).toUpperCase(), logoX + logoSize / 2, logoY + logoSize / 2);
  }

  const textX = logoX + logoSize + 10;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#1a3568';
  ctx.font = `800 ${Math.round(h * 0.075)}px Arial, sans-serif`;
  ctx.fillText(poolName, textX, y + 12, headerTextW);
  if (poolAddress) {
    ctx.fillStyle = '#5b6b84';
    ctx.font = `500 ${Math.round(h * 0.045)}px Arial, sans-serif`;
    const addrLines = wrapText(ctx, poolAddress, headerTextW, 2);
    addrLines.forEach((line, i) => {
      ctx.fillText(line, textX, y + 12 + Math.round(h * 0.09) + i * Math.round(h * 0.055));
    });
  }

  if (qr) {
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, qrX - 4, qrY - 4, qrSize + 8, qrSize + 8, 8);
    ctx.fill();
    ctx.drawImage(qr, qrX, qrY, qrSize, qrSize);
  }

  const bodyY = y + headerH + 4;
  const bodyH = h - headerH - 12;
  const maxPhotoH = Math.round(bodyH * 0.94);
  const maxPhotoW = Math.round(w * 0.32);
  let photoH = maxPhotoH;
  let photoW = Math.round((photoH * 3) / 4);
  if (photoW > maxPhotoW) {
    photoW = maxPhotoW;
    photoH = Math.round((photoW * 4) / 3);
  }
  const photoX = x + pad;
  const photoY = bodyY + (bodyH - photoH) / 2;
  roundRect(ctx, photoX, photoY, photoW, photoH, 8);
  ctx.fillStyle = '#e8eef8';
  ctx.fill();
  if (photo) {
    ctx.save();
    roundRect(ctx, photoX, photoY, photoW, photoH, 8);
    ctx.clip();
    const scale = Math.max(photoW / photo.width, photoH / photo.height);
    const dw = photo.width * scale;
    const dh = photo.height * scale;
    ctx.drawImage(
      photo,
      photoX + (photoW - dw) / 2,
      photoY + (photoH - dh) * 0.2,
      dw,
      dh,
    );
    ctx.restore();
  } else {
    ctx.fillStyle = '#5b6b84';
    ctx.font = `600 ${Math.round(Math.min(photoW * 0.18, h * 0.045))}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No photo', photoX + photoW / 2, photoY + photoH / 2);
  }

  const fieldX = photoX + photoW + 10;
  const fieldW = Math.max(40, qrX - fieldX - 8);
  const labelW = Math.min(92, Math.round(fieldW * 0.34));
  const valueW = Math.max(40, fieldW - labelW - 6);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#1a3568';
  ctx.font = `800 ${Math.round(h * 0.072)}px Arial, sans-serif`;
  ctx.fillText(pass.fullName || '—', fieldX, photoY, fieldW);

  const fields: Array<[string, string]> = [
    ['Pass ID', String(pass.id)],
    ['Pass type', pass.passType || '—'],
    ['Batch', [batch.title, batch.time].filter(Boolean).join(' · ') || '—'],
    ['Coach', pass.coach || '—'],
    ['Valid until', formatDisplayDate(pass.passValidUntil)],
  ];
  let fy = photoY + Math.round(h * 0.1);
  const rowH = Math.round(bodyH * 0.155);
  fields.forEach(([label, value]) => {
    ctx.fillStyle = '#5b6b84';
    ctx.font = `600 ${Math.round(h * 0.038)}px Arial, sans-serif`;
    ctx.fillText(label, fieldX, fy, labelW);
    ctx.fillStyle = '#1a3568';
    ctx.font = `700 ${Math.round(h * 0.042)}px Arial, sans-serif`;
    const lines = wrapText(ctx, value, valueW, 2);
    lines.forEach((line, i) => {
      ctx.fillText(line, fieldX + labelW + 4, fy + i * Math.round(h * 0.048), valueW);
    });
    fy += rowH + (lines.length > 1 ? Math.round(h * 0.02) : 0);
  });
}

async function renderPage(
  passes: Array<{ pass: SwimmerPassDetails; brand: PoolBrand; photo: HTMLImageElement | null; logo: HTMLImageElement | null; qr: HTMLImageElement }>,
) {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  const margin = 36;
  const contentW = PAGE_W - margin * 2;
  const columnGap = 12;
  const passW = Math.floor((contentW - columnGap) / 2);
  const rowH = (PAGE_H - margin * 2) / PASS_ROWS_PER_PAGE;
  passes.forEach((item, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = margin + column * (passW + columnGap);
    const y = margin + row * rowH;
    const inner = 8;
    const passH = rowH - inner * 2;
    drawPassCard(
      ctx,
      x,
      y + inner,
      passW,
      passH,
      item.pass,
      item.brand,
      item.photo,
      item.logo,
      item.qr,
    );
  });

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
  if (!blob) throw new Error('Failed to render PDF page');
  return new Uint8Array(await blob.arrayBuffer());
}

function buildPdfFromJpegs(jpegs: Uint8Array[]): Blob {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let pos = 0;

  const push = (data: string | Uint8Array) => {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data;
    chunks.push(bytes);
    pos += bytes.length;
  };

  push('%PDF-1.4\n%\x80\x80\x80\x80\n');

  const catalogId = 1;
  const pagesId = 2;
  const pageIds: number[] = [];
  let nextId = 3;

  const objects: Array<{ id: number; start: number }> = [];
  const mark = (id: number) => {
    objects.push({ id, start: pos });
  };

  const writeObj = (id: number, body: string, stream?: Uint8Array) => {
    mark(id);
    if (stream) {
      push(`${id} 0 obj\n${body}\nstream\n`);
      push(stream);
      push('\nendstream\nendobj\n');
    } else {
      push(`${id} 0 obj\n${body}\nendobj\n`);
    }
  };

  jpegs.forEach((jpeg) => {
    const pageId = nextId++;
    const imgId = nextId++;
    const contentId = nextId++;
    pageIds.push(pageId);
    writeObj(
      pageId,
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${A4_PT_W} ${A4_PT_H}] /Resources << /XObject << /Im0 ${imgId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    writeObj(
      imgId,
      `<< /Type /XObject /Subtype /Image /Width ${PAGE_W} /Height ${PAGE_H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`,
      jpeg,
    );
    const content = `q ${A4_PT_W} 0 0 ${A4_PT_H} 0 0 cm /Im0 Do Q`;
    const contentBytes = encoder.encode(content);
    writeObj(contentId, `<< /Length ${contentBytes.length} >>`, contentBytes);
  });

  mark(pagesId);
  push(
    `${pagesId} 0 obj\n<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds
      .map((id) => `${id} 0 R`)
      .join(' ')}] >>\nendobj\n`,
  );
  mark(catalogId);
  push(`${catalogId} 0 obj\n<< /Type /Catalog /Pages ${pagesId} 0 R >>\nendobj\n`);

  const xrefStart = pos;
  push(`xref\n0 ${nextId}\n`);
  push('0000000000 65535 f \n');
  const offsetById = new Map(objects.map((o) => [o.id, o.start]));
  for (let id = 1; id < nextId; id += 1) {
    const off = offsetById.get(id) ?? 0;
    push(`${String(off).padStart(10, '0')} 00000 n \n`);
  }
  push(`trailer\n<< /Size ${nextId} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return new Blob([out], { type: 'application/pdf' });
}

export async function downloadSelectedPassQrPdf(swimmers: PrintableSwimmer[]) {
  if (!swimmers.length) {
    throw new Error('Select swimmers with a pass to print.');
  }
  const brand = await fetchPoolBrand();
  const logo = await loadImage(brand.poolLogoUrl);
  const prepared: Array<{
    pass: SwimmerPassDetails;
    brand: PoolBrand;
    photo: HTMLImageElement | null;
    logo: HTMLImageElement | null;
    qr: HTMLImageElement;
  }> = [];

  for (const swimmer of swimmers) {
    const pass = await fetchSwimmerPass(swimmer.id);
    const [photo, qr] = await Promise.all([
      loadImage(pass.photoUrl),
      loadImage(await QRCode.toDataURL(idCardUrl(pass.id), { width: 420, margin: 1, errorCorrectionLevel: 'M' })),
    ]);
    if (!qr) throw new Error('Failed to create QR code');
    prepared.push({ pass, brand, photo, logo, qr });
  }

  const pages: Uint8Array[] = [];
  for (let i = 0; i < prepared.length; i += PASSES_PER_PAGE) {
    pages.push(await renderPage(prepared.slice(i, i + PASSES_PER_PAGE)));
  }
  const pdf = buildPdfFromJpegs(pages);
  const url = URL.createObjectURL(pdf);
  const anchor = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `swimit-pass-qr-${stamp}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}
