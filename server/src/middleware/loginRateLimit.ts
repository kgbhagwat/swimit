import type { Request } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

const RATE_LIMIT_MESSAGE = {
  error: 'Too many login attempts. Please wait and try again.',
};

function boundedKeyPart(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .slice(0, 80);
}

function clientIpKey(req: Request) {
  return ipKeyGenerator(req.ip || req.socket.remoteAddress || 'unknown');
}

function loginKey(req: Request) {
  const ip = clientIpKey(req);
  const code = boundedKeyPart(req.params.code);
  const user = boundedKeyPart((req.body as { userName?: unknown } | undefined)?.userName);
  return `${ip}:${code}:${user}`;
}

/** Stops very fast automated bursts, including attempts that eventually succeed. */
export const loginBurstLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: loginKey,
  message: RATE_LIMIT_MESSAGE,
});

/** Longer lockout for repeated failed password attempts. */
export const failedLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: loginKey,
  skipSuccessfulRequests: true,
  message: RATE_LIMIT_MESSAGE,
});

/** Biometric login uses two calls per attempt (options + verification). */
export const biometricLoginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) =>
    `${clientIpKey(req)}:${boundedKeyPart(req.params.code)}:biometric`,
  message: RATE_LIMIT_MESSAGE,
});

export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) =>
    `${clientIpKey(req)}:${boundedKeyPart(req.params.code)}:password-reset`,
  message: {
    error: 'Too many password reset attempts. Please wait and try again.',
  },
});

export const authEnrollmentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) =>
    `${clientIpKey(req)}:${boundedKeyPart(req.params.code)}:security-settings`,
  message: RATE_LIMIT_MESSAGE,
});

export const captchaLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: 'Too many security-code requests. Please wait and try again.',
  },
});

