import { useEffect, useState } from 'react';
import { indiaTodayIso } from './indiaDate';
import { useLanguage, useT } from './i18n';
import { PlatformPage } from './PlatformPage';
import { hasPlatformAccess } from './platformAccess';
import { getPlatformSession } from './platformSession';

type LiveStats = {
  hostname: string;
  uptimeSeconds: number;
  cpuCount: number;
  startedAt: string;
  sessions: { active: number; uniqueToday: number };
  cpu: { percent: number; load1: number; load5: number; load15: number };
  memory: { usedBytes: number; totalBytes: number; freeBytes: number; percent: number };
  disk: { usedBytes: number; totalBytes: number; freeBytes: number; percent: number };
  process: { rssBytes: number; heapUsedBytes: number };
  postgres: { used: number; max: number; idle?: number; waiting?: number };
  api: {
    inBytesPerSec: number;
    outBytesPerSec: number;
    inBytesToday?: number;
    outBytesToday?: number;
  };
};

type DailyPeak = {
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

type ServerStats = {
  current: LiveStats;
  today: DailyPeak;
  history: DailyPeak[];
};

const POLL_MS = 30_000;
const STATS_PATH = '/api/platform/server-stats';

function formatUptime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours || days) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  return parts.join(' ');
}

function formatBytes(value: number) {
  const n = Math.max(0, Number(value) || 0);
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatRate(bytesPerSec: number) {
  const n = Math.max(0, Number(bytesPerSec) || 0);
  if (n < 1024) return `${n < 10 ? n.toFixed(1) : Math.round(n)} B/s`;
  return `${(n / 1024).toFixed(1)} KB/s`;
}

function clampPercent(value: number) {
  const n = Number(value) || 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function formatWhen(iso: string | null | undefined, locale: string) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(locale, {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'numeric',
    year: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

function formatTime(iso: string | null | undefined, locale: string) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(locale, {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

function formatDayLabel(day: string, locale: string, today: string, todayWord: string) {
  const date = new Date(`${day}T12:00:00+05:30`);
  const label = Number.isNaN(date.getTime())
    ? day
    : date.toLocaleDateString(locale, {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
  return day === today ? `${label} — ${todayWord}` : label;
}

function MetricBar({ percent }: { percent: number }) {
  const width = clampPercent(percent);
  return (
    <div className="server-monitor-bar" aria-hidden>
      <span className="server-monitor-bar-fill" style={{ width: `${width}%` }} />
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  extra,
  percent,
}: {
  label: string;
  value: string;
  detail?: string;
  extra?: string;
  percent?: number;
}) {
  return (
    <article className="server-monitor-card">
      <p className="server-monitor-card-label">{label}</p>
      <p className="server-monitor-card-value">{value}</p>
      {detail ? <p className="server-monitor-card-detail">{detail}</p> : null}
      {percent != null ? <MetricBar percent={percent} /> : null}
      {extra ? <p className="server-monitor-card-extra">{extra}</p> : null}
    </article>
  );
}

function PeakCell({
  value,
  at,
  locale,
}: {
  value: string;
  at?: string | null;
  locale: string;
}) {
  return (
    <div className="server-monitor-peak-cell">
      <strong>{value}</strong>
      {at ? <span>{formatTime(at, locale)}</span> : null}
    </div>
  );
}

export function ServerMonitor() {
  const t = useT();
  const { lang } = useLanguage();
  const locale = lang === 'mr' ? 'mr-IN' : 'en-IN';
  const session = getPlatformSession();
  const canView = Boolean(
    session && hasPlatformAccess(session.menuAccess, 'server-monitor', session.isAccountAdmin),
  );
  const [data, setData] = useState<ServerStats | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(STATS_PATH);
        const body = (await res.json().catch(() => ({}))) as ServerStats & {
          error?: string;
          detail?: string;
          current?: LiveStats;
        };
        if (!res.ok) {
          throw new Error(
            [body.error, body.detail].filter(Boolean).join(': ') ||
              `Failed to load server stats (${res.status})`,
          );
        }
        if (!body.current) {
          throw new Error(body.error || 'Failed to load server stats');
        }
        if (!cancelled) {
          setData({
            current: body.current,
            today: body.today,
            history: Array.isArray(body.history) ? body.history : [],
          });
          setUpdatedAt(new Date().toISOString());
          setError('');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load server stats');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [canView]);

  if (!canView) {
    return (
      <PlatformPage title="Server">
        <p className="error">{t('Your user account does not have access to this feature')}</p>
      </PlatformPage>
    );
  }

  const current = data?.current;
  const today = data?.today;
  const history = data?.history ?? [];
  const todayIso = indiaTodayIso();

  return (
    <PlatformPage title="Server">
      <div className="server-monitor-toolbar">
        <p className="server-monitor-api">
          {t('API')}: {STATS_PATH}
        </p>
        <p className="muted server-monitor-refresh">{t('Auto-updates every 30 seconds')}</p>
      </div>

      {error ? <p className="error">{t(error)}</p> : null}
      {loading && !data ? <p className="muted">{t('Loading…')}</p> : null}

      {current ? (
        <>
          <p className="server-monitor-host">
            <strong>{current.hostname}</strong>
            <span>
              {t('Running')}: {formatUptime(current.uptimeSeconds)}
            </span>
            <span>
              {current.cpuCount} {t('CPU')}
            </span>
            <span>
              {t('Started')}: {formatWhen(current.startedAt, locale)}
            </span>
          </p>

          <div className="server-monitor-section-head">
            <h2>{t('Current stats')}</h2>
            <p className="muted">
              {updatedAt
                ? `${t('Updated')}: ${formatWhen(updatedAt, locale)}`
                : t('Auto-updates every 30 seconds')}
            </p>
          </div>
          <div className="server-monitor-grid">
            <MetricCard
              label={t('Concurrent users')}
              value={String(current.sessions.active)}
              detail={t('People online now')}
            />
            <MetricCard
              label={t('Total logins today')}
              value={String(current.sessions.uniqueToday)}
              detail={t('Unique users who accessed today')}
            />
            <MetricCard
              label={t('CPU')}
              value={`${clampPercent(current.cpu.percent).toFixed(0)}%`}
              detail={`load 1 ${Number(current.cpu.load1 || 0).toFixed(2)}`}
              percent={current.cpu.percent}
            />
            <MetricCard
              label={t('RAM')}
              value={`${clampPercent(current.memory.percent).toFixed(0)}% • ${formatBytes(current.memory.usedBytes)}`}
              detail={`${t('free')} ${formatBytes(current.memory.freeBytes)}`}
              percent={current.memory.percent}
            />
            <MetricCard
              label={t('Disk')}
              value={`${clampPercent(current.disk.percent).toFixed(1)}%`}
              detail={`${formatBytes(current.disk.usedBytes)} / ${formatBytes(current.disk.totalBytes)}`}
              percent={current.disk.percent}
            />
            <MetricCard
              label={t('Node API')}
              value={formatBytes(current.process.rssBytes)}
              detail={`${t('heap')} ${formatBytes(current.process.heapUsedBytes)}`}
            />
            <MetricCard
              label={t('DB pool (active)')}
              value={`${current.postgres.used} / ${current.postgres.max}`}
              detail={
                current.postgres.idle != null
                  ? `${t('Idle')} ${current.postgres.idle}`
                  : undefined
              }
              percent={
                current.postgres.max ? (current.postgres.used / current.postgres.max) * 100 : 0
              }
            />
            <MetricCard
              label={t('Incoming API')}
              value={formatRate(current.api.inBytesPerSec)}
              detail={`${t('Total')} ${formatBytes(current.api.inBytesToday ?? 0)}`}
            />
            <MetricCard
              label={t('Outgoing API')}
              value={formatRate(current.api.outBytesPerSec)}
              detail={`${t('Total')} ${formatBytes(current.api.outBytesToday ?? 0)}`}
            />
          </div>
        </>
      ) : null}

      {today ? (
        <>
          <div className="server-monitor-section-head">
            <h2>{t("Today's peak usage")}</h2>
            <p className="muted">{formatDayLabel(today.day || todayIso, locale, todayIso, t('Today'))}</p>
          </div>
          <div className="server-monitor-grid">
            <MetricCard
              label={t('Concurrent users max')}
              value={String(today.concurrentMax)}
              detail={t('People online at once — same person signing in again still counts as 1')}
              extra={
                today.concurrentMaxAt
                  ? `${t('Time')}: ${formatWhen(today.concurrentMaxAt, locale)}`
                  : undefined
              }
            />
            <MetricCard
              label={t('Total logins today')}
              value={String(today.uniqueUsers)}
              detail={t('Unique users who accessed today')}
            />
            <MetricCard
              label={t('CPU max')}
              value={`${clampPercent(today.cpuMaxPercent).toFixed(0)}%`}
              detail={`load 1 ${today.cpuMaxLoad1.toFixed(2)}`}
              extra={
                today.cpuMaxAt ? `${t('Time')}: ${formatWhen(today.cpuMaxAt, locale)}` : undefined
              }
              percent={today.cpuMaxPercent}
            />
            <MetricCard
              label={t('RAM max')}
              value={`${clampPercent(today.ramMaxPercent).toFixed(0)}% • ${formatBytes(today.ramMaxBytes)}`}
              extra={
                today.ramMaxAt ? `${t('Time')}: ${formatWhen(today.ramMaxAt, locale)}` : undefined
              }
              percent={today.ramMaxPercent}
            />
            <MetricCard
              label={t('Disk max')}
              value={`${clampPercent(today.diskMaxPercent).toFixed(1)}%`}
              extra={
                today.diskMaxAt ? `${t('Time')}: ${formatWhen(today.diskMaxAt, locale)}` : undefined
              }
              percent={today.diskMaxPercent}
            />
            <MetricCard
              label={t('Node API max')}
              value={formatBytes(today.nodeRssMaxBytes)}
              extra={
                today.nodeRssMaxAt
                  ? `${t('Time')}: ${formatWhen(today.nodeRssMaxAt, locale)}`
                  : undefined
              }
            />
            <MetricCard
              label={t('DB pool max (active)')}
              value={`${today.dbPoolUsedMax} / ${today.dbPoolMax}`}
              extra={
                today.dbPoolMaxAt
                  ? `${t('Time')}: ${formatWhen(today.dbPoolMaxAt, locale)}`
                  : undefined
              }
              percent={today.dbPoolMax ? (today.dbPoolUsedMax / today.dbPoolMax) * 100 : 0}
            />
            <MetricCard
              label={t('Incoming API max')}
              value={formatRate(today.apiInBpsMax)}
              detail={`${t('Total')} ${formatBytes(today.apiInBytesTotal)}`}
              extra={
                today.apiInMaxAt
                  ? `${t('Time')}: ${formatWhen(today.apiInMaxAt, locale)}`
                  : undefined
              }
            />
            <MetricCard
              label={t('Outgoing API max')}
              value={formatRate(today.apiOutBpsMax)}
              detail={`${t('Total')} ${formatBytes(today.apiOutBytesTotal)}`}
              extra={
                today.apiOutMaxAt
                  ? `${t('Time')}: ${formatWhen(today.apiOutMaxAt, locale)}`
                  : undefined
              }
            />
          </div>
        </>
      ) : null}

      {history.length > 0 ? (
        <section className="server-monitor-history">
          <div className="server-monitor-section-head">
            <h2>{t('Daily peak usage (last 30 days)')}</h2>
          </div>
          <div className="server-monitor-history-wrap">
            <table className="server-monitor-history-table">
              <thead>
                <tr>
                  <th>{t('Date')}</th>
                  <th>{t('Concurrent max')}</th>
                  <th>{t('Today total')}</th>
                  <th>{t('CPU max')}</th>
                  <th>{t('RAM max')}</th>
                  <th>{t('Disk max')}</th>
                  <th>{t('Node API max')}</th>
                  <th>{t('DB pool max')}</th>
                  <th>{t('API incoming')}</th>
                  <th>{t('API outgoing')}</th>
                  <th>{t('Samples')}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.day} className={row.day === todayIso ? 'is-today' : undefined}>
                    <td>{formatDayLabel(row.day, locale, todayIso, t('Today'))}</td>
                    <td>
                      <PeakCell
                        value={String(row.concurrentMax)}
                        at={row.concurrentMaxAt}
                        locale={locale}
                      />
                    </td>
                    <td>{row.uniqueUsers}</td>
                    <td>
                      <PeakCell
                        value={`${clampPercent(row.cpuMaxPercent).toFixed(0)}%`}
                        at={row.cpuMaxAt}
                        locale={locale}
                      />
                    </td>
                    <td>
                      <PeakCell
                        value={`${clampPercent(row.ramMaxPercent).toFixed(0)}% • ${formatBytes(row.ramMaxBytes)}`}
                        at={row.ramMaxAt}
                        locale={locale}
                      />
                    </td>
                    <td>
                      <PeakCell
                        value={`${clampPercent(row.diskMaxPercent).toFixed(1)}%`}
                        at={row.diskMaxAt}
                        locale={locale}
                      />
                    </td>
                    <td>
                      <PeakCell
                        value={formatBytes(row.nodeRssMaxBytes)}
                        at={row.nodeRssMaxAt}
                        locale={locale}
                      />
                    </td>
                    <td>
                      <PeakCell
                        value={`${row.dbPoolUsedMax} / ${row.dbPoolMax}`}
                        at={row.dbPoolMaxAt}
                        locale={locale}
                      />
                    </td>
                    <td>
                      <PeakCell
                        value={`${formatRate(row.apiInBpsMax)} • ${formatBytes(row.apiInBytesTotal)}`}
                        at={row.apiInMaxAt}
                        locale={locale}
                      />
                    </td>
                    <td>
                      <PeakCell
                        value={`${formatRate(row.apiOutBpsMax)} • ${formatBytes(row.apiOutBytesTotal)}`}
                        at={row.apiOutMaxAt}
                        locale={locale}
                      />
                    </td>
                    <td>{row.samples}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </PlatformPage>
  );
}
