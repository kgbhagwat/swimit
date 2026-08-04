import { useEffect, useMemo, useState } from 'react';
import { isApplicationDemo } from './applicationDemo';
import { DownloadButton } from './DownloadButton';
import { PlatformPage } from './PlatformPage';

type AttendanceItem = {
  registrationId: number;
  fullName: string;
  passType: string;
  batch: string;
  coach: string;
  isActive: boolean;
  passStart?: string;
  passValidUntil?: string;
  presentDays: string[];
  presentCount: number;
};

type SheetResult = {
  month: string;
  view: 'standard' | 'swimmer';
  rangeStart?: string;
  rangeEnd?: string;
  days: string[];
  weeklyOffDays?: string[];
  holidayDays?: { date: string; name: string }[];
  items: AttendanceItem[];
  swimmerCount: number;
};

type ViewMode = 'standard' | 'swimmer';
type DayKind = 'normal' | 'weeklyOff' | 'holiday';

function dayKindClass(kind: DayKind) {
  if (kind === 'weeklyOff') return ' attendance-weekly-off';
  if (kind === 'holiday') return ' attendance-holiday';
  return '';
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthValue() {
  return todayIso().slice(0, 7);
}

function monthLabel(value: string) {
  const [year, month] = value.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleString('en-GB', { month: 'short', year: 'numeric' }).replace(' ', '-');
}

function buildMonthOptions() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const fyStartYear = month >= 3 ? year : year - 1;
  const currentValue = `${year}-${String(month + 1).padStart(2, '0')}`;
  const options: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    const d = new Date(fyStartYear, 3 + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (value > currentValue) break;
    options.push(value);
  }
  return options;
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function formatDisplayDate(isoDay: string) {
  const match = isoDay.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return isoDay;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

/** Standard month: day-of-month. Swimmer month: D/M so pass periods spanning months are clear. */
function dayHeader(isoDay: string, view: ViewMode) {
  const match = isoDay.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return isoDay;
  const day = Number(match[3]);
  const month = Number(match[2]);
  if (view === 'standard') return String(day);
  return `${day}/${month}`;
}

function rangeLabel(start?: string, end?: string) {
  if (!start || !end) return '';
  return `${formatDisplayDate(start)} → ${formatDisplayDate(end)}`;
}

function daysInMonth(month: string) {
  const [year, mon] = month.split('-').map(Number);
  const count = new Date(year, mon, 0).getDate();
  const days: string[] = [];
  for (let d = 1; d <= count; d += 1) {
    days.push(`${month}-${String(d).padStart(2, '0')}`);
  }
  return days;
}

function sampleAttendanceSheet(month: string, view: ViewMode): SheetResult {
  const days = daysInMonth(month);
  const weeklyOffDays = days.filter((day) => new Date(`${day}T00:00:00`).getDay() === 0);
  const holidayDay = days.find((day) => day.endsWith('-15')) ?? days[Math.min(14, days.length - 1)];
  const presentPattern = (offset: number) =>
    days.filter((day, i) => {
      if (weeklyOffDays.includes(day) || day === holidayDay) return false;
      return (i + offset) % 3 !== 0;
    });

  const swimmers: Array<{
    id: number;
    name: string;
    passType: string;
    batch: string;
    coach: string;
    offset: number;
    passStart: string;
    passEnd: string;
  }> = [
    {
      id: -101,
      name: 'Aarav Patil',
      passType: 'Monthly Swim',
      batch: 'Morning A',
      coach: 'Riya Kulkarni',
      offset: 0,
      passStart: `${month}-01`,
      passEnd: days[days.length - 1],
    },
    {
      id: -102,
      name: 'Sana Joshi',
      passType: 'Quarterly Swim',
      batch: 'Evening B',
      coach: 'Amit Sharma',
      offset: 1,
      passStart: `${month}-01`,
      passEnd: days[days.length - 1],
    },
    {
      id: -103,
      name: 'Vihaan Kulkarni',
      passType: 'Monthly Swim',
      batch: 'Morning A',
      coach: 'Riya Kulkarni',
      offset: 2,
      passStart: `${month}-05`,
      passEnd: days[days.length - 1],
    },
  ];

  const items: AttendanceItem[] = swimmers.map((s) => {
    const presentDays = presentPattern(s.offset).filter(
      (day) => day >= s.passStart && day <= s.passEnd,
    );
    return {
      registrationId: s.id,
      fullName: s.name,
      passType: s.passType,
      batch: s.batch,
      coach: s.coach,
      isActive: true,
      passStart: s.passStart,
      passValidUntil: s.passEnd,
      presentDays,
      presentCount: presentDays.length,
    };
  });

  if (view === 'swimmer') {
    const rangeStart = items.reduce(
      (min, item) => (item.passStart && item.passStart < min ? item.passStart : min),
      items[0]?.passStart ?? `${month}-01`,
    );
    const rangeEnd = items.reduce(
      (max, item) =>
        item.passValidUntil && item.passValidUntil > max ? item.passValidUntil : max,
      items[0]?.passValidUntil ?? days[days.length - 1],
    );
    const spanDays: string[] = [];
    const cursor = new Date(`${rangeStart}T00:00:00`);
    const end = new Date(`${rangeEnd}T00:00:00`);
    while (cursor <= end) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, '0');
      const d = String(cursor.getDate()).padStart(2, '0');
      spanDays.push(`${y}-${m}-${d}`);
      cursor.setDate(cursor.getDate() + 1);
    }
    return {
      month,
      view,
      rangeStart,
      rangeEnd,
      days: spanDays,
      weeklyOffDays: spanDays.filter((day) => new Date(`${day}T00:00:00`).getDay() === 0),
      holidayDays: [{ date: holidayDay, name: 'Sample holiday' }],
      items,
      swimmerCount: items.length,
    };
  }

  return {
    month,
    view,
    days,
    weeklyOffDays,
    holidayDays: [{ date: holidayDay, name: 'Sample holiday' }],
    items,
    swimmerCount: items.length,
  };
}

export function AttendanceSheet() {
  const monthOptions = useMemo(() => buildMonthOptions(), []);
  const [view, setView] = useState<ViewMode>('standard');
  const [month, setMonth] = useState(currentMonthValue);
  const [sheet, setSheet] = useState<SheetResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sampleMode, setSampleMode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        if (isApplicationDemo()) {
          if (!cancelled) {
            setSheet(sampleAttendanceSheet(month, view));
            setSampleMode(true);
          }
          return;
        }
        const params = new URLSearchParams({ month, view });
        const res = await fetch(`/api/attendance-sheet?${params}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? 'Failed to load attendance sheet');
        if (!cancelled) {
          setSheet(body as SheetResult);
          setSampleMode(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load attendance sheet');
          setSheet(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [month, view]);

  const weeklyOffSet = useMemo(
    () => new Set(sheet?.weeklyOffDays ?? []),
    [sheet?.weeklyOffDays],
  );
  const holidayNameByDate = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of sheet?.holidayDays ?? []) {
      map.set(item.date, item.name);
    }
    return map;
  }, [sheet?.holidayDays]);

  function kindForDay(day: string): DayKind {
    if (holidayNameByDate.has(day)) return 'holiday';
    if (weeklyOffSet.has(day)) return 'weeklyOff';
    return 'normal';
  }

  function dayTitle(day: string, isPresent: boolean, inPass: boolean) {
    const parts = [formatDisplayDate(day)];
    const holidayName = holidayNameByDate.get(day);
    if (holidayName) parts.push(holidayName);
    else if (weeklyOffSet.has(day)) parts.push('Weekly off');
    if (isPresent) parts.push('Present');
    if (!inPass) parts.push('Outside pass');
    return parts.join(' · ');
  }

  function downloadCsv() {
    if (!sheet) return;
    const header = ['Swimmer', ...sheet.days.map((day) => dayHeader(day, view))];
    const lines = [
      header.join(','),
      ...sheet.items.map((item) => {
        const present = new Set(item.presentDays);
        return [
          item.fullName,
          ...sheet.days.map((day) => (present.has(day) ? 'P' : '')),
        ]
          .map(csvEscape)
          .join(',');
      }),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `attendance-sheet-${view}-${month}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const summaryText = (() => {
    if (loading) return 'Loading…';
    if (sampleMode) return 'Sample layout — preview attendance for this month.';
    const count = sheet?.swimmerCount ?? 0;
    const swimmerWord = `swimmer${count === 1 ? '' : 's'}`;
    if (view === 'swimmer') {
      const span =
        sheet?.rangeStart && sheet?.rangeEnd
          ? ` (${rangeLabel(sheet.rangeStart, sheet.rangeEnd)})`
          : '';
      return `${count} ${swimmerWord} · pass periods overlapping ${monthLabel(month)}${span}`;
    }
    return `${count} ${swimmerWord} in ${monthLabel(month)}`;
  })();

  return (
    <PlatformPage
      title="Attendance Sheet"
      className="attendance-sheet-page"
    >
      <div
        className={`pass-form-card pool-core-form attendance-card${sampleMode ? ' pass-form-card--sample' : ''}`}
      >
        {sampleMode ? (
          <div className="user-mgmt-sample-watermark" aria-hidden="true">
            Sample
          </div>
        ) : null}
        <div className="attendance-filters">
          <div className="attendance-filters-left">
            <span className="label">View</span>
            <label className={`attendance-view-option${view === 'standard' ? ' selected' : ''}`}>
              <input
                type="radio"
                name="attendance-view"
                checked={view === 'standard'}
                onChange={() => setView('standard')}
              />
              Standard month
            </label>
            <label className={`attendance-view-option${view === 'swimmer' ? ' selected' : ''}`}>
              <input
                type="radio"
                name="attendance-view"
                checked={view === 'swimmer'}
                onChange={() => setView('swimmer')}
              />
              Swimmer month
            </label>
          </div>

          <div className="attendance-filters-right">
            <span className="label">Month</span>
            <select value={month} onChange={(e) => setMonth(e.target.value)}>
              {monthOptions.map((value) => (
                <option key={value} value={value}>
                  {monthLabel(value)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error ? <p className="error">{error}</p> : null}

        <div className="attendance-toolbar">
          <p className="attendance-summary">{summaryText}</p>
          <DownloadButton
            onClick={downloadCsv}
            disabled={!sheet || sheet.items.length === 0}
          />
        </div>

        {!loading && sheet && sheet.items.length > 0 ? (
          <div className="attendance-legend" aria-label="Day colour legend">
            <span className="attendance-legend-item">
              <span className="attendance-legend-swatch present" /> Present
            </span>
            <span className="attendance-legend-item">
              <span className="attendance-legend-swatch weekly-off" /> Weekly off
            </span>
            <span className="attendance-legend-item">
              <span className="attendance-legend-swatch holiday" /> Holiday
            </span>
          </div>
        ) : null}

        {!loading && sheet ? (
          sheet.items.length === 0 ? (
            <p className="pass-empty">
              {view === 'swimmer'
                ? 'No swimmers with a pass period overlapping this month.'
                : 'No swimmers found for this month.'}
            </p>
          ) : (
            <div className="attendance-sheet-scroll">
              <table className="attendance-sheet-table">
                <thead>
                  <tr>
                    <th className="attendance-sticky-col">Swimmer</th>
                    {sheet.days.map((day) => {
                      const kind = kindForDay(day);
                      return (
                        <th
                          key={day}
                          className={`attendance-day-col${dayKindClass(kind)}`}
                          title={dayTitle(day, false, true)}
                        >
                          {dayHeader(day, view)}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {sheet.items.map((item) => {
                    const present = new Set(item.presentDays);
                    const passStart = item.passStart ?? '';
                    const passEnd = item.passValidUntil ?? '';
                    return (
                      <tr key={item.registrationId}>
                        <td className="attendance-sticky-col">
                          <span
                            className="attendance-swimmer-name"
                            title={
                              view === 'swimmer' && passStart && passEnd
                                ? `Pass: ${rangeLabel(passStart, passEnd)}`
                                : undefined
                            }
                          >
                            {item.fullName}
                          </span>
                        </td>
                        {sheet.days.map((day) => {
                          const inPass =
                            view !== 'swimmer' ||
                            !passStart ||
                            !passEnd ||
                            (day >= passStart && day <= passEnd);
                          const isPresent = present.has(day);
                          const kind = kindForDay(day);
                          return (
                            <td
                              key={day}
                              className={`attendance-day-col${dayKindClass(kind)}${
                                isPresent ? ' present' : ''
                              }${!inPass ? ' attendance-out-of-pass' : ''}`}
                              title={dayTitle(day, isPresent, inPass)}
                            >
                              {isPresent ? 'P' : ''}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </div>
    </PlatformPage>
  );
}
