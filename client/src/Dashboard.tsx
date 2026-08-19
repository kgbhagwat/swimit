import { useEffect, useState } from 'react';
import { isApplicationDemo } from './applicationDemo';
import { useT } from './i18n';
import { PlatformPage } from './PlatformPage';

type NamedCount = { name: string; count: number };

type WaterQualityPoint = {
  recordDate: string;
  phLevel: number;
  freeChlorine: number;
  totalAlkalinity: number;
  calciumHardness: number;
};

type DashboardData = {
  asOf: string;
  poolName: string;
  city: string;
  summary: {
    activeUsers: number;
    activeSwimmers: number;
    presentToday: number;
    expiringSoon: number;
    expiryNoticeDays: number;
    newAdmissionsToday: number;
  };
  paymentsToday: {
    cash: number;
    online: number;
    total: number;
    count: number;
  };
  activeBy: {
    batch: NamedCount[];
    coach: NamedCount[];
    passType: NamedCount[];
  };
  newAdmissionsBy: {
    batch: NamedCount[];
    coach: NamedCount[];
    passType: NamedCount[];
  };
  waterQuality?: WaterQualityPoint[];
};

type DashboardDetailKind = 'active' | 'present' | 'expiring' | 'users' | 'admissions';

type DashboardDetailRow = {
  id: number;
  fullName?: string;
  mobile?: string;
  batch?: string;
  coach?: string;
  passType?: string;
  passValidUntil?: string | null;
  createdAt?: string | null;
  userName?: string;
  email?: string;
  isAccountAdmin?: boolean;
};

const WQ_PARAMS = [
  { key: 'phLevel' as const, label: 'pH Level', unit: '', min: 7.2, max: 7.6 },
  { key: 'freeChlorine' as const, label: 'Free Chlorine', unit: 'ppm', min: 1, max: 3 },
  {
    key: 'totalAlkalinity' as const,
    label: 'Total Alkalinity',
    unit: 'ppm',
    min: 80,
    max: 120,
  },
  {
    key: 'calciumHardness' as const,
    label: 'Calcium Hardness',
    unit: 'ppm',
    min: 200,
    max: 400,
  },
];

function todayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDisplayDate(value: string) {
  const match = value.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function formatMoney(value: number) {
  return `₹${Number(value || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  })}`;
}

const SAMPLE_DETAIL_PEOPLE = [
  { fullName: 'Aarav Patil', mobile: '9876543210', batch: 'Morning A — Mixed — 06:00 to 07:00', coach: 'Riya Kulkarni', passType: 'Monthly Swim' },
  { fullName: 'Sana Joshi', mobile: '9123456780', batch: 'Evening B — Ladies — 17:00 to 18:00', coach: 'Amit Shah', passType: 'Quarterly Swim' },
  { fullName: 'Vihaan Kulkarni', mobile: '9988776655', batch: 'Afternoon C — Mixed — 14:00 to 15:00', coach: 'Riya Kulkarni', passType: 'Monthly Swim' },
  { fullName: 'Anaya Deshmukh', mobile: '9001122334', batch: 'Morning A — Mixed — 06:00 to 07:00', coach: 'Amit Shah', passType: 'Trial Pass' },
  { fullName: 'Kabir Mehta', mobile: '9812345670', batch: 'Evening B — Ladies — 17:00 to 18:00', coach: 'Riya Kulkarni', passType: 'Monthly Swim' },
  { fullName: 'Isha Sharma', mobile: '9765432109', batch: 'Afternoon C — Mixed — 14:00 to 15:00', coach: 'Amit Shah', passType: 'Quarterly Swim' },
];

function sampleDetailRows(kind: DashboardDetailKind, asOf: string, count: number): DashboardDetailRow[] {
  const n = Math.max(0, count);
  if (kind === 'users') {
    return [
      { id: 1, userName: 'pooladmin', mobile: '9000000001', email: 'admin@example.com', isAccountAdmin: true, createdAt: asOf },
      { id: 2, userName: 'riya.k', mobile: '9000000002', email: 'riya@example.com', isAccountAdmin: false, createdAt: asOf },
      { id: 3, userName: 'amit.s', mobile: '9000000003', email: 'amit@example.com', isAccountAdmin: false, createdAt: asOf },
      { id: 4, userName: 'front.desk', mobile: '9000000004', email: 'desk@example.com', isAccountAdmin: false, createdAt: asOf },
    ].slice(0, n);
  }
  return Array.from({ length: n }, (_, index) => {
    const sample = SAMPLE_DETAIL_PEOPLE[index % SAMPLE_DETAIL_PEOPLE.length];
    const until = new Date(`${asOf}T12:00:00`);
    until.setDate(until.getDate() + (kind === 'expiring' ? 1 + (index % 3) : 12 + (index % 20)));
    return {
      id: index + 1,
      fullName: sample.fullName,
      mobile: sample.mobile,
      batch: sample.batch,
      coach: sample.coach,
      passType: sample.passType,
      passValidUntil: until.toISOString().slice(0, 10),
      createdAt: asOf,
    };
  });
}

/** Deterministic sample figures that change with the selected date (Application Preview). */
function sampleDashboard(asOf: string): DashboardData {
  const seed = Number(asOf.replace(/\D/g, '')) || 1;
  const present = 12 + (seed % 17);
  const newAdmissions = 1 + (seed % 5);
  const cash = 1000 * (2 + (seed % 6));
  const online = 1000 * (3 + (seed % 8));
  const count = 2 + (seed % 7);
  const active = 36 + (seed % 20);
  const expiring = 2 + (seed % 8);

  return {
    asOf,
    poolName: 'Demo Swimming Pool',
    city: 'Pune',
    summary: {
      activeUsers: 4,
      activeSwimmers: active,
      presentToday: present,
      expiringSoon: expiring,
      expiryNoticeDays: 3,
      newAdmissionsToday: newAdmissions,
    },
    paymentsToday: {
      cash,
      online,
      total: cash + online,
      count,
    },
    activeBy: {
      batch: [
        { name: 'Morning A — Mixed — 06:00 to 07:00', count: Math.max(8, Math.round(active * 0.38)) },
        { name: 'Evening B — Ladies — 17:00 to 18:00', count: Math.max(6, Math.round(active * 0.33)) },
        { name: 'Afternoon C — Mixed — 14:00 to 15:00', count: Math.max(4, active - Math.round(active * 0.71)) },
      ],
      coach: [
        { name: 'Riya Kulkarni', count: Math.max(10, Math.round(active * 0.42)) },
        { name: 'Amit Shah', count: Math.max(8, Math.round(active * 0.31)) },
        { name: 'Unassigned', count: Math.max(4, active - Math.round(active * 0.73)) },
      ],
      passType: [
        { name: 'Monthly Swim', count: Math.max(14, Math.round(active * 0.58)) },
        { name: 'Quarterly Swim', count: Math.max(6, Math.round(active * 0.25)) },
        { name: 'Trial Pass', count: Math.max(2, active - Math.round(active * 0.83)) },
      ],
    },
    newAdmissionsBy: {
      batch: [
        { name: 'Morning A — Mixed — 06:00 to 07:00', count: Math.max(1, Math.ceil(newAdmissions * 0.6)) },
        { name: 'Evening B — Ladies — 17:00 to 18:00', count: Math.max(0, newAdmissions - Math.ceil(newAdmissions * 0.6)) },
      ].filter((row) => row.count > 0),
      coach: [
        { name: 'Riya Kulkarni', count: Math.max(1, Math.ceil(newAdmissions * 0.67)) },
        { name: 'Amit Shah', count: Math.max(0, newAdmissions - Math.ceil(newAdmissions * 0.67)) },
      ].filter((row) => row.count > 0),
      passType: [
        { name: 'Monthly Swim', count: Math.max(1, Math.ceil(newAdmissions * 0.67)) },
        { name: 'Trial Pass', count: Math.max(0, newAdmissions - Math.ceil(newAdmissions * 0.67)) },
      ].filter((row) => row.count > 0),
    },
    waterQuality: sampleWaterQualitySeries(asOf),
  };
}

function sampleWaterQualitySeries(asOf: string): WaterQualityPoint[] {
  const points: WaterQualityPoint[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date(`${asOf}T12:00:00`);
    date.setDate(date.getDate() - i);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const recordDate = `${y}-${m}-${d}`;
    if (recordDate > asOf) continue;
    const seed = Number(recordDate.replace(/\D/g, '')) || 1;
    points.push({
      recordDate,
      phLevel: Number((7.1 + ((seed + i) % 7) * 0.1).toFixed(1)),
      freeChlorine: Number((0.6 + ((seed + i * 2) % 5) * 0.5).toFixed(1)),
      totalAlkalinity: 70 + ((seed + i * 3) % 8) * 10,
      calciumHardness: 180 + ((seed + i * 5) % 9) * 30,
    });
  }
  return points;
}

function formatWqValue(value: number, unit: string) {
  const text = value.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return unit ? `${text} ${unit}` : text;
}

function WaterQualityParamChart({
  label,
  unit,
  min,
  max,
  points,
  emptyLabel,
}: {
  label: string;
  unit: string;
  min: number;
  max: number;
  points: { date: string; value: number }[];
  emptyLabel: string;
}) {
  const t = useT();
  if (points.length === 0) {
    return (
      <div className="dashboard-breakdown-panel dashboard-wq-panel">
        <h3>{label}</h3>
        <p className="dashboard-empty muted">{emptyLabel}</p>
      </div>
    );
  }

  const values = points.map((p) => p.value);
  const dataMax = Math.max(max, ...values);
  const pad = Math.max(dataMax * 0.08, 0.1);
  const yMin = 0;
  const yMax = dataMax + pad;
  const ySpan = Math.max(yMax - yMin, 0.01);

  const width = 240;
  const height = 110;
  const padL = 4;
  const padR = 4;
  const padT = 8;
  const padB = 18;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const xAt = (index: number) =>
    points.length === 1
      ? padL + plotW / 2
      : padL + (index / (points.length - 1)) * plotW;
  const yAt = (value: number) => padT + (1 - (value - yMin) / ySpan) * plotH;

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xAt(index).toFixed(1)} ${yAt(point.value).toFixed(1)}`)
    .join(' ');

  const rangeTop = yAt(max);
  const rangeBottom = yAt(min);
  const rangeY = Math.min(rangeTop, rangeBottom);
  const rangeH = Math.max(Math.abs(rangeBottom - rangeTop), 1);

  const latest = points[points.length - 1];
  const inRange = latest.value >= min && latest.value <= max;

  return (
    <div className="dashboard-breakdown-panel dashboard-wq-panel">
      <div className="dashboard-wq-panel-head">
        <h3>{label}</h3>
        <div className="dashboard-wq-head-meta">
          <span className="dashboard-wq-latest">{formatWqValue(latest.value, unit)}</span>
          <span className={`dashboard-wq-result ${inRange ? 'is-pass' : 'is-fail'}`}>
            {inRange ? t('Pass') : t('Fail')}
          </span>
        </div>
      </div>
      <div className="dashboard-wq-chart" role="img" aria-label={`${label} trend`}>
        <svg viewBox={`0 0 ${width} ${height}`} className="dashboard-wq-svg" preserveAspectRatio="none">
          <rect
            className="dashboard-wq-range"
            x={padL}
            y={rangeY}
            width={plotW}
            height={rangeH}
            rx={2}
          />
          <line
            className="dashboard-wq-range-line"
            x1={padL}
            y1={rangeTop}
            x2={padL + plotW}
            y2={rangeTop}
          />
          <line
            className="dashboard-wq-range-line"
            x1={padL}
            y1={rangeBottom}
            x2={padL + plotW}
            y2={rangeBottom}
          />
          <path className="dashboard-wq-line" d={linePath} />
          {points.map((point, index) => {
            const out = point.value < min || point.value > max;
            return (
              <circle
                key={point.date}
                className={`dashboard-wq-dot${out ? ' is-out' : ''}`}
                cx={xAt(index)}
                cy={yAt(point.value)}
                r={3.2}
              >
                <title>{`${point.date}: ${formatWqValue(point.value, unit)}`}</title>
              </circle>
            );
          })}
          {points.map((point, index) => (
            <text
              key={`${point.date}-label`}
              className="dashboard-wq-x-label"
              x={xAt(index)}
              y={height - 4}
              textAnchor="middle"
            >
              {point.date.slice(8, 10)}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}

function KpiCard({
  className,
  label,
  value,
  hint,
  onOpen,
  openLabel,
}: {
  className: string;
  label: string;
  value: number | string;
  hint?: string;
  onOpen: () => void;
  openLabel: string;
}) {
  return (
    <button
      type="button"
      className={`dashboard-kpi ${className} dashboard-kpi--clickable`}
      onClick={onOpen}
      title={openLabel}
      aria-label={`${label}: ${value}. ${openLabel}`}
    >
      <span className="dashboard-kpi-label">
        {label}
        {hint ? <span className="dashboard-kpi-hint">{hint}</span> : null}
      </span>
      <span className="dashboard-kpi-value">{value}</span>
    </button>
  );
}

function BreakdownList({ items, emptyLabel }: { items: NamedCount[]; emptyLabel: string }) {
  if (items.length === 0) {
    return <p className="dashboard-empty muted">{emptyLabel}</p>;
  }
  const max = Math.max(...items.map((item) => item.count), 1);
  return (
    <ul className="dashboard-breakdown-list">
      {items.map((item) => (
        <li key={item.name} className="dashboard-breakdown-row">
          <div className="dashboard-breakdown-meta">
            <span className="dashboard-breakdown-name">{item.name}</span>
            <span className="dashboard-breakdown-count">{item.count}</span>
          </div>
          <div className="dashboard-breakdown-track" aria-hidden>
            <span
              className="dashboard-breakdown-fill"
              style={{ width: `${Math.round((item.count / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Dashboard() {
  const t = useT();
  const [asOf, setAsOf] = useState(todayIso);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailKind, setDetailKind] = useState<DashboardDetailKind | null>(null);
  const [detailRows, setDetailRows] = useState<DashboardDetailRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const demo = isApplicationDemo();
  const isToday = asOf === todayIso();
  const dayLabel = formatDisplayDate(asOf);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/dashboard?date=${encodeURIComponent(asOf)}`);
        const body = (await res.json().catch(() => ({}))) as DashboardData & { error?: string };
        if (!res.ok) {
          if (demo) {
            if (!cancelled) setData(sampleDashboard(asOf));
            return;
          }
          throw new Error(body.error || 'Failed to load dashboard');
        }
        if (!cancelled) setData(body);
      } catch (err) {
        if (demo) {
          if (!cancelled) setData(sampleDashboard(asOf));
          return;
        }
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load dashboard');
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [demo, asOf]);

  const summary = data?.summary;
  const payments = data?.paymentsToday;
  const glanceTitle = isToday
    ? t('Today at a glance')
    : `${dayLabel} ${t('at a glance')}`;

  const detailTitle =
    detailKind === 'present'
      ? isToday
        ? t('Present today')
        : t('Present')
      : detailKind === 'expiring'
        ? t('Expiring soon')
        : detailKind === 'users'
          ? t('App users')
          : detailKind === 'admissions'
            ? isToday
              ? t('New admissions today')
              : t('New admissions')
            : t('Active swimmers');

  function countForKind(kind: DashboardDetailKind) {
    if (!summary) return 0;
    if (kind === 'present') return summary.presentToday;
    if (kind === 'expiring') return summary.expiringSoon;
    if (kind === 'users') return summary.activeUsers;
    if (kind === 'admissions') return summary.newAdmissionsToday;
    return summary.activeSwimmers;
  }

  async function openDetails(kind: DashboardDetailKind) {
    setDetailKind(kind);
    setDetailRows([]);
    setDetailError('');
    setDetailLoading(true);
    try {
      const res = await fetch(
        `/api/dashboard/details?kind=${encodeURIComponent(kind)}&date=${encodeURIComponent(asOf)}`,
      );
      const body = (await res.json().catch(() => ({}))) as {
        rows?: DashboardDetailRow[];
        error?: string;
      };
      if (!res.ok) {
        if (demo) {
          setDetailRows(sampleDetailRows(kind, asOf, countForKind(kind)));
          return;
        }
        throw new Error(body.error || 'Failed to load dashboard details');
      }
      setDetailRows(Array.isArray(body.rows) ? body.rows : []);
    } catch (err) {
      if (demo) {
        setDetailRows(sampleDetailRows(kind, asOf, countForKind(kind)));
        return;
      }
      setDetailError(err instanceof Error ? err.message : 'Failed to load dashboard details');
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetails() {
    setDetailKind(null);
    setDetailRows([]);
    setDetailError('');
    setDetailLoading(false);
  }

  const showUserColumns = detailKind === 'users';

  return (
    <PlatformPage
      title="Dashboard"
      actions={
        <label className="balance-month-inline dashboard-date-inline">
          <span className="label">{t('Date')}</span>
          <input
            type="date"
            value={asOf}
            max={todayIso()}
            onChange={(e) => setAsOf(e.target.value || todayIso())}
            aria-label={t('Show dashboard for date')}
          />
        </label>
      }
    >
      {error ? <p className="error">{t(error)}</p> : null}
      {loading && !data ? <p className="muted">{t('Loading dashboard…')}</p> : null}

      {data && summary && payments ? (
        <div
          className={`dashboard-page${demo ? ' dashboard-page--sample' : ''}${
            loading ? ' dashboard-page--loading' : ''
          }`}
        >
          {demo ? (
            <div className="user-mgmt-sample-watermark" aria-hidden="true">
              {t('Sample')}
            </div>
          ) : null}
          <section className="card dashboard-card pool-core-form" aria-label={glanceTitle}>
            <h2>{glanceTitle}</h2>
            <div className="dashboard-kpi-grid">
              <KpiCard
                className="dashboard-kpi--active"
                label={t('Active swimmers')}
                value={summary.activeSwimmers}
                onOpen={() => void openDetails('active')}
                openLabel={t('Show details')}
              />
              <KpiCard
                className="dashboard-kpi--present"
                label={isToday ? t('Present today') : t('Present')}
                value={summary.presentToday}
                onOpen={() => void openDetails('present')}
                openLabel={t('Show details')}
              />
              <KpiCard
                className="dashboard-kpi--expiring"
                label={t('Expiring soon')}
                hint={` (${summary.expiryNoticeDays}d)`}
                value={summary.expiringSoon}
                onOpen={() => void openDetails('expiring')}
                openLabel={t('Show details')}
              />
              <KpiCard
                className="dashboard-kpi--users"
                label={t('App users')}
                value={summary.activeUsers}
                onOpen={() => void openDetails('users')}
                openLabel={t('Show details')}
              />
              <KpiCard
                className="dashboard-kpi--admissions"
                label={isToday ? t('New admissions today') : t('New admissions')}
                value={summary.newAdmissionsToday}
                onOpen={() => void openDetails('admissions')}
                openLabel={t('Show details')}
              />
              <article className="dashboard-kpi dashboard-kpi--cash">
                <p className="dashboard-kpi-label">{isToday ? t('Cash today') : t('Cash')}</p>
                <p className="dashboard-kpi-value">{formatMoney(payments.cash)}</p>
              </article>
              <article className="dashboard-kpi dashboard-kpi--online">
                <p className="dashboard-kpi-label">{isToday ? t('Online today') : t('Online')}</p>
                <p className="dashboard-kpi-value">{formatMoney(payments.online)}</p>
              </article>
              <article className="dashboard-kpi dashboard-kpi--total">
                <p className="dashboard-kpi-label">{t('Total payment')}</p>
                <p className="dashboard-kpi-sub">
                  {payments.count}{' '}
                  {payments.count === 1 ? t('payment') : t('payments')}
                </p>
                <p className="dashboard-kpi-value">{formatMoney(payments.total)}</p>
              </article>
            </div>
          </section>

          <section className="card dashboard-card pool-core-form" aria-label={t('Active swimmers by group')}>
            <h2>{t('Active swimmers')}</h2>
            <div className="dashboard-breakdown-grid">
              <div className="dashboard-breakdown-panel dashboard-breakdown-panel--batch">
                <h3>{t('Per batch')}</h3>
                <BreakdownList
                  items={data.activeBy.batch}
                  emptyLabel={t('No active swimmers for this day.')}
                />
              </div>
              <div className="dashboard-breakdown-panel dashboard-breakdown-panel--coach">
                <h3>{t('Per coach')}</h3>
                <BreakdownList
                  items={data.activeBy.coach}
                  emptyLabel={t('No active swimmers for this day.')}
                />
              </div>
              <div className="dashboard-breakdown-panel dashboard-breakdown-panel--pass">
                <h3>{t('Per pass type')}</h3>
                <BreakdownList
                  items={data.activeBy.passType}
                  emptyLabel={t('No active swimmers for this day.')}
                />
              </div>
            </div>
          </section>

          <section className="card dashboard-card pool-core-form" aria-label={t('Water Quality')}>
            <h2>{t('Water Quality')}</h2>
            <div className="dashboard-wq-grid">
              {WQ_PARAMS.map((param) => (
                <WaterQualityParamChart
                  key={param.key}
                  label={t(param.label)}
                  unit={param.unit}
                  min={param.min}
                  max={param.max}
                  emptyLabel={t('No water quality records yet.')}
                  points={(data.waterQuality ?? []).map((row) => ({
                    date: row.recordDate,
                    value: row[param.key],
                  }))}
                />
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {detailKind ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dashboard-details-title"
          onClick={closeDetails}
        >
          <div
            className="modal-panel dashboard-details-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="pass-popup-panel-head">
              <h2 id="dashboard-details-title">{detailTitle}</h2>
              <button
                type="button"
                className="pass-popup-close-x"
                onClick={closeDetails}
                aria-label={t('Close')}
                title={t('Close')}
              >
                ×
              </button>
            </div>
            <p className="modal-intro">
              {dayLabel}
              {detailRows.length ? ` · ${detailRows.length}` : ''}
            </p>
            <div className="modal-scroll">
              {detailLoading ? <p>{t('Loading…')}</p> : null}
              {detailError ? <p className="error">{t(detailError)}</p> : null}
              {!detailLoading && !detailError && detailRows.length === 0 ? (
                <p className="dashboard-empty muted">{t('No matching records.')}</p>
              ) : null}
              {!detailLoading && detailRows.length > 0 ? (
                <div className="dashboard-details-table-wrap">
                  <table className="dashboard-details-table">
                    <thead>
                      {showUserColumns ? (
                        <tr>
                          <th>{t('User name')}</th>
                          <th>{t('Mobile')}</th>
                          <th>{t('Email')}</th>
                          <th>{t('Role')}</th>
                          <th>{t('Created')}</th>
                        </tr>
                      ) : (
                        <tr>
                          <th>{t('Name')}</th>
                          <th>{t('Mobile')}</th>
                          <th>{t('Batch')}</th>
                          <th>{t('Coach')}</th>
                          <th>{t('Pass type')}</th>
                          <th>{t('Valid until')}</th>
                          {detailKind === 'admissions' ? <th>{t('Created')}</th> : null}
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {showUserColumns
                        ? detailRows.map((row) => (
                            <tr key={row.id}>
                              <td>{row.userName || '—'}</td>
                              <td>{row.mobile || '—'}</td>
                              <td>{row.email || '—'}</td>
                              <td>{row.isAccountAdmin ? t('Admin user') : t('User')}</td>
                              <td>{row.createdAt ? formatDisplayDate(row.createdAt) : '—'}</td>
                            </tr>
                          ))
                        : detailRows.map((row) => (
                            <tr key={row.id}>
                              <td>{row.fullName || '—'}</td>
                              <td>{row.mobile || '—'}</td>
                              <td>{row.batch || '—'}</td>
                              <td>{row.coach || '—'}</td>
                              <td>{row.passType || '—'}</td>
                              <td>
                                {row.passValidUntil ? formatDisplayDate(row.passValidUntil) : '—'}
                              </td>
                              {detailKind === 'admissions' ? (
                                <td>{row.createdAt ? formatDisplayDate(row.createdAt) : '—'}</td>
                              ) : null}
                            </tr>
                          ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
            <div className="modal-footer">
              <button type="button" className="ghost-btn" onClick={closeDetails}>
                {t('Close')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PlatformPage>
  );
}
