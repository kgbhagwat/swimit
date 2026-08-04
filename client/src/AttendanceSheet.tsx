import { useEffect, useMemo, useState } from 'react';
import { isApplicationDemo } from './applicationDemo';
import { DownloadButton } from './DownloadButton';
import { PlatformPage } from './PlatformPage';
import { ColumnSortDir, TableColumnFilter } from './TableColumnFilter';

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
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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

function eachIsoDate(startDate: string, endDate: string) {
  const dates: string[] = [];
  const cur = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(end.getTime()) || end < cur) return dates;
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function addDaysIso(isoDay: string, amount: number) {
  const date = new Date(`${isoDay}T00:00:00`);
  date.setDate(date.getDate() + amount);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function sampleAttendanceSheet(month: string, view: ViewMode): SheetResult {
  const days = daysInMonth(month);
  const today = todayIso();
  const monthStart = `${month}-01`;
  const monthEnd = days[days.length - 1];

  // Staggered pass issue dates so Swimmer month headings differ per person.
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
      passStart: monthStart,
      passEnd: monthEnd,
    },
    {
      id: -102,
      name: 'Sana Joshi',
      passType: 'Monthly Swim',
      batch: 'Evening B',
      coach: 'Amit Sharma',
      offset: 1,
      passStart: addDaysIso(monthStart, -20),
      passEnd: addDaysIso(monthStart, 9),
    },
    {
      id: -103,
      name: 'Vihaan Kulkarni',
      passType: 'Monthly Swim',
      batch: 'Morning A',
      coach: 'Riya Kulkarni',
      offset: 2,
      passStart: addDaysIso(monthStart, 3),
      passEnd: addDaysIso(monthStart, 32),
    },
  ];

  const visible =
    view === 'swimmer'
      ? swimmers.filter((s) => s.passStart <= monthEnd && s.passEnd >= monthStart)
      : swimmers;

  const allPassDays =
    view === 'swimmer'
      ? Array.from(
          new Set(visible.flatMap((s) => eachIsoDate(s.passStart, s.passEnd))),
        ).sort()
      : days;

  const weeklyOffDays = allPassDays.filter((day) => new Date(`${day}T00:00:00`).getDay() === 0);
  const holidayDay =
    allPassDays.find((day) => day.endsWith('-15')) ??
    allPassDays[Math.min(14, allPassDays.length - 1)];

  const items: AttendanceItem[] = visible.map((s) => {
    const passDays = eachIsoDate(s.passStart, s.passEnd);
    const presentDays = passDays.filter((day, i) => {
      if (day > today) return false;
      if (weeklyOffDays.includes(day) || day === holidayDay) return false;
      return (i + s.offset) % 3 !== 0;
    });
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
      items[0]?.passStart ?? monthStart,
    );
    const rangeEnd = items.reduce(
      (max, item) =>
        item.passValidUntil && item.passValidUntil > max ? item.passValidUntil : max,
      items[0]?.passValidUntil ?? monthEnd,
    );
    return {
      month,
      view,
      rangeStart,
      rangeEnd,
      days: allPassDays,
      weeklyOffDays,
      holidayDays: holidayDay ? [{ date: holidayDay, name: 'Sample holiday' }] : [],
      items,
      swimmerCount: items.length,
    };
  }

  return {
    month,
    view,
    days,
    weeklyOffDays: days.filter((day) => new Date(`${day}T00:00:00`).getDay() === 0),
    holidayDays: holidayDay ? [{ date: holidayDay, name: 'Sample holiday' }] : [],
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
  const [swimmerSelected, setSwimmerSelected] = useState<Set<string> | null>(null);
  const [swimmerSortDir, setSwimmerSortDir] = useState<ColumnSortDir>(null);
  const [openSwimmerFilter, setOpenSwimmerFilter] = useState(false);

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

  useEffect(() => {
    setSwimmerSelected(null);
    setSwimmerSortDir(null);
    setOpenSwimmerFilter(false);
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

  const visibleItems = useMemo(() => {
    const items = sheet?.items ?? [];
    const filtered = items.filter((item) => {
      if (!swimmerSelected) return true;
      return swimmerSelected.has(item.fullName);
    });
    if (!swimmerSortDir) return filtered;
    return [...filtered].sort((a, b) => {
      const cmp = a.fullName.localeCompare(b.fullName, undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      return swimmerSortDir === 'asc' ? cmp : -cmp;
    });
  }, [sheet?.items, swimmerSelected, swimmerSortDir]);

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
    let lines: string[];
    if (view === 'swimmer') {
      lines = [];
      for (const item of visibleItems) {
        const passStart = item.passStart ?? '';
        const passEnd = item.passValidUntil ?? '';
        const days = passStart && passEnd ? eachIsoDate(passStart, passEnd) : [];
        const present = new Set(item.presentDays);
        lines.push(`# ${item.fullName} (${rangeLabel(passStart, passEnd)})`);
        lines.push(['Day', ...days.map((day) => dayHeader(day, 'swimmer'))].map(csvEscape).join(','));
        lines.push(
          ['Status', ...days.map((day) => (present.has(day) ? 'P' : ''))].map(csvEscape).join(','),
        );
        lines.push('');
      }
    } else {
      const header = ['Swimmer', ...sheet.days.map((day) => dayHeader(day, view))];
      lines = [
        header.join(','),
        ...visibleItems.map((item) => {
          const present = new Set(item.presentDays);
          return [
            item.fullName,
            ...sheet.days.map((day) => (present.has(day) ? 'P' : '')),
          ]
            .map(csvEscape)
            .join(',');
        }),
      ];
    }
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
    if (sampleMode) return '';
    const count = sheet?.swimmerCount ?? 0;
    const swimmerWord = `swimmer${count === 1 ? '' : 's'}`;
    if (view === 'swimmer') {
      return `${count} ${swimmerWord} · own pass month (issue date → valid until), attendance till today`;
    }
    return `${count} ${swimmerWord} in ${monthLabel(month)}`;
  })();

  return (
    <PlatformPage
      title="Attendance Sheet"
      className="attendance-sheet-page"
      actions={
        <DownloadButton
          onClick={downloadCsv}
          disabled={!sheet || sheet.items.length === 0}
        />
      }
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

        {summaryText ? (
          <div className="attendance-toolbar">
            <p className="attendance-summary">{summaryText}</p>
          </div>
        ) : null}

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
          ) : view === 'swimmer' ? (
            <div className="attendance-swimmer-blocks">
              {visibleItems.length === 0 ? (
                <p className="pass-empty">No swimmers match these filters.</p>
              ) : (
                visibleItems.map((item) => {
                const passStart = item.passStart ?? '';
                const passEnd = item.passValidUntil ?? '';
                const days = passStart && passEnd ? eachIsoDate(passStart, passEnd) : [];
                const present = new Set(item.presentDays);
                return (
                  <section key={item.registrationId} className="attendance-swimmer-block">
                    <div className="attendance-swimmer-block-head">
                      <span className="attendance-swimmer-name">{item.fullName}</span>
                      {passStart && passEnd ? (
                        <span className="attendance-swimmer-pass-range">
                          Pass: {rangeLabel(passStart, passEnd)}
                        </span>
                      ) : null}
                    </div>
                    {days.length === 0 ? (
                      <p className="pass-empty">No pass period on file.</p>
                    ) : (
                      <div className="attendance-sheet-scroll">
                        <table className="attendance-sheet-table attendance-swimmer-own-table">
                          <thead>
                            <tr>
                              {days.map((day) => {
                                const kind = kindForDay(day);
                                return (
                                  <th
                                    key={day}
                                    className={`attendance-day-col${dayKindClass(kind)}`}
                                    title={dayTitle(day, false, true)}
                                  >
                                    {dayHeader(day, 'swimmer')}
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              {days.map((day) => {
                                const isPresent = present.has(day);
                                const kind = kindForDay(day);
                                return (
                                  <td
                                    key={day}
                                    className={`attendance-day-col${dayKindClass(kind)}${
                                      isPresent ? ' present' : ''
                                    }`}
                                    title={dayTitle(day, isPresent, true)}
                                  >
                                    {isPresent ? 'P' : ''}
                                  </td>
                                );
                              })}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                );
              })
              )}
            </div>
          ) : (
            <div className="attendance-sheet-scroll">
              <table className="attendance-sheet-table">
                <thead>
                  <tr>
                    <th className="attendance-sticky-col attendance-swimmer-col-head">
                      <TableColumnFilter
                        label="Swimmer"
                        values={sheet.items.map((item) => item.fullName)}
                        selected={swimmerSelected}
                        sortDir={swimmerSortDir}
                        open={openSwimmerFilter}
                        onToggleOpen={() => setOpenSwimmerFilter((prev) => !prev)}
                        onClose={() => setOpenSwimmerFilter(false)}
                        onSelectedChange={setSwimmerSelected}
                        onSort={setSwimmerSortDir}
                      />
                    </th>
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
                  {visibleItems.length === 0 ? (
                    <tr>
                      <td
                        className="attendance-sticky-col"
                        colSpan={1 + sheet.days.length}
                      >
                        No swimmers match these filters.
                      </td>
                    </tr>
                  ) : (
                    visibleItems.map((item) => {
                    const present = new Set(item.presentDays);
                    return (
                      <tr key={item.registrationId}>
                        <td className="attendance-sticky-col">
                          <span className="attendance-swimmer-name">{item.fullName}</span>
                        </td>
                        {sheet.days.map((day) => {
                          const isPresent = present.has(day);
                          const kind = kindForDay(day);
                          return (
                            <td
                              key={day}
                              className={`attendance-day-col${dayKindClass(kind)}${
                                isPresent ? ' present' : ''
                              }`}
                              title={dayTitle(day, isPresent, true)}
                            >
                              {isPresent ? 'P' : ''}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                  )}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </div>
    </PlatformPage>
  );
}
