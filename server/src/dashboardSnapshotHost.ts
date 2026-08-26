import { existsSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { pool } from './db/pool.js';
import {
  buildDashboardSnapshot,
  type DashboardSnapshot,
} from './dashboardSnapshot.js';
import { indiaTodayIso } from './indiaDate.js';

const CACHE_MS_TODAY = 20_000;
const CACHE_MS_PAST = 5 * 60_000;
const WORKER_TIMEOUT_MS = 20_000;

type Pending = {
  resolve: (value: DashboardSnapshot) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type CacheEntry = {
  snapshot: DashboardSnapshot;
  expiresAt: number;
};

type WorkerResult =
  | { type: 'result'; id: number; ok: true; snapshot: DashboardSnapshot }
  | { type: 'result'; id: number; ok: false; error: string };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<DashboardSnapshot>>();
let starting = false;

function cacheKey(accountId: number, asOf: string) {
  return `${accountId}:${asOf}`;
}

function cacheTtlMs(asOf: string) {
  return asOf === indiaTodayIso() ? CACHE_MS_TODAY : CACHE_MS_PAST;
}

function workerFilename() {
  const js = fileURLToPath(new URL('./dashboardSnapshotWorker.js', import.meta.url));
  const ts = fileURLToPath(new URL('./dashboardSnapshotWorker.ts', import.meta.url));
  if (existsSync(js)) return js;
  if (existsSync(ts)) return ts;
  return js;
}

function failAll(err: Error) {
  for (const item of pending.values()) {
    clearTimeout(item.timer);
    item.reject(err);
  }
  pending.clear();
}

function attachWorker(next: Worker) {
  next.on('message', (message: WorkerResult) => {
    if (!message || message.type !== 'result') return;
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id);
    clearTimeout(item.timer);
    if (message.ok) item.resolve(message.snapshot);
    else item.reject(new Error(message.error || 'Dashboard snapshot failed'));
  });
  next.on('error', (err) => {
    console.error('[dashboard-snapshot] Worker error', err);
    failAll(err instanceof Error ? err : new Error(String(err)));
  });
  next.on('exit', (code) => {
    if (worker === next) worker = null;
    if (code !== 0) {
      failAll(new Error(`Dashboard snapshot worker exited (${code})`));
      console.warn('[dashboard-snapshot] Worker exited; will restart on next request');
    }
  });
}

function workerExecArgv() {
  if (!workerFilename().endsWith('.ts')) return [];
  const argv = process.execArgv.filter((arg) => arg !== 'watch' && arg !== '--watch');
  if (argv.length > 0) return argv;
  return ['--import', 'tsx'];
}

export function startDashboardSnapshotWorker() {
  if (worker || starting) return;
  starting = true;
  try {
    worker = new Worker(workerFilename(), {
      execArgv: workerExecArgv(),
    });
    attachWorker(worker);
    console.log('[dashboard-snapshot] Worker started');
  } catch (err) {
    worker = null;
    console.error('[dashboard-snapshot] Failed to start worker', err);
  } finally {
    starting = false;
  }
}

function ensureWorker() {
  if (!worker) startDashboardSnapshotWorker();
  return worker;
}

function askWorker(accountId: number, asOf: string): Promise<DashboardSnapshot> {
  const thread = ensureWorker();
  if (!thread) {
    return Promise.reject(new Error('Dashboard snapshot worker is not running'));
  }
  const id = nextId;
  nextId += 1;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Dashboard snapshot timed out'));
    }, WORKER_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    thread.postMessage({ type: 'build', id, accountId, asOf });
  });
}

async function computeSnapshot(accountId: number, asOf: string): Promise<DashboardSnapshot> {
  try {
    return await askWorker(accountId, asOf);
  } catch (err) {
    console.warn('[dashboard-snapshot] Worker unavailable, building in-process', err);
    return buildDashboardSnapshot(pool, accountId, asOf);
  }
}

export function getDashboardSnapshot(accountId: number, asOf: string): Promise<DashboardSnapshot> {
  const key = cacheKey(accountId, asOf);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.snapshot);
  }
  const existing = inflight.get(key);
  if (existing) return existing;

  const run = computeSnapshot(accountId, asOf)
    .then((snapshot) => {
      cache.set(key, { snapshot, expiresAt: Date.now() + cacheTtlMs(asOf) });
      return snapshot;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, run);
  return run;
}
