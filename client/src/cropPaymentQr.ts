/** Crop a payment-app screenshot down to the QR square. */

type Point = { x: number; y: number; size: number; n: number };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unable to read payment QR image'));
    img.src = src;
  });
}

function ratioOk(runs: number[]) {
  const total = runs[0] + runs[1] + runs[2] + runs[3] + runs[4];
  if (total < 14) return false;
  const unit = total / 7;
  const expected = [1, 1, 3, 1, 1];
  for (let i = 0; i < 5; i++) {
    if (Math.abs(runs[i] / unit - expected[i]) > 0.8) return false;
  }
  return true;
}

function scanFinderHits(bin: Uint8Array, w: number, h: number): Point[] {
  const hits: Point[] = [];
  for (let y = 0; y < h; y += 2) {
    const row = y * w;
    let color = bin[row];
    let run = 1;
    const runs: number[] = [];
    const colors: number[] = [];
    for (let x = 1; x < w; x++) {
      const next = bin[row + x];
      if (next === color) {
        run += 1;
      } else {
        colors.push(color);
        runs.push(run);
        color = next;
        run = 1;
      }
    }
    colors.push(color);
    runs.push(run);

    let pos = 0;
    for (let i = 0; i < runs.length; i++) {
      if (
        colors[i] === 1 &&
        i + 4 < runs.length &&
        colors[i + 1] === 0 &&
        colors[i + 2] === 1 &&
        colors[i + 3] === 0 &&
        colors[i + 4] === 1 &&
        ratioOk(runs.slice(i, i + 5))
      ) {
        const total = runs[i] + runs[i + 1] + runs[i + 2] + runs[i + 3] + runs[i + 4];
        hits.push({ x: pos + total / 2, y, size: total, n: 1 });
      }
      pos += runs[i];
    }
  }
  return hits;
}

function clusterHits(hits: Point[]): Point[] {
  const clusters: Point[] = [];
  for (const hit of hits) {
    let matched = false;
    for (const cluster of clusters) {
      const limit = Math.max(12, (cluster.size + hit.size) / 2.5);
      if (Math.hypot(cluster.x - hit.x, cluster.y - hit.y) <= limit) {
        cluster.n += 1;
        cluster.x += (hit.x - cluster.x) / cluster.n;
        cluster.y += (hit.y - cluster.y) / cluster.n;
        cluster.size += (hit.size - cluster.size) / cluster.n;
        matched = true;
        break;
      }
    }
    if (!matched) clusters.push({ ...hit });
  }
  return clusters.filter((cluster) => cluster.n >= 3).sort((a, b) => b.n - a.n);
}

function squareFromFinders(clusters: Point[], w: number, h: number) {
  const used = clusters.slice(0, 3);
  if (used.length < 2) return null;
  const pad = Math.max(...used.map((c) => c.size)) * 0.55;
  let x0 = Math.min(...used.map((c) => c.x)) - pad;
  let y0 = Math.min(...used.map((c) => c.y)) - pad;
  let x1 = Math.max(...used.map((c) => c.x)) + pad;
  let y1 = Math.max(...used.map((c) => c.y)) + pad;
  const side = Math.max(x1 - x0, y1 - y0);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  x0 = cx - side / 2;
  y0 = cy - side / 2;
  x1 = cx + side / 2;
  y1 = cy + side / 2;
  const quiet = side * 0.06;
  return {
    x0: Math.max(0, x0 - quiet),
    y0: Math.max(0, y0 - quiet),
    x1: Math.min(w, x1 + quiet),
    y1: Math.min(h, y1 + quiet),
  };
}

function cropFromWhiteCard(luma: Float32Array, w: number, h: number) {
  const rowScore = new Float32Array(h);
  const colScore = new Float32Array(w);
  for (let y = 0; y < h; y++) {
    let bright = 0;
    for (let x = 0; x < w; x++) {
      if (luma[y * w + x] > 210) bright += 1;
    }
    rowScore[y] = bright / w;
  }
  for (let x = 0; x < w; x++) {
    let bright = 0;
    for (let y = 0; y < h; y++) {
      if (luma[y * w + x] > 210) bright += 1;
    }
    colScore[x] = bright / h;
  }

  const span = (scores: Float32Array, min: number) => {
    let best = { a: 0, b: 0 };
    let start = -1;
    for (let i = 0; i <= scores.length; i++) {
      const on = i < scores.length && scores[i] >= min;
      if (on && start < 0) start = i;
      if (!on && start >= 0) {
        if (i - start > best.b - best.a) best = { a: start, b: i };
        start = -1;
      }
    }
    return best.b - best.a >= 24 ? best : null;
  };

  const rows = span(rowScore, 0.28);
  const cols = span(colScore, 0.22);
  if (!rows || !cols) return null;

  let x0 = cols.a;
  let y0 = rows.a;
  let x1 = cols.b;
  let y1 = rows.b;
  let darkX0 = x1;
  let darkY0 = y1;
  let darkX1 = x0;
  let darkY1 = y0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (luma[y * w + x] < 90) {
        if (x < darkX0) darkX0 = x;
        if (y < darkY0) darkY0 = y;
        if (x > darkX1) darkX1 = x;
        if (y > darkY1) darkY1 = y;
      }
    }
  }
  if (darkX1 - darkX0 < 40 || darkY1 - darkY0 < 40) return null;
  const side = Math.max(darkX1 - darkX0, darkY1 - darkY0);
  const cx = (darkX0 + darkX1) / 2;
  const cy = (darkY0 + darkY1) / 2;
  const quiet = side * 0.08;
  return {
    x0: Math.max(0, cx - side / 2 - quiet),
    y0: Math.max(0, cy - side / 2 - quiet),
    x1: Math.min(w, cx + side / 2 + quiet),
    y1: Math.min(h, cy + side / 2 + quiet),
  };
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

export async function cropPaymentQrFromUrl(src: string): Promise<Blob | null> {
  const img = await loadImage(src);
  const maxSide = 480;
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const probe = document.createElement('canvas');
  probe.width = w;
  probe.height = h;
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  const pixels = ctx.getImageData(0, 0, w, h).data;
  const luma = new Float32Array(w * h);
  const bin = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const y = 0.299 * pixels[i * 4] + 0.587 * pixels[i * 4 + 1] + 0.114 * pixels[i * 4 + 2];
    luma[i] = y;
    bin[i] = y < 140 ? 1 : 0;
  }

  const box =
    squareFromFinders(clusterHits(scanFinderHits(bin, w, h)), w, h) ??
    cropFromWhiteCard(luma, w, h);
  if (!box) return null;

  const inv = 1 / scale;
  const sx = Math.max(0, Math.floor(box.x0 * inv));
  const sy = Math.max(0, Math.floor(box.y0 * inv));
  const sw = Math.min(img.width - sx, Math.ceil((box.x1 - box.x0) * inv));
  const sh = Math.min(img.height - sy, Math.ceil((box.y1 - box.y0) * inv));
  if (sw < 40 || sh < 40) return null;

  const side = Math.max(sw, sh);
  // QR readers require a clear quiet zone around all four sides. The finder
  // crop deliberately locates the printed QR edge, so add that margin back.
  const quietZone = Math.max(12, Math.round(side * 0.09));
  const out = document.createElement('canvas');
  out.width = side + quietZone * 2;
  out.height = side + quietZone * 2;
  const outCtx = out.getContext('2d');
  if (!outCtx) return null;
  outCtx.fillStyle = '#fff';
  outCtx.fillRect(0, 0, out.width, out.height);
  outCtx.drawImage(
    img,
    sx,
    sy,
    sw,
    sh,
    quietZone + Math.floor((side - sw) / 2),
    quietZone + Math.floor((side - sh) / 2),
    sw,
    sh,
  );
  return canvasToPng(out);
}
