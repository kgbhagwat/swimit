export const INDIA_TIME_ZONE = 'Asia/Kolkata';

/** Calendar date in India as YYYY-MM-DD. */
export function indiaTodayIso(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: INDIA_TIME_ZONE });
}

export function indiaDaysAgoIso(days: number, now = new Date()): string {
  const [year, month, day] = indiaTodayIso(now).split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day - days));
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const d = String(utc.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
