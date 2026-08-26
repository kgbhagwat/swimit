/** Race time as mm:ss:ms (minutes, seconds, 2-digit milliseconds). */

function twoDigitMs(raw: string) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length <= 2) return digits.padStart(2, '0');
  return String(Math.min(99, Math.floor(Number(digits.slice(0, 3)) / 10))).padStart(2, '0');
}

export function sanitizeRaceTimeInput(value: string) {
  const digits = value.replace(/[^\d]/g, '').slice(0, 6);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, digits.length - 2)}:${digits.slice(-2)}`;
  const head = digits.slice(0, 4);
  return `${head.slice(0, 2)}:${head.slice(2)}:${digits.slice(4)}`;
}

export function normalizeRaceTimeText(value: string) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const full = raw.match(/^(\d{1,2}):([0-5]\d):(\d{1,3})$/);
  if (full) {
    return `${String(Number(full[1])).padStart(2, '0')}:${full[2]}:${twoDigitMs(full[3])}`;
  }
  const legacy = raw.match(/^(\d{1,2}):([0-5]\d)$/);
  if (legacy) {
    return `${String(Number(legacy[1])).padStart(2, '0')}:${legacy[2]}:00`;
  }
  return null;
}

export function raceTimeToMs(value: string) {
  const normalized = normalizeRaceTimeText(value);
  if (!normalized) return null;
  const [minutes, seconds, hundredths] = normalized.split(':').map(Number);
  return minutes * 60_000 + seconds * 1000 + hundredths * 10;
}
