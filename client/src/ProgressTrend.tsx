import { useEffect, useMemo, useState } from 'react';
import { isApplicationDemo } from './applicationDemo';
import { indiaDaysAgoIso, indiaTodayIso } from './indiaDate';
import { InPageSelect } from './InPageSelect';
import { useT } from './i18n';
import { PlatformPage } from './PlatformPage';

const STROKES = [
  'Free Style',
  'Back Stroke',
  'Breast Stroke',
  'Butterfly',
] as const;

const DISTANCES = [25, 50, 100, 200, 400, 800] as const;

type TrendSwimmer = {
  id: number;
  name: string;
  batch: string;
  coach: string;
  times: Record<string, string>;
};

type RowSort =
  | { kind: 'name'; dir: 'asc' | 'desc' }
  | { kind: 'date'; date: string; dir: 'asc' | 'desc' };

function formatDisplayDate(value: string) {
  const match = value.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function timeToSeconds(value: string) {
  const match = value.trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function SortArrows({
  selected,
  onSort,
}: {
  selected: 'asc' | 'desc' | null;
  onSort: (dir: 'asc' | 'desc') => void;
}) {
  const t = useT();
  return (
    <div className="table-col-filter-sort-arrows">
      <button
        type="button"
        className={selected === 'asc' ? 'selected' : ''}
        onClick={() => onSort('asc')}
        aria-label={t('Sort ascending')}
        title={t('Sort ascending')}
      >
        ▲
      </button>
      <button
        type="button"
        className={selected === 'desc' ? 'selected' : ''}
        onClick={() => onSort('desc')}
        aria-label={t('Sort descending')}
        title={t('Sort descending')}
      >
        ▼
      </button>
    </div>
  );
}

const LINE_COLOR = '#4b84f5';
const DATE_COL = 70;
const DATE_GAP = 6.5;
const LINE_HEIGHT = 56;

function lineScale(swimmers: TrendSwimmer[], dates: string[]) {
  const values = swimmers.flatMap((row) =>
    dates.map((date) => timeToSeconds(row.times[date] ?? '')).filter((value): value is number => value != null),
  );
  if (values.length === 0) return null;
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const pad = Math.max((maxValue - minValue) * 0.18, 2);
  return {
    yMin: Math.max(0, minValue - pad),
    yMax: maxValue + pad,
  };
}

function yRatio(seconds: number, yMin: number, yMax: number) {
  const span = Math.max(yMax - yMin, 1);
  return Math.min(0.84, Math.max(0.16, 1 - (seconds - yMin) / span));
}

function RowTrendLine({
  dates,
  times,
  yMin,
  yMax,
}: {
  dates: string[];
  times: Record<string, string>;
  yMin: number;
  yMax: number;
}) {
  const points = dates
    .map((date, dateIndex) => {
      const seconds = timeToSeconds(times[date] ?? '');
      return seconds == null ? null : { dateIndex, seconds };
    })
    .filter((point): point is { dateIndex: number; seconds: number } => point != null);
  if (points.length === 0) return null;

  const width = dates.length * DATE_COL + Math.max(0, dates.length - 1) * DATE_GAP;
  const xAt = (index: number) => index * (DATE_COL + DATE_GAP) + DATE_COL / 2;
  const yAt = (seconds: number) => yRatio(seconds, yMin, yMax) * LINE_HEIGHT;
  const path = points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'} ${xAt(point.dateIndex).toFixed(1)} ${yAt(point.seconds).toFixed(1)}`,
    )
    .join(' ');

  return (
    <svg
      className="progress-trend-row-line"
      viewBox={`0 0 ${width} ${LINE_HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {points.length > 1 ? <path className="progress-trend-line" d={path} stroke={LINE_COLOR} /> : null}
      {points.map((point) => (
        <circle
          key={point.dateIndex}
          className="progress-trend-dot"
          cx={xAt(point.dateIndex)}
          cy={yAt(point.seconds)}
          r={3}
          fill={LINE_COLOR}
        />
      ))}
    </svg>
  );
}

function sampleTrend(stroke: string, distanceM: number) {
  const dates = [indiaDaysAgoIso(14), indiaDaysAgoIso(7), indiaTodayIso()];
  const swimmers: TrendSwimmer[] = [
    {
      id: -101,
      name: 'Aarav Patil',
      batch: 'Morning — Advance — 06:00 to 07:00',
      coach: 'Riya Kulkarni',
      times: { [dates[0]]: '0:42', [dates[1]]: '0:40', [dates[2]]: '0:38' },
    },
    {
      id: -102,
      name: 'Sana Joshi',
      batch: 'Morning — Advance — 06:00 to 07:00',
      coach: 'Riya Kulkarni',
      times: { [dates[0]]: '0:48', [dates[1]]: '0:46', [dates[2]]: '0:45' },
    },
    {
      id: -103,
      name: 'Vihaan Deshmukh',
      batch: 'Evening — Advance — 17:00 to 18:00',
      coach: 'Amit Sharma',
      times: { [dates[0]]: '0:51', [dates[1]]: '0:49', [dates[2]]: '0:47' },
    },
  ];
  return { stroke, distanceM, dates, swimmers };
}

export function ProgressTrend() {
  const t = useT();
  const [stroke, setStroke] = useState<string>(STROKES[0]);
  const [distanceM, setDistanceM] = useState(50);
  const [dates, setDates] = useState<string[]>([]);
  const [swimmers, setSwimmers] = useState<TrendSwimmer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sampleMode, setSampleMode] = useState(false);
  const [rowSort, setRowSort] = useState<RowSort | null>(null);
  const [viewType, setViewType] = useState<'counter' | 'line'>('counter');

  const strokeOptions = useMemo(
    () => STROKES.map((value) => ({ value, label: t(value) })),
    [t],
  );
  const distanceOptions = useMemo(
    () => DISTANCES.map((value) => ({ value: String(value), label: `${value} ${t('mtr')}` })),
    [t],
  );
  const typeOptions = useMemo(
    () => [
      { value: 'counter', label: t('Counter') },
      { value: 'line', label: t('Line') },
    ],
    [t],
  );

  const displayedSwimmers = useMemo(() => {
    if (!rowSort) return swimmers;
    const rows = [...swimmers];
    rows.sort((a, b) => {
      if (rowSort.kind === 'name') {
        const cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        return rowSort.dir === 'asc' ? cmp : -cmp;
      }
      const left = timeToSeconds(a.times[rowSort.date] ?? '');
      const right = timeToSeconds(b.times[rowSort.date] ?? '');
      if (left == null && right == null) {
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      }
      if (left == null) return 1;
      if (right == null) return -1;
      const cmp = left - right;
      return rowSort.dir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [rowSort, swimmers]);

  const scale = useMemo(() => lineScale(swimmers, dates), [dates, swimmers]);

  function toggleRowSort(next: RowSort) {
    setRowSort((prev) => {
      if (!prev || prev.kind !== next.kind || prev.dir !== next.dir) return next;
      if (prev.kind === 'date' && next.kind === 'date' && prev.date !== next.date) return next;
      return null;
    });
  }

  async function loadTrend(nextStroke: string, nextDistance: number) {
    setLoading(true);
    setError('');
    setRowSort(null);
    try {
      const res = await fetch(
        `/api/swimmer-progress/trend?stroke=${encodeURIComponent(nextStroke)}&distanceM=${nextDistance}`,
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to load progress trend');
      const rows = Array.isArray(body.swimmers) ? (body.swimmers as TrendSwimmer[]) : [];
      const nextDates = Array.isArray(body.dates) ? (body.dates as string[]) : [];
      const useSample = isApplicationDemo() && (rows.length === 0 || nextDates.length === 0);
      if (useSample) {
        const sample = sampleTrend(nextStroke, nextDistance);
        setSwimmers(sample.swimmers);
        setDates(sample.dates);
        setSampleMode(true);
      } else {
        setSwimmers(rows.map((row) => ({ ...row, times: row.times ?? {} })));
        setDates(nextDates);
        setSampleMode(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setSwimmers([]);
      setDates([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTrend(stroke, distanceM);
  }, []);

  return (
    <PlatformPage
      title="Progress Trend"
      className="progress-trend-page"
      actions={
        <div className="progress-trend-filters">
          <span className="label">{t('Stroke')}</span>
          <InPageSelect
            value={stroke}
            onChange={(next) => {
              setStroke(next);
              void loadTrend(next, distanceM);
            }}
            options={strokeOptions}
            required
            aria-label={t('Stroke')}
          />
          <span className="label">{t('Distance')}</span>
          <InPageSelect
            value={String(distanceM)}
            onChange={(next) => {
              const value = Number(next);
              setDistanceM(value);
              void loadTrend(stroke, value);
            }}
            options={distanceOptions}
            required
            aria-label={t('Distance')}
          />
          <span className="label">{t('Type')}</span>
          <div className="progress-trend-type-select">
            <InPageSelect
              value={viewType}
              onChange={(next) => setViewType(next === 'line' ? 'line' : 'counter')}
              options={typeOptions}
              required
              aria-label={t('Type')}
            />
          </div>
        </div>
      }
    >
      <p className="lede batch-list-lede">
        {t('Select stroke and distance to see times across all recorded dates.')}
      </p>
      {error ? <p className="error">{t(error)}</p> : null}

      <div
        className={`pass-form-card pool-core-form pass-table-card expense-table-card swimmer-progress-card progress-trend-card${
          sampleMode ? ' pass-form-card--sample' : ''
        }`}
        style={{ ['--progress-cols' as string]: String(Math.max(dates.length, 1)) }}
      >
        {sampleMode ? (
          <div className="user-mgmt-sample-watermark" aria-hidden="true">
            {t('Sample')}
          </div>
        ) : null}

        {loading ? <p className="pass-empty">{t('Loading…')}</p> : null}

        {!loading && swimmers.length === 0 ? (
          <p className="pass-empty">
            {t('No competitive batch swimmers found. Add an Advance batch or a Competitive pass.')}
          </p>
        ) : null}

        {!loading && swimmers.length > 0 && dates.length === 0 ? (
          <p className="pass-empty">{t('No timings recorded for this stroke and distance yet.')}</p>
        ) : null}

        {!loading && swimmers.length > 0 && dates.length > 0 ? (
          <>
            <div className="swimmer-progress-head progress-trend-head">
              <span className="swimmer-progress-name-heading">
                {t('Swimmer')}
                <SortArrows
                  selected={rowSort?.kind === 'name' ? rowSort.dir : null}
                  onSort={(dir) => toggleRowSort({ kind: 'name', dir })}
                />
              </span>
              {dates.map((date) => (
                <div className="progress-trend-date-head" key={date}>
                  <span>{formatDisplayDate(date)}</span>
                  <SortArrows
                    selected={rowSort?.kind === 'date' && rowSort.date === date ? rowSort.dir : null}
                    onSort={(dir) => toggleRowSort({ kind: 'date', date, dir })}
                  />
                </div>
              ))}
            </div>
            {displayedSwimmers.map((row) => (
              <div
                className={`swimmer-progress-row progress-trend-row${viewType === 'line' ? ' progress-trend-line-row' : ''}`}
                key={row.id}
              >
                <div className="swimmer-progress-name">
                  <strong>{row.name}</strong>
                  {row.batch ? <span className="muted">{row.batch}</span> : null}
                </div>
                {viewType === 'line' && scale ? (
                  <div className="progress-trend-line-track">
                    <RowTrendLine dates={dates} times={row.times} yMin={scale.yMin} yMax={scale.yMax} />
                    <div className="progress-trend-line-times">
                      {dates.map((date) => {
                        const seconds = timeToSeconds(row.times[date] ?? '');
                        const label = row.times[date] || '—';
                        return (
                          <span className="progress-trend-time-slot" key={`${row.id}-${date}`}>
                            {seconds != null ? (
                              <span
                                className="progress-trend-time progress-trend-time--on-line"
                                style={{ top: `${yRatio(seconds, scale.yMin, scale.yMax) * 100}%` }}
                              >
                                {label}
                              </span>
                            ) : (
                              <span className="progress-trend-time">{label}</span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  dates.map((date) => (
                    <span className="progress-trend-time-slot" key={`${row.id}-${date}`}>
                      <span className="progress-trend-time">{row.times[date] || '—'}</span>
                    </span>
                  ))
                )}
              </div>
            ))}
          </>
        ) : null}
      </div>
    </PlatformPage>
  );
}
