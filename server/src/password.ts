import { randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

export const PASSWORD_POLICY_MSG =
  'Password must be at least 8 characters with at least 1 letter and 1 number';

/** Returns an error message when the password fails policy; otherwise null. */
export function passwordPolicyError(password: string): string | null {
  const value = String(password ?? '');
  if (value.length < 8) return PASSWORD_POLICY_MSG;
  if (!/[A-Za-z]/.test(value)) return PASSWORD_POLICY_MSG;
  if (!/\d/.test(value)) return PASSWORD_POLICY_MSG;
  return null;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [salt, hashHex] = String(storedHash ?? '').split(':');
  if (!salt || !hashHex) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hashHex, 'hex');
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/**
 * Temporary password shown once at account/user creation.
 * Always meets policy: length ≥ 8, ≥1 letter, ≥1 number.
 */
export function generateTempPassword(length = 8) {
  const size = Math.max(8, length);
  const letters = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const alphabet = letters + digits;
  const chars: string[] = [];
  chars.push(letters[randomInt(letters.length)]!);
  chars.push(digits[randomInt(digits.length)]!);
  const bytes = randomBytes(size - 2);
  for (let i = 0; i < size - 2; i += 1) {
    chars.push(alphabet[bytes[i]! % alphabet.length]!);
  }
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    const tmp = chars[i]!;
    chars[i] = chars[j]!;
    chars[j] = tmp;
  }
  return chars.join('');
}
