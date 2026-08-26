import { indiaTodayIso } from './indiaDate.js';

const ACTIVE_MS = 15 * 60 * 1000;

const lastSeen = new Map<string, number>();
let peakDay = '';
let peakCount = 0;
let peakAt: string | null = null;

function prune(now: number) {
  const cutoff = now - ACTIVE_MS;
  for (const [id, seen] of lastSeen) {
    if (seen < cutoff) lastSeen.delete(id);
  }
}

function noteCount(count: number) {
  const day = indiaTodayIso();
  if (peakDay !== day) {
    peakDay = day;
    peakCount = count;
    peakAt = count > 0 ? new Date().toISOString() : null;
    return;
  }
  if (count > peakCount) {
    peakCount = count;
    peakAt = new Date().toISOString();
  }
}

/** Sample concurrent sessions on each authenticated API call (in-process, resets on restart). */
export function noteLiveSession(sessionId: string) {
  const id = String(sessionId ?? '').trim();
  if (!id) return;
  const now = Date.now();
  lastSeen.set(id, now);
  prune(now);
  noteCount(lastSeen.size);
}

export function noteConcurrentCount(count: number) {
  noteCount(Math.max(0, Math.floor(count)));
}

export function sessionPeakSnapshot() {
  prune(Date.now());
  const day = indiaTodayIso();
  if (peakDay !== day) {
    peakDay = day;
    peakCount = lastSeen.size;
    peakAt = lastSeen.size > 0 ? new Date().toISOString() : null;
  }
  return {
    sampled: lastSeen.size,
    peakToday: peakCount,
    peakAt,
  };
}
