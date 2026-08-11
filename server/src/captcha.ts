import { randomInt, randomUUID } from 'node:crypto';

type CaptchaEntry = {
  answer: string;
  expiresAt: number;
};

const challenges = new Map<string, CaptchaEntry>();
const CAPTCHA_TTL_MS = 5 * 60 * 1000;
/** Exclude look-alikes: 0/O, 1/I/L */
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CAPTCHA_LENGTH = 5;

function pruneCaptchas() {
  const now = Date.now();
  for (const [id, entry] of challenges) {
    if (entry.expiresAt <= now) challenges.delete(id);
  }
}

function randomCode(length = CAPTCHA_LENGTH): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CHARSET[randomInt(CHARSET.length)];
  }
  return out;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Distorted SVG so the code is human-readable but not trivial to scrape. */
export function captchaSvg(code: string): string {
  const width = 148;
  const height = 44;
  const chars = [...code];
  const noise: string[] = [];
  for (let i = 0; i < 5; i++) {
    const x1 = randomInt(0, width);
    const y1 = randomInt(0, height);
    const x2 = randomInt(0, width);
    const y2 = randomInt(0, height);
    const opacity = (0.25 + Math.random() * 0.35).toFixed(2);
    noise.push(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#5a7aa8" stroke-width="1" opacity="${opacity}"/>`,
    );
  }
  for (let i = 0; i < 18; i++) {
    const cx = randomInt(0, width);
    const cy = randomInt(0, height);
    const r = randomInt(1, 2);
    noise.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="#7a90b0" opacity="0.35"/>`);
  }
  const letters = chars
    .map((ch, i) => {
      const x = 14 + i * 26 + randomInt(-2, 3);
      const y = 28 + randomInt(-4, 5);
      const rot = randomInt(-18, 19);
      const size = 20 + randomInt(0, 4);
      return `<text x="${x}" y="${y}" font-size="${size}" font-family="Segoe UI, Arial, sans-serif" font-weight="700" fill="#1e3a5f" transform="rotate(${rot} ${x} ${y})">${escapeXml(ch)}</text>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="CAPTCHA">
  <rect width="100%" height="100%" rx="6" fill="#eef3fa"/>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="6" fill="none" stroke="#c5d0e0"/>
  ${noise.join('\n  ')}
  ${letters}
</svg>`;
}

export function createCaptchaChallenge(): { captchaId: string; imageSvg: string } {
  pruneCaptchas();
  const answer = randomCode();
  const captchaId = randomUUID();
  challenges.set(captchaId, {
    answer,
    expiresAt: Date.now() + CAPTCHA_TTL_MS,
  });
  return { captchaId, imageSvg: captchaSvg(answer) };
}

/**
 * One-time consume. Returns true only when id+answer match an unexpired challenge.
 */
export function consumeCaptcha(captchaId: string, answer: string): boolean {
  pruneCaptchas();
  const id = String(captchaId ?? '').trim();
  const normalized = String(answer ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (!id || !normalized) return false;
  const entry = challenges.get(id);
  if (!entry) return false;
  challenges.delete(id);
  if (entry.expiresAt <= Date.now()) return false;
  return entry.answer === normalized;
}

/** Opaque token for clients that prefer data-URL embedding. */
export function captchaDataUrl(svg: string): string {
  const b64 = Buffer.from(svg, 'utf8').toString('base64');
  return `data:image/svg+xml;base64,${b64}`;
}
