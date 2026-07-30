import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const ENC_PREFIX = 'enc:v1:';

function resolveKey(): Buffer | null {
  const raw = String(process.env.PII_ENCRYPTION_KEY ?? '').trim();
  if (!raw) return null;
  // Accept 64-char hex (32 bytes) or any passphrase (hashed to 32 bytes).
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  return createHash('sha256').update(raw).digest();
}

let warnedMissingKey = false;

export function piiEncryptionEnabled() {
  return Boolean(resolveKey());
}

function requireKey(): Buffer {
  const key = resolveKey();
  if (key) return key;
  if (!warnedMissingKey) {
    warnedMissingKey = true;
    console.warn(
      '[pii] PII_ENCRYPTION_KEY is not set — birthdate and identity proof will be stored in plaintext. Set a long secret or 64-char hex key in .env.',
    );
  }
  throw new Error('PII_ENCRYPTION_KEY is not configured');
}

export function isEncryptedValue(value: unknown) {
  return String(value ?? '').startsWith(ENC_PREFIX);
}

/** Encrypt a UTF-8 string. Returns plaintext unchanged if encryption key is missing. */
export function encryptString(plaintext: string): string {
  const value = String(plaintext ?? '');
  if (!value) return value;
  if (isEncryptedValue(value)) return value;
  const key = resolveKey();
  if (!key) {
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      console.warn(
        '[pii] PII_ENCRYPTION_KEY is not set — storing sensitive fields in plaintext until configured.',
      );
    }
    return value;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

/** Decrypt a value produced by encryptString. Plaintext values pass through. */
export function decryptString(stored: unknown): string {
  const value = String(stored ?? '');
  if (!value) return '';
  if (!isEncryptedValue(value)) return value;
  const key = requireKey();
  const body = value.slice(ENC_PREFIX.length);
  const [ivB64, tagB64, dataB64] = body.split(':');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid encrypted value');
  }
  const iv = Buffer.from(ivB64, 'base64url');
  const tag = Buffer.from(tagB64, 'base64url');
  const data = Buffer.from(dataB64, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function normalizeBirthdate(value: unknown): string {
  const raw = decryptString(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return raw;
}

export function isAdultBirthdate(isoDate: string): boolean {
  const birth = new Date(`${String(isoDate).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return false;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age >= 18;
}

export function sealBirthdate(isoDate: string): { sealed: string; isAdult: boolean } {
  const normalized = String(isoDate ?? '').trim().slice(0, 10);
  return {
    sealed: encryptString(normalized),
    isAdult: isAdultBirthdate(normalized),
  };
}

export function sealIdentityDocument(docType: string): string {
  return encryptString(String(docType ?? '').trim());
}

export function revealIdentityDocument(stored: unknown): string {
  try {
    return decryptString(stored);
  } catch (err) {
    console.warn('[pii] identity document decrypt failed', err);
    return '';
  }
}

export function isSealedUploadPath(filename: string) {
  return String(filename ?? '').endsWith('.enc');
}

/** Encrypt an uploaded file in place → `<name>.enc` and delete the plaintext original. */
export async function sealUploadFile(uploadDir: string, filename: string): Promise<string> {
  const name = String(filename ?? '').trim();
  if (!name) return name;
  if (isSealedUploadPath(name)) return name;

  const key = resolveKey();
  if (!key) {
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      console.warn(
        '[pii] PII_ENCRYPTION_KEY is not set — identity proof files stay as plaintext until configured.',
      );
    }
    return name;
  }

  const sourcePath = path.join(uploadDir, name);
  const sealedName = `${name}.enc`;
  const destPath = path.join(uploadDir, sealedName);
  const plaintext = await fs.readFile(sourcePath);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  // File format: iv(12) + tag(16) + ciphertext
  await fs.writeFile(destPath, Buffer.concat([iv, tag, encrypted]));
  await fs.unlink(sourcePath).catch(() => undefined);
  return sealedName;
}

export async function openSealedUploadFile(uploadDir: string, filename: string): Promise<Buffer> {
  const name = String(filename ?? '').trim();
  const abs = path.join(uploadDir, name);
  const raw = await fs.readFile(abs);
  if (!isSealedUploadPath(name)) {
    return raw;
  }
  const key = requireKey();
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

export function guessImageContentType(filename: string) {
  const lower = String(filename ?? '').toLowerCase().replace(/\.enc$/i, '');
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}
