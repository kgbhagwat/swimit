import type { NextFunction, Request, Response } from 'express';
import { indiaTodayIso } from './indiaDate.js';

const WINDOW_MS = 10_000;

type WindowSample = { t: number; inBytes: number; outBytes: number };

let dayKey = '';
let dayInBytes = 0;
let dayOutBytes = 0;
let dayCount = 0;
let dayDurationMs = 0;
let windowSamples: WindowSample[] = [];

function rollDay() {
  const today = indiaTodayIso();
  if (dayKey === today) return;
  dayKey = today;
  dayInBytes = 0;
  dayOutBytes = 0;
  dayCount = 0;
  dayDurationMs = 0;
}

function chunkSize(chunk: unknown): number {
  if (chunk == null) return 0;
  if (typeof chunk === 'string') return Buffer.byteLength(chunk);
  if (Buffer.isBuffer(chunk)) return chunk.length;
  if (chunk instanceof Uint8Array) return chunk.byteLength;
  return 0;
}

export function recordApiCall(inBytes: number, outBytes: number, durationMs: number) {
  rollDay();
  const now = Date.now();
  const inn = Math.max(0, Math.floor(inBytes));
  const out = Math.max(0, Math.floor(outBytes));
  dayInBytes += inn;
  dayOutBytes += out;
  dayCount += 1;
  dayDurationMs += Math.max(0, durationMs);
  windowSamples.push({ t: now, inBytes: inn, outBytes: out });
  const cutoff = now - WINDOW_MS;
  if (windowSamples.length > 400 || (windowSamples[0] && windowSamples[0].t < cutoff)) {
    windowSamples = windowSamples.filter((sample) => sample.t >= cutoff);
  }
}

export function apiTrafficSnapshot() {
  rollDay();
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  windowSamples = windowSamples.filter((sample) => sample.t >= cutoff);
  const inSum = windowSamples.reduce((sum, sample) => sum + sample.inBytes, 0);
  const outSum = windowSamples.reduce((sum, sample) => sum + sample.outBytes, 0);
  const windowSec = WINDOW_MS / 1000;
  return {
    inBytesPerSec: inSum / windowSec,
    outBytesPerSec: outSum / windowSec,
    inBytesToday: dayInBytes,
    outBytesToday: dayOutBytes,
    requestCountToday: dayCount,
    avgDurationMs: dayCount ? dayDurationMs / dayCount : 0,
  };
}

/** Counts SwimIT `/api` bytes and latency only — not static files or `/uploads`. */
export function apiTrafficMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();
  const inBytes = Number(req.headers['content-length'] ?? 0) || 0;
  let outBytes = 0;
  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);

  res.write = ((chunk: unknown, encoding?: unknown, cb?: unknown) => {
    outBytes += chunkSize(chunk);
    return originalWrite(chunk as never, encoding as never, cb as never);
  }) as Response['write'];

  res.end = ((chunk?: unknown, encoding?: unknown, cb?: unknown) => {
    outBytes += chunkSize(chunk);
    return originalEnd(chunk as never, encoding as never, cb as never);
  }) as Response['end'];

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    recordApiCall(inBytes, outBytes, durationMs);
  });
  next();
}
