/**
 * Password login: captcha only after several failed attempts for the same
 * IP + account + login id. Biometric login never uses this gate.
 */

const CAPTCHA_AFTER_FAILURES = 3;
const FAILURE_TTL_MS = 15 * 60 * 1000;

type FailureEntry = {
  count: number;
  expiresAt: number;
};

const failures = new Map<string, FailureEntry>();

function pruneFailures() {
  const now = Date.now();
  for (const [key, entry] of failures) {
    if (entry.expiresAt <= now) failures.delete(key);
  }
}

export function loginCaptchaKey(params: {
  ip: string;
  accountCode: string;
  userName: string;
}) {
  const ip = String(params.ip ?? '')
    .trim()
    .toLowerCase()
    .slice(0, 80);
  const accountCode = String(params.accountCode ?? '')
    .trim()
    .toLowerCase()
    .slice(0, 12);
  const userName = String(params.userName ?? '')
    .trim()
    .toLowerCase()
    .slice(0, 80);
  return `${ip}:${accountCode}:${userName || 'admin'}`;
}

export function isLoginCaptchaRequired(key: string) {
  pruneFailures();
  const entry = failures.get(key);
  if (!entry) return false;
  if (entry.expiresAt <= Date.now()) {
    failures.delete(key);
    return false;
  }
  return entry.count >= CAPTCHA_AFTER_FAILURES;
}

/** Record a failed password attempt. Returns whether captcha is now required. */
export function recordLoginFailure(key: string) {
  pruneFailures();
  const now = Date.now();
  const existing = failures.get(key);
  const count = (existing && existing.expiresAt > now ? existing.count : 0) + 1;
  failures.set(key, { count, expiresAt: now + FAILURE_TTL_MS });
  return count >= CAPTCHA_AFTER_FAILURES;
}

export function clearLoginFailures(key: string) {
  failures.delete(key);
}

export const LOGIN_CAPTCHA_AFTER_FAILURES = CAPTCHA_AFTER_FAILURES;
