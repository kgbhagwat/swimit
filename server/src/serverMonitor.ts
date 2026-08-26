import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { apiTrafficSnapshot } from './apiTraffic.js';
import { pool } from './db/pool.js';
import { INDIA_SQL_TODAY, indiaDaysAgoIso, indiaTodayIso } from './indiaDate.js';
import { sessionPeakSnapshot } from './sessionPresence.js';

const SAMPLE_MS = 30_000;
const RETAIN_DAYS = 30;

export type LiveSample = {
  hostname: string;
  uptimeSeconds: number;
  processUptimeSeconds: number;
  cpuCount: number;
  startedAt: string;
  processStartedAt: string;
  sessions: {
    active: number;
    uniqueToday: number;
  };
  cpu: { percent: number; load1: number; load5: number; load15: number };
  memory: { usedBytes: number; totalBytes: number; freeBytes: number; percent: number };
  disk: { usedBytes: number; totalBytes: number; freeBytes: number; percent: number };
  process: { rssBytes: number; heapUsedBytes: number };
  postgres: {
    used: number;
    max: number;
    idle: number;
    waiting: number;
    total: number;
    percent: number;
  };
  api: {
    inBytesPerSec: number;
    outBytesPerSec: number;
    inBytesToday: number;
    outBytesToday: number;
    requestCountToday: number;
    avgDurationMs: number;
  };
};

export type DailyPeak = {
  day: string;
  samples: number;
  concurrentMax: number;
  concurrentMaxAt: string | null;
  uniqueUsers: number;
  cpuMaxPercent: number;
  cpuMaxLoad1: number;
  cpuMaxAt: string | null;
  ramMaxPercent: number;
  ramMaxBytes: number;
  ramTotalBytes: number;
  ramMaxAt: string | null;
  diskMaxPercent: number;
  diskMaxBytes: number;
  diskTotalBytes: number;
  diskMaxAt: string | null;
  nodeRssMaxBytes: number;
  nodeRssMaxAt: string | null;
  dbPoolUsedMax: number;
  dbPoolMax: number;
  dbPoolMaxAt: string | null;
  apiInBpsMax: number;
  apiInBytesTotal: number;
  apiInMaxAt: string | null;
  apiOutBpsMax: number;
  apiOutBytesTotal: number;
  apiOutMaxAt: string | null;
};

type CpuTimes = { idle: number; total: number; percent: number };

function readCpuTimes(): { idle: number; total: number } {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    const t = cpu.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total };
}

let cpuPrev: CpuTimes = { ...readCpuTimes(), percent: 0 };

function sampleCpuPercent() {
  const next = readCpuTimes();
  const idleDelta = next.idle - cpuPrev.idle;
  const totalDelta = next.total - cpuPrev.total;
  cpuPrev = {
    idle: next.idle,
    total: next.total,
    percent: num(
      totalDelta > 0 ? Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100)) : cpuPrev.percent,
    ),
  };
  return cpuPrev.percent;
}

function diskUsage() {
  const roots =
    process.platform === 'win32'
      ? [path.parse(process.cwd()).root || process.cwd()]
      : ['/', process.cwd()];
  for (const root of roots) {
    try {
      const stats = fs.statfsSync(root);
      const total = Number(stats.blocks) * Number(stats.bsize);
      const free = Number(stats.bavail) * Number(stats.bsize);
      if (!Number.isFinite(total) || !Number.isFinite(free) || !(total > 0)) continue;
      const used = Math.max(0, total - free);
      return {
        usedBytes: used,
        totalBytes: total,
        freeBytes: Math.max(0, free),
        percent: (used / total) * 100,
      };
    } catch {
      /* try next root */
    }
  }
  return { usedBytes: 0, totalBytes: 0, freeBytes: 0, percent: 0 };
}

function usagePercent(used: number, total: number) {
  if (!(total > 0)) return 0;
  return Math.max(0, Math.min(100, (used / total) * 100));
}

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function ts(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isoOrNull(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function peakAt(prevValue: number, prevAt: string | null, nextValue: number, nowIso: string) {
  if (nextValue > prevValue) return nowIso;
  return prevAt;
}

let flushedDay = '';
let flushedInBytes = 0;
let flushedOutBytes = 0;

function apiByteDeltas(inBytesToday: number, outBytesToday: number) {
  const day = indiaTodayIso();
  if (flushedDay !== day) {
    flushedDay = day;
    flushedInBytes = 0;
    flushedOutBytes = 0;
  }
  const inDelta = Math.max(0, inBytesToday - flushedInBytes);
  const outDelta = Math.max(0, outBytesToday - flushedOutBytes);
  flushedInBytes = inBytesToday;
  flushedOutBytes = outBytesToday;
  return { inDelta, outDelta };
}

export async function ensureServerMonitorTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS server_monitor_days (
      day DATE PRIMARY KEY,
      samples INT NOT NULL DEFAULT 0,
      concurrent_max INT NOT NULL DEFAULT 0,
      concurrent_max_at TIMESTAMPTZ,
      unique_users INT NOT NULL DEFAULT 0,
      cpu_max_percent DOUBLE PRECISION NOT NULL DEFAULT 0,
      cpu_max_load1 DOUBLE PRECISION NOT NULL DEFAULT 0,
      cpu_max_at TIMESTAMPTZ,
      ram_max_percent DOUBLE PRECISION NOT NULL DEFAULT 0,
      ram_max_bytes BIGINT NOT NULL DEFAULT 0,
      ram_total_bytes BIGINT NOT NULL DEFAULT 0,
      ram_max_at TIMESTAMPTZ,
      disk_max_percent DOUBLE PRECISION NOT NULL DEFAULT 0,
      disk_max_bytes BIGINT NOT NULL DEFAULT 0,
      disk_total_bytes BIGINT NOT NULL DEFAULT 0,
      disk_max_at TIMESTAMPTZ,
      node_rss_max_bytes BIGINT NOT NULL DEFAULT 0,
      node_rss_max_at TIMESTAMPTZ,
      db_pool_used_max INT NOT NULL DEFAULT 0,
      db_pool_max INT NOT NULL DEFAULT 0,
      db_pool_max_at TIMESTAMPTZ,
      api_in_bps_max DOUBLE PRECISION NOT NULL DEFAULT 0,
      api_in_bytes_total BIGINT NOT NULL DEFAULT 0,
      api_in_max_at TIMESTAMPTZ,
      api_out_bps_max DOUBLE PRECISION NOT NULL DEFAULT 0,
      api_out_bytes_total BIGINT NOT NULL DEFAULT 0,
      api_out_max_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function collectLiveSample(): Promise<LiveSample> {
  sampleCpuPercent();
  const hostUptime = os.uptime();
  const processUptime = process.uptime();
  const now = Date.now();
  const mem = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = Math.max(0, totalMem - freeMem);
  const load = os.loadavg();
  const poolMax = Number(pool.options.max ?? 10) || 10;
  const poolTotal = pool.totalCount;
  const poolIdle = pool.idleCount;
  const poolWaiting = pool.waitingCount;
  const poolUsed = Math.max(0, poolTotal - poolIdle);
  let active = 0;
  let uniqueToday = 0;
  try {
    const sessions = await pool.query<{ active: number; unique_today: number }>(
      `SELECT
         COUNT(*) FILTER (
           WHERE revoked_at IS NULL
             AND expires_at > NOW()
             AND last_seen_at > NOW() - INTERVAL '15 minutes'
         )::int AS active,
         COUNT(DISTINCT user_id) FILTER (
           WHERE user_id IS NOT NULL
             AND (last_seen_at AT TIME ZONE 'Asia/Kolkata')::date = ${INDIA_SQL_TODAY}
         )::int AS unique_today
       FROM auth_sessions`,
    );
    active = num(sessions.rows[0]?.active);
    uniqueToday = num(sessions.rows[0]?.unique_today);
  } catch (err) {
    console.error('[server-monitor] Session counts failed', err);
  }

  return {
    hostname: os.hostname(),
    uptimeSeconds: hostUptime,
    processUptimeSeconds: processUptime,
    cpuCount: os.cpus().length || 1,
    startedAt: new Date(now - hostUptime * 1000).toISOString(),
    processStartedAt: new Date(now - processUptime * 1000).toISOString(),
    sessions: {
      active,
      uniqueToday,
    },
    cpu: {
      percent: num(cpuPrev.percent),
      load1: num(load[0]),
      load5: num(load[1]),
      load15: num(load[2]),
    },
    memory: {
      usedBytes: num(usedMem),
      totalBytes: num(totalMem),
      freeBytes: num(freeMem),
      percent: usagePercent(usedMem, totalMem),
    },
    disk: diskUsage(),
    process: {
      rssBytes: num(mem.rss),
      heapUsedBytes: num(mem.heapUsed),
    },
    postgres: {
      used: num(poolUsed),
      max: num(poolMax, 10),
      idle: poolIdle,
      waiting: poolWaiting,
      total: poolTotal,
      percent: usagePercent(poolUsed, poolMax),
    },
    api: apiTrafficSnapshot(),
  };
}

function emptyPeak(day: string): DailyPeak {
  return {
    day,
    samples: 0,
    concurrentMax: 0,
    concurrentMaxAt: null,
    uniqueUsers: 0,
    cpuMaxPercent: 0,
    cpuMaxLoad1: 0,
    cpuMaxAt: null,
    ramMaxPercent: 0,
    ramMaxBytes: 0,
    ramTotalBytes: 0,
    ramMaxAt: null,
    diskMaxPercent: 0,
    diskMaxBytes: 0,
    diskTotalBytes: 0,
    diskMaxAt: null,
    nodeRssMaxBytes: 0,
    nodeRssMaxAt: null,
    dbPoolUsedMax: 0,
    dbPoolMax: 0,
    dbPoolMaxAt: null,
    apiInBpsMax: 0,
    apiInBytesTotal: 0,
    apiInMaxAt: null,
    apiOutBpsMax: 0,
    apiOutBytesTotal: 0,
    apiOutMaxAt: null,
  };
}

function mapPeakRow(row: Record<string, unknown>): DailyPeak {
  return {
    day: String(row.day ?? ''),
    samples: Number(row.samples ?? 0),
    concurrentMax: Number(row.concurrent_max ?? 0),
    concurrentMaxAt: isoOrNull(row.concurrent_max_at as string | Date | null),
    uniqueUsers: Number(row.unique_users ?? 0),
    cpuMaxPercent: Number(row.cpu_max_percent ?? 0),
    cpuMaxLoad1: Number(row.cpu_max_load1 ?? 0),
    cpuMaxAt: isoOrNull(row.cpu_max_at as string | Date | null),
    ramMaxPercent: Number(row.ram_max_percent ?? 0),
    ramMaxBytes: Number(row.ram_max_bytes ?? 0),
    ramTotalBytes: Number(row.ram_total_bytes ?? 0),
    ramMaxAt: isoOrNull(row.ram_max_at as string | Date | null),
    diskMaxPercent: Number(row.disk_max_percent ?? 0),
    diskMaxBytes: Number(row.disk_max_bytes ?? 0),
    diskTotalBytes: Number(row.disk_total_bytes ?? 0),
    diskMaxAt: isoOrNull(row.disk_max_at as string | Date | null),
    nodeRssMaxBytes: Number(row.node_rss_max_bytes ?? 0),
    nodeRssMaxAt: isoOrNull(row.node_rss_max_at as string | Date | null),
    dbPoolUsedMax: Number(row.db_pool_used_max ?? 0),
    dbPoolMax: Number(row.db_pool_max ?? 0),
    dbPoolMaxAt: isoOrNull(row.db_pool_max_at as string | Date | null),
    apiInBpsMax: Number(row.api_in_bps_max ?? 0),
    apiInBytesTotal: Number(row.api_in_bytes_total ?? 0),
    apiInMaxAt: isoOrNull(row.api_in_max_at as string | Date | null),
    apiOutBpsMax: Number(row.api_out_bps_max ?? 0),
    apiOutBytesTotal: Number(row.api_out_bytes_total ?? 0),
    apiOutMaxAt: isoOrNull(row.api_out_max_at as string | Date | null),
  };
}

async function writePeaks(live: LiveSample) {
  const day = indiaTodayIso();
  const nowIso = new Date().toISOString();
  const { inDelta, outDelta } = apiByteDeltas(live.api.inBytesToday, live.api.outBytesToday);
  const existing = await pool.query(`SELECT *, day::text AS day FROM server_monitor_days WHERE day = $1::date`, [
    day,
  ]);
  const prev = existing.rows[0] ? mapPeakRow(existing.rows[0] as Record<string, unknown>) : emptyPeak(day);

  const sampled = sessionPeakSnapshot();
  const concurrent = Math.max(live.sessions.active, sampled.peakToday);
  const next: DailyPeak = {
    day,
    samples: prev.samples + 1,
    concurrentMax: Math.max(prev.concurrentMax, concurrent),
    concurrentMaxAt:
      concurrent > prev.concurrentMax
        ? sampled.peakToday >= live.sessions.active
          ? sampled.peakAt ?? nowIso
          : nowIso
        : prev.concurrentMaxAt,
    uniqueUsers: Math.max(prev.uniqueUsers, live.sessions.uniqueToday),
    cpuMaxPercent: Math.max(prev.cpuMaxPercent, live.cpu.percent),
    cpuMaxLoad1: live.cpu.percent > prev.cpuMaxPercent ? live.cpu.load1 : prev.cpuMaxLoad1,
    cpuMaxAt: peakAt(prev.cpuMaxPercent, prev.cpuMaxAt, live.cpu.percent, nowIso),
    ramMaxPercent: Math.max(prev.ramMaxPercent, live.memory.percent),
    ramMaxBytes: Math.max(prev.ramMaxBytes, live.memory.usedBytes),
    ramTotalBytes: live.memory.totalBytes || prev.ramTotalBytes,
    ramMaxAt: peakAt(prev.ramMaxPercent, prev.ramMaxAt, live.memory.percent, nowIso),
    diskMaxPercent: Math.max(prev.diskMaxPercent, live.disk.percent),
    diskMaxBytes: Math.max(prev.diskMaxBytes, live.disk.usedBytes),
    diskTotalBytes: live.disk.totalBytes || prev.diskTotalBytes,
    diskMaxAt: peakAt(prev.diskMaxPercent, prev.diskMaxAt, live.disk.percent, nowIso),
    nodeRssMaxBytes: Math.max(prev.nodeRssMaxBytes, live.process.rssBytes),
    nodeRssMaxAt: peakAt(prev.nodeRssMaxBytes, prev.nodeRssMaxAt, live.process.rssBytes, nowIso),
    dbPoolUsedMax: Math.max(prev.dbPoolUsedMax, live.postgres.used),
    dbPoolMax: live.postgres.max || prev.dbPoolMax,
    dbPoolMaxAt: peakAt(prev.dbPoolUsedMax, prev.dbPoolMaxAt, live.postgres.used, nowIso),
    apiInBpsMax: Math.max(prev.apiInBpsMax, live.api.inBytesPerSec),
    apiInBytesTotal: prev.apiInBytesTotal + inDelta,
    apiInMaxAt: peakAt(prev.apiInBpsMax, prev.apiInMaxAt, live.api.inBytesPerSec, nowIso),
    apiOutBpsMax: Math.max(prev.apiOutBpsMax, live.api.outBytesPerSec),
    apiOutBytesTotal: prev.apiOutBytesTotal + outDelta,
    apiOutMaxAt: peakAt(prev.apiOutBpsMax, prev.apiOutMaxAt, live.api.outBytesPerSec, nowIso),
  };

  await pool.query(
    `INSERT INTO server_monitor_days (
       day, samples, concurrent_max, concurrent_max_at, unique_users,
       cpu_max_percent, cpu_max_load1, cpu_max_at,
       ram_max_percent, ram_max_bytes, ram_total_bytes, ram_max_at,
       disk_max_percent, disk_max_bytes, disk_total_bytes, disk_max_at,
       node_rss_max_bytes, node_rss_max_at,
       db_pool_used_max, db_pool_max, db_pool_max_at,
       api_in_bps_max, api_in_bytes_total, api_in_max_at,
       api_out_bps_max, api_out_bytes_total, api_out_max_at, updated_at
     ) VALUES (
       $1::date, $2, $3, $4, $5,
       $6, $7, $8,
       $9, $10, $11, $12,
       $13, $14, $15, $16,
       $17, $18,
       $19, $20, $21,
       $22, $23, $24,
       $25, $26, $27, NOW()
     )
     ON CONFLICT (day) DO UPDATE SET
       samples = EXCLUDED.samples,
       concurrent_max = EXCLUDED.concurrent_max,
       concurrent_max_at = EXCLUDED.concurrent_max_at,
       unique_users = EXCLUDED.unique_users,
       cpu_max_percent = EXCLUDED.cpu_max_percent,
       cpu_max_load1 = EXCLUDED.cpu_max_load1,
       cpu_max_at = EXCLUDED.cpu_max_at,
       ram_max_percent = EXCLUDED.ram_max_percent,
       ram_max_bytes = EXCLUDED.ram_max_bytes,
       ram_total_bytes = EXCLUDED.ram_total_bytes,
       ram_max_at = EXCLUDED.ram_max_at,
       disk_max_percent = EXCLUDED.disk_max_percent,
       disk_max_bytes = EXCLUDED.disk_max_bytes,
       disk_total_bytes = EXCLUDED.disk_total_bytes,
       disk_max_at = EXCLUDED.disk_max_at,
       node_rss_max_bytes = EXCLUDED.node_rss_max_bytes,
       node_rss_max_at = EXCLUDED.node_rss_max_at,
       db_pool_used_max = EXCLUDED.db_pool_used_max,
       db_pool_max = EXCLUDED.db_pool_max,
       db_pool_max_at = EXCLUDED.db_pool_max_at,
       api_in_bps_max = EXCLUDED.api_in_bps_max,
       api_in_bytes_total = EXCLUDED.api_in_bytes_total,
       api_in_max_at = EXCLUDED.api_in_max_at,
       api_out_bps_max = EXCLUDED.api_out_bps_max,
       api_out_bytes_total = EXCLUDED.api_out_bytes_total,
       api_out_max_at = EXCLUDED.api_out_max_at,
       updated_at = NOW()`,
    [
      next.day,
      num(next.samples),
      num(next.concurrentMax),
      ts(next.concurrentMaxAt),
      num(next.uniqueUsers),
      num(next.cpuMaxPercent),
      num(next.cpuMaxLoad1),
      ts(next.cpuMaxAt),
      num(next.ramMaxPercent),
      num(next.ramMaxBytes),
      num(next.ramTotalBytes),
      ts(next.ramMaxAt),
      num(next.diskMaxPercent),
      num(next.diskMaxBytes),
      num(next.diskTotalBytes),
      ts(next.diskMaxAt),
      num(next.nodeRssMaxBytes),
      ts(next.nodeRssMaxAt),
      num(next.dbPoolUsedMax),
      num(next.dbPoolMax),
      ts(next.dbPoolMaxAt),
      num(next.apiInBpsMax),
      num(next.apiInBytesTotal),
      ts(next.apiInMaxAt),
      num(next.apiOutBpsMax),
      num(next.apiOutBytesTotal),
      ts(next.apiOutMaxAt),
    ],
  );

  await pool.query(`DELETE FROM server_monitor_days WHERE day < $1::date`, [
    indiaDaysAgoIso(RETAIN_DAYS - 1),
  ]);
}

let persistQueue: Promise<void> = Promise.resolve();

function enqueuePersist(live: LiveSample) {
  const run = persistQueue.then(
    () => writePeaks(live),
    () => writePeaks(live),
  );
  persistQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function loadPeakHistory(): Promise<DailyPeak[]> {
  const { rows } = await pool.query(
    `SELECT *, day::text AS day
     FROM server_monitor_days
     WHERE day >= $1::date
     ORDER BY day DESC`,
    [indiaDaysAgoIso(RETAIN_DAYS - 1)],
  );
  return rows.map((row) => mapPeakRow(row as Record<string, unknown>));
}

export async function collectAndRecordServerStats() {
  const current = await collectLiveSample();
  let history: DailyPeak[] = [];
  try {
    await ensureServerMonitorTable();
    await enqueuePersist(current);
    history = await loadPeakHistory();
  } catch (err) {
    console.error('[server-monitor] Failed to persist or load daily peaks', err);
  }
  const today = history.find((row) => row.day === indiaTodayIso()) ?? emptyPeak(indiaTodayIso());
  return { current, today, history };
}

let sampler: ReturnType<typeof setInterval> | null = null;

/** Sample host metrics every 30s so daily peaks are recorded even if nobody has the page open. */
export function startServerMonitorSampler() {
  if (sampler) return;
  void collectAndRecordServerStats().catch((err) => {
    console.error('[server-monitor] Initial sample failed', err);
  });
  sampler = setInterval(() => {
    void collectAndRecordServerStats().catch((err) => {
      console.error('[server-monitor] Sample failed', err);
    });
  }, SAMPLE_MS);
  sampler.unref?.();
}
