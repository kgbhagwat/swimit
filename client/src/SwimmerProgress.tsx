import { FormEvent, useEffect, useMemo, useState } from 'react';
import { isApplicationDemo } from './applicationDemo';
import { InPageSelect } from './InPageSelect';
import { useT } from './i18n';
import { PlatformPage } from './PlatformPage';
import { normalizeRaceTimeText, raceTimeToMs, sanitizeRaceTimeInput } from './swimmerRaceTime';

const STROKES = [
  'Free Style',
  'Back Stroke',
  'Breast Stroke',
  'Butterfly',
] as const;

const DISTANCES = [25, 50, 100, 200, 400, 800] as const;

type ProgressSwimmer = {
  id: number;
  name: string;
  batch: string;
  coach: string;
  timeText: string;
};

type ProgressColumn = {
  id: number;
  recordDate: string;
  stroke: string;
  distanceM: number;
  eventName: string;
  times: Record<number, string>;
};

function todayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function sampleCompetitiveSwimmers(): ProgressSwimmer[] {
  return [
    {
      id: -101,
      name: 'Aarav Patil',
      batch: 'Morning — Advance — 06:00 to 07:00',
      coach: 'Riya Kulkarni',
      timeText: '',
    },
    {
      id: -102,
      name: 'Sana Joshi',
      batch: 'Morning — Advance — 06:00 to 07:00',
      coach: 'Riya Kulkarni',
      timeText: '',
    },
    {
      id: -103,
      name: 'Vihaan Deshmukh',
      batch: 'Evening — Advance — 17:00 to 18:00',
      coach: 'Amit Sharma',
      timeText: '',
    },
  ];
}

function emptyTimes(rows: ProgressSwimmer[]) {
  return Object.fromEntries(rows.map((row) => [row.id, '']));
}

type RowSort =
  | { kind: 'name'; dir: 'asc' | 'desc' }
  | { kind: 'time'; columnId: number; dir: 'asc' | 'desc' };

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

function nextColumnSettings(columns: ProgressColumn[]): Omit<ProgressColumn, 'id' | 'times'> {
  const last = columns[columns.length - 1];
  const distIdx = DISTANCES.indexOf(last.distanceM as (typeof DISTANCES)[number]);
  if (distIdx >= 0 && distIdx < DISTANCES.length - 1) {
    return {
      recordDate: last.recordDate,
      stroke: last.stroke,
      distanceM: DISTANCES[distIdx + 1],
      eventName: last.eventName,
    };
  }
  const strokeIdx = STROKES.indexOf(last.stroke as (typeof STROKES)[number]);
  return {
    recordDate: last.recordDate,
    stroke: STROKES[(strokeIdx + 1) % STROKES.length],
    distanceM: DISTANCES[0],
    eventName: last.eventName,
  };
}

export function SwimmerProgress() {
  const t = useT();
  const [columns, setColumns] = useState<ProgressColumn[]>(() => [
    { id: 1, recordDate: todayIso(), stroke: STROKES[0], distanceM: 50, eventName: '', times: {} },
  ]);
  const [nextColumnId, setNextColumnId] = useState(2);
  const [swimmers, setSwimmers] = useState<ProgressSwimmer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sampleMode, setSampleMode] = useState(false);
  const [rowSort, setRowSort] = useState<RowSort | null>(null);

  const strokeOptions = useMemo(
    () => STROKES.map((value) => ({ value, label: t(value) })),
    [t],
  );
  const distanceOptions = useMemo(
    () => DISTANCES.map((value) => ({ value: String(value), label: `${value} ${t('mtr')}` })),
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
      const col = columns.find((item) => item.id === rowSort.columnId);
      const left = raceTimeToMs(col?.times[a.id] ?? '');
      const right = raceTimeToMs(col?.times[b.id] ?? '');
      if (left == null && right == null) {
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      }
      if (left == null) return 1;
      if (right == null) return -1;
      const cmp = left - right;
      return rowSort.dir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [columns, rowSort, swimmers]);

  function toggleRowSort(next: RowSort) {
    setRowSort((prev) => {
      if (!prev || prev.kind !== next.kind || prev.dir !== next.dir) return next;
      if (prev.kind === 'time' && next.kind === 'time' && prev.columnId !== next.columnId) return next;
      return null;
    });
  }

  async function fetchSession(recordDate: string, stroke: string, distanceM: number) {
    const res = await fetch(
      `/api/swimmer-progress?recordDate=${encodeURIComponent(recordDate)}&stroke=${encodeURIComponent(stroke)}&distanceM=${distanceM}`,
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? 'Failed to load swimmer progress');
    const rows = Array.isArray(body.swimmers) ? (body.swimmers as ProgressSwimmer[]) : [];
    const useSample = isApplicationDemo() && rows.length === 0;
    const nextRows = useSample ? sampleCompetitiveSwimmers() : rows;
    const times = Object.fromEntries(
      nextRows.map((row) => {
        const raw = row.timeText ?? '';
        return [row.id, normalizeRaceTimeText(raw) || raw];
      }),
    );
    return {
      rows: nextRows,
      times,
      sample: useSample,
      eventName: String(body.eventName ?? body.event ?? '').trim().slice(0, 80),
    };
  }

  async function loadFirst() {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const first = columns[0];
      const session = await fetchSession(first.recordDate, first.stroke, first.distanceM);
      setSwimmers(session.rows);
      setSampleMode(session.sample);
      setColumns((prev) =>
        prev.map((col, index) => (index === 0 ? { ...col, times: session.times, eventName: session.eventName } : col)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setSwimmers([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadColumn(columnId: number, recordDate: string, stroke: string, distanceM: number) {
    setError('');
    setSuccess('');
    try {
      const session = await fetchSession(recordDate, stroke, distanceM);
      if (session.rows.length) setSwimmers(session.rows);
      setColumns((prev) =>
        prev.map((col) =>
          col.id === columnId
            ? { ...col, recordDate, stroke, distanceM, times: session.times, eventName: session.eventName }
            : col,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }

  useEffect(() => {
    void loadFirst();
  }, []);

  async function addColumn() {
    const settings = nextColumnSettings(columns);
    const id = nextColumnId;
    setNextColumnId((prev) => prev + 1);
    const session = await fetchSession(settings.recordDate, settings.stroke, settings.distanceM).catch(() => ({
      times: emptyTimes(swimmers),
      eventName: settings.eventName,
    }));
    setColumns((prev) => [
      ...prev,
      {
        id,
        ...settings,
        times: session.times,
        eventName: session.eventName || settings.eventName,
      },
    ]);
  }

  function removeColumn(columnId: number) {
    setColumns((prev) => (prev.length <= 1 ? prev : prev.filter((col) => col.id !== columnId)));
    setRowSort((prev) => (prev?.kind === 'time' && prev.columnId === columnId ? null : prev));
  }

  function setColumnEvent(columnId: number, eventName: string) {
    setColumns((prev) =>
      prev.map((col) => (col.id === columnId ? { ...col, eventName: eventName.slice(0, 80) } : col)),
    );
  }

  function setColumnTime(columnId: number, swimmerId: number, value: string) {
    setColumns((prev) =>
      prev.map((col) =>
        col.id === columnId ? { ...col, times: { ...col.times, [swimmerId]: sanitizeRaceTimeInput(value) } } : col,
      ),
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    for (const col of columns) {
      const invalid = swimmers.some((row) => normalizeRaceTimeText(col.times[row.id] ?? '') === null);
      if (invalid) {
        setError('Enter timing as mm:ss:msec (e.g. 01:23:45)');
        return;
      }
    }
    setSaving(true);
    try {
      for (const col of columns) {
        const res = await fetch('/api/swimmer-progress', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recordDate: col.recordDate,
            stroke: col.stroke,
            distanceM: col.distanceM,
            eventName: col.eventName.trim().slice(0, 80),
            entries: swimmers.map((row) => ({
              registrationId: row.id,
              timeText: normalizeRaceTimeText(col.times[row.id] ?? ''),
            })),
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? 'Failed to save');
      }
      setSuccess('Swimmer progress saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PlatformPage
      title="Swimmer Progress"
      actions={
        <button type="submit" form="swimmer-progress-form" className="submit" disabled={saving || loading}>
          {saving ? t('Saving…') : t('Save')}
        </button>
      }
    >
      <p className="lede batch-list-lede">
        {t('Record race times for competitive batch swimmers. Select date, stroke, and distance, then enter mm:ss:msec for each swimmer.')}
      </p>
      {error ? <p className="error">{t(error)}</p> : null}
      {success ? <p className="success">{t(success)}</p> : null}

      <form
        id="swimmer-progress-form"
        className={`pass-form-card pool-core-form pass-table-card expense-table-card swimmer-progress-card${
          sampleMode ? ' pass-form-card--sample' : ''
        }`}
        onSubmit={onSubmit}
        style={{ ['--progress-cols' as string]: String(columns.length) }}
      >
        {sampleMode ? (
          <div className="user-mgmt-sample-watermark" aria-hidden="true">
            {t('Sample')}
          </div>
        ) : null}

        <div className="swimmer-progress-head">
          <span className="swimmer-progress-name-heading">
            {t('Swimmer')}
            <SortArrows
              selected={rowSort?.kind === 'name' ? rowSort.dir : null}
              onSort={(dir) => toggleRowSort({ kind: 'name', dir })}
            />
          </span>
          {columns.map((col) => (
            <div className="swimmer-progress-filters" key={col.id}>
              <label className="swimmer-progress-head-field">
                <span className="label">{t('Event')}</span>
                <input
                  type="text"
                  className="field-control-sm"
                  value={col.eventName}
                  maxLength={80}
                  onChange={(e) => setColumnEvent(col.id, e.target.value)}
                  aria-label={t('Event')}
                />
              </label>
              <label className="swimmer-progress-head-field">
                <span className="label">{t('Date')}</span>
                <input
                  type="date"
                  className="field-control-sm"
                  value={col.recordDate}
                  max={todayIso()}
                  onChange={(e) => {
                    void loadColumn(col.id, e.target.value, col.stroke, col.distanceM);
                  }}
                  aria-label={t('Date')}
                />
              </label>
              <div className="swimmer-progress-head-field">
                <span className="label">{t('Stroke')}</span>
                <InPageSelect
                  value={col.stroke}
                  onChange={(next) => {
                    void loadColumn(col.id, col.recordDate, next, col.distanceM);
                  }}
                  options={strokeOptions}
                  required
                  aria-label={t('Stroke')}
                />
              </div>
              <div className="swimmer-progress-head-field">
                <span className="label">{t('Distance')}</span>
                <InPageSelect
                  value={String(col.distanceM)}
                  onChange={(next) => {
                    void loadColumn(col.id, col.recordDate, col.stroke, Number(next));
                  }}
                  options={distanceOptions}
                  required
                  aria-label={t('Distance')}
                />
              </div>
              <div className="swimmer-progress-col-sort">
                <SortArrows
                  selected={rowSort?.kind === 'time' && rowSort.columnId === col.id ? rowSort.dir : null}
                  onSort={(dir) => toggleRowSort({ kind: 'time', columnId: col.id, dir })}
                />
                {columns.length > 1 ? (
                  <button
                    type="button"
                    className="ghost-btn swimmer-progress-remove-col"
                    onClick={() => removeColumn(col.id)}
                  >
                    {t('Remove')}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
          <button type="button" className="ghost-btn swimmer-progress-add-col" onClick={() => void addColumn()}>
            {t('Add column')}
          </button>
        </div>

        {loading ? <p className="pass-empty">{t('Loading…')}</p> : null}

        {!loading && swimmers.length === 0 ? (
          <p className="pass-empty">
            {t('No competitive batch swimmers found. Add an Advance batch or a Competitive pass.')}
          </p>
        ) : null}

        {!loading
          ? displayedSwimmers.map((row) => (
              <div className="swimmer-progress-row" key={row.id}>
                <div className="swimmer-progress-name">
                  <strong>{row.name}</strong>
                </div>
                {columns.map((col) => {
                  const timeValue = col.times[row.id] ?? '';
                  const invalid = Boolean(timeValue && normalizeRaceTimeText(timeValue) === null);
                  return (
                    <label className="swimmer-progress-time" key={`${col.id}-${row.id}`}>
                      <span className="swimmer-progress-time-label">{t('Time')}</span>
                      <input
                        value={timeValue}
                        onChange={(e) => setColumnTime(col.id, row.id, e.target.value)}
                        placeholder="MM:SS:mm"
                        inputMode="numeric"
                        autoComplete="off"
                        aria-label={`${t('Time')} ${row.name}`}
                        aria-invalid={invalid}
                      />
                      {invalid ? (
                        <span className="field-error">{t('Enter timing as mm:ss:msec (e.g. 01:23:45)')}</span>
                      ) : null}
                    </label>
                  );
                })}
                <span className="swimmer-progress-add-slot" aria-hidden />
              </div>
            ))
          : null}
      </form>
    </PlatformPage>
  );
}
