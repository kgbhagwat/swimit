import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';
import type { Request } from 'express';

type ChallengeEntry = {
  challenge: string;
  userId: number | null;
  expiresAt: number;
};

const challenges = new Map<string, ChallengeEntry>();
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function pruneChallenges() {
  const now = Date.now();
  for (const [key, entry] of challenges) {
    if (entry.expiresAt <= now) challenges.delete(key);
  }
}

export function challengeKey(kind: 'reg' | 'auth', accountId: number, userId?: number | null) {
  return userId != null ? `${kind}:${accountId}:${userId}` : `${kind}:${accountId}`;
}

export function storeChallenge(
  key: string,
  challenge: string,
  userId: number | null = null,
) {
  pruneChallenges();
  challenges.set(key, {
    challenge,
    userId,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  });
}

export function takeChallenge(key: string): ChallengeEntry | null {
  pruneChallenges();
  const entry = challenges.get(key);
  if (!entry) return null;
  challenges.delete(key);
  if (entry.expiresAt <= Date.now()) return null;
  return entry;
}

/** Relying Party ID = hostname (no port). */
export function rpIDFromRequest(req: Request): string {
  const envRp = String(process.env.WEBAUTHN_RP_ID ?? '').trim();
  if (envRp) return envRp;
  const origin = String(req.get('origin') ?? '').trim();
  if (origin) {
    try {
      return new URL(origin).hostname;
    } catch {
      // fall through
    }
  }
  const host = String(req.get('x-forwarded-host') ?? req.get('host') ?? 'localhost')
    .split(',')[0]
    .trim();
  return host.replace(/:\d+$/, '') || 'localhost';
}

export function expectedOriginFromRequest(req: Request): string {
  const envOrigin = String(process.env.WEBAUTHN_ORIGIN ?? process.env.PUBLIC_APP_URL ?? '').trim();
  if (envOrigin) return envOrigin.replace(/\/$/, '');
  const origin = String(req.get('origin') ?? '').trim();
  if (origin) return origin.replace(/\/$/, '');
  const proto = String(req.get('x-forwarded-proto') ?? 'http').split(',')[0].trim() || 'http';
  const host = String(req.get('x-forwarded-host') ?? req.get('host') ?? 'localhost')
    .split(',')[0]
    .trim();
  return `${proto}://${host}`.replace(/\/$/, '');
}

export function rpName(): string {
  return String(process.env.WEBAUTHN_RP_NAME ?? 'SwimIT').trim() || 'SwimIT';
}

export function toBase64Url(buf: Buffer | Uint8Array): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function fromBase64Url(value: string): Buffer {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, 'base64');
}

export function normalizeTransports(value: unknown): AuthenticatorTransportFuture[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set([
    'ble',
    'cable',
    'hybrid',
    'internal',
    'nfc',
    'smart-card',
    'usb',
  ]);
  const out: AuthenticatorTransportFuture[] = [];
  for (const item of value) {
    const t = String(item ?? '').trim();
    if (allowed.has(t)) out.push(t as AuthenticatorTransportFuture);
  }
  return out;
}
