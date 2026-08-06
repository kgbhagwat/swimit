import { useEffect, useState } from 'react';
import { isApplicationDemo } from './applicationDemo';
import { useT } from './i18n';
import { PlatformPage } from './PlatformPage';

type NamedCount = { name: string; count: number };

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
};

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
  };
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
  const admissionsTitle = isToday
    ? t('New admissions today')
    : `${t('New admissions on')} ${dayLabel}`;

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
              <article className="dashboard-kpi dashboard-kpi--active">
                <p className="dashboard-kpi-label">{t('Active swimmers')}</p>
                <p className="dashboard-kpi-value">{summary.activeSwimmers}</p>
              </article>
              <article className="dashboard-kpi dashboard-kpi--present">
                <p className="dashboard-kpi-label">{isToday ? t('Present today') : t('Present')}</p>
                <p className="dashboard-kpi-value">{summary.presentToday}</p>
              </article>
              <article className="dashboard-kpi dashboard-kpi--expiring">
                <p className="dashboard-kpi-label">
                  {t('Expiring soon')}
                  <span className="dashboard-kpi-hint"> ({summary.expiryNoticeDays}d)</span>
                </p>
                <p className="dashboard-kpi-value">{summary.expiringSoon}</p>
              </article>
              <article className="dashboard-kpi dashboard-kpi--users">
                <p className="dashboard-kpi-label">{t('App users')}</p>
                <p className="dashboard-kpi-value">{summary.activeUsers}</p>
              </article>
              <article className="dashboard-kpi dashboard-kpi--admissions">
                <p className="dashboard-kpi-label">
                  {isToday ? t('New admissions today') : t('New admissions')}
                </p>
                <p className="dashboard-kpi-value">{summary.newAdmissionsToday}</p>
              </article>
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

          <section className="card dashboard-card pool-core-form" aria-label={admissionsTitle}>
            <h2>{admissionsTitle}</h2>
            <div className="dashboard-breakdown-grid">
              <div className="dashboard-breakdown-panel dashboard-breakdown-panel--batch">
                <h3>{t('Per batch')}</h3>
                <BreakdownList
                  items={data.newAdmissionsBy.batch}
                  emptyLabel={t('No new admissions on this day.')}
                />
              </div>
              <div className="dashboard-breakdown-panel dashboard-breakdown-panel--coach">
                <h3>{t('Per coach')}</h3>
                <BreakdownList
                  items={data.newAdmissionsBy.coach}
                  emptyLabel={t('No new admissions on this day.')}
                />
              </div>
              <div className="dashboard-breakdown-panel dashboard-breakdown-panel--pass">
                <h3>{t('Per pass type')}</h3>
                <BreakdownList
                  items={data.newAdmissionsBy.passType}
                  emptyLabel={t('No new admissions on this day.')}
                />
              </div>
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
        </div>
      ) : null}
    </PlatformPage>
  );
}
