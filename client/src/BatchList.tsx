import { FormEvent, useEffect, useState } from 'react';
import { MenuBackLink } from './MenuBackLink';

type Period = 'AM' | 'PM';

type Session = 'Morning' | 'Afternoon' | 'Evening' | 'Complete Day';

type ClockTime = {
  hour: string;
  minute: string;
  period: Period;
};

type ScheduleSettings = {
  id: string;
  session: Session;
  batchMinutes: number;
  breakMinutes: number;
  firstStart: ClockTime;
  lastEnd: ClockTime;
};

type BatchSlot = {
  id: string;
  name: string;
  type: string;
  startTime: ClockTime;
  endTime: ClockTime;
};

const BATCH_TYPES = ['General', 'Ladies', 'Advance'];
const SESSIONS: Session[] = ['Morning', 'Afternoon', 'Evening', 'Complete Day'];
const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

const SESSION_DEFAULTS: Record<Session, { firstStart: ClockTime; lastEnd: ClockTime }> = {
  Morning: {
    firstStart: { hour: '06', minute: '00', period: 'AM' },
    lastEnd: { hour: '12', minute: '00', period: 'PM' },
  },
  Afternoon: {
    firstStart: { hour: '12', minute: '00', period: 'PM' },
    lastEnd: { hour: '05', minute: '00', period: 'PM' },
  },
  Evening: {
    firstStart: { hour: '05', minute: '00', period: 'PM' },
    lastEnd: { hour: '08', minute: '00', period: 'PM' },
  },
  'Complete Day': {
    firstStart: { hour: '06', minute: '00', period: 'AM' },
    lastEnd: { hour: '08', minute: '00', period: 'PM' },
  },
};

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseSession(value: unknown): Session {
  return SESSIONS.includes(value as Session) ? (value as Session) : 'Complete Day';
}

function defaultSchedule(session: Session = 'Complete Day'): ScheduleSettings {
  const times = SESSION_DEFAULTS[session];
  return {
    id: createId(),
    session,
    batchMinutes: 60,
    breakMinutes: 15,
    firstStart: { ...times.firstStart },
    lastEnd: { ...times.lastEnd },
  };
}

function clockToMinutes(time: ClockTime) {
  let hour = Number(time.hour) % 12;
  if (time.period === 'PM') hour += 12;
  return hour * 60 + Number(time.minute);
}

function minutesToClock(total: number): ClockTime {
  const normalized = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const h24 = Math.floor(normalized / 60);
  const minute = String(normalized % 60).padStart(2, '0');
  const period: Period = h24 >= 12 ? 'PM' : 'AM';
  let hour = h24 % 12;
  if (hour === 0) hour = 12;
  return { hour: String(hour).padStart(2, '0'), minute, period };
}

function clockTo24h(time: ClockTime) {
  const minutes = clockToMinutes(time);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parse24hToClock(value: string): ClockTime {
  const [h, m] = value.slice(0, 5).split(':').map(Number);
  return minutesToClock(h * 60 + m);
}

function generateSlotsFromSchedule(settings: ScheduleSettings, startIndex: number): BatchSlot[] {
  const batch = Number(settings.batchMinutes);
  const brk = Number(settings.breakMinutes);
  let cursor = clockToMinutes(settings.firstStart);
  const endLimit = clockToMinutes(settings.lastEnd);
  const slots: BatchSlot[] = [];
  let index = startIndex;

  if (!batch || batch <= 0 || brk < 0 || Number.isNaN(cursor) || Number.isNaN(endLimit)) {
    return [];
  }
  if (cursor >= endLimit) return [];

  while (cursor + batch <= endLimit) {
    slots.push({
      id: createId(),
      name: `Batch ${index}`,
      type: 'General',
      startTime: minutesToClock(cursor),
      endTime: minutesToClock(cursor + batch),
    });
    cursor += batch + brk;
    index += 1;
  }

  return slots;
}

function sessionsOverlap(
  a: { firstStart: ClockTime; lastEnd: ClockTime },
  b: { firstStart: ClockTime; lastEnd: ClockTime },
) {
  const aStart = clockToMinutes(a.firstStart);
  const aEnd = clockToMinutes(a.lastEnd);
  const bStart = clockToMinutes(b.firstStart);
  const bEnd = clockToMinutes(b.lastEnd);
  return aStart < bEnd && bStart < aEnd;
}

function findSessionOverlapError(rows: ScheduleSettings[]) {
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      if (sessionsOverlap(rows[i], rows[j])) {
        return `${rows[i].session} and ${rows[j].session} session times overlap`;
      }
    }
  }
  return null;
}

function TimeSelect({
  value,
  onChange,
  required,
}: {
  value: ClockTime;
  onChange: (value: ClockTime) => void;
  required?: boolean;
}) {
  return (
    <div className="time-field">
      <select
        className="time-hour"
        value={value.hour}
        onChange={(e) => onChange({ ...value, hour: e.target.value })}
        required={required}
        aria-label="Hour"
      >
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="time-colon">:</span>
      <select
        className="time-minute"
        value={value.minute}
        onChange={(e) => onChange({ ...value, minute: e.target.value })}
        required={required}
        aria-label="Minute"
      >
        {MINUTES.filter((_, i) => i % 5 === 0).map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
        {!MINUTES.filter((_, i) => i % 5 === 0).includes(value.minute) ? (
          <option value={value.minute}>{value.minute}</option>
        ) : null}
      </select>
      <select
        className="time-period"
        value={value.period}
        onChange={(e) => onChange({ ...value, period: e.target.value as Period })}
        required={required}
        aria-label="AM/PM"
      >
        <option value="AM">am</option>
        <option value="PM">pm</option>
      </select>
    </div>
  );
}

function formatClockDisplay(time: ClockTime) {
  return `${Number(time.hour)}:${time.minute} ${time.period}`;
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M7 7l1 13h8l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function BatchList() {
  const [schedules, setSchedules] = useState<ScheduleSettings[]>([defaultSchedule()]);
  const [slots, setSlots] = useState<BatchSlot[]>([]);
  const [mode, setMode] = useState<'edit' | 'saved'>('edit');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetch('/api/batches')
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load batches');
        return res.json();
      })
      .then(
        (data: {
          schedules?: Array<{
            id?: string;
            session?: string;
            batchMinutes: number;
            breakMinutes: number;
            firstStart: string;
            lastEnd: string;
          }>;
          settings?: {
            session?: string;
            batchMinutes: number;
            breakMinutes: number;
            firstStart: string;
            lastEnd: string;
          };
          slots?: Array<{
            id: string;
            name: string;
            type: string;
            startTime: string;
            endTime: string;
          }>;
        }) => {
          if (data.schedules?.length) {
            setSchedules(
              data.schedules.map((row) => ({
                id: row.id ?? createId(),
                session: parseSession(row.session),
                batchMinutes: row.batchMinutes,
                breakMinutes: row.breakMinutes,
                firstStart: parse24hToClock(row.firstStart),
                lastEnd: parse24hToClock(row.lastEnd),
              })),
            );
          } else if (data.settings) {
            setSchedules([
              {
                id: createId(),
                session: parseSession(data.settings.session),
                batchMinutes: data.settings.batchMinutes,
                breakMinutes: data.settings.breakMinutes,
                firstStart: parse24hToClock(data.settings.firstStart),
                lastEnd: parse24hToClock(data.settings.lastEnd),
              },
            ]);
          }

          const loadedSlots =
            data.slots?.map((slot) => ({
              ...slot,
              startTime: parse24hToClock(slot.startTime),
              endTime: parse24hToClock(slot.endTime),
            })) ?? [];
          setSlots(loadedSlots);
          if (loadedSlots.length > 0) setMode('saved');
        },
      )
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  function updateSchedule(id: string, patch: Partial<ScheduleSettings>) {
    setSchedules((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function updateSession(id: string, session: Session) {
    const times = SESSION_DEFAULTS[session];
    updateSchedule(id, {
      session,
      firstStart: { ...times.firstStart },
      lastEnd: { ...times.lastEnd },
    });
  }

  function addScheduleRow() {
    setSchedules((prev) => [...prev, defaultSchedule()]);
  }

  function removeScheduleRow(id: string) {
    setSchedules((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.id !== id)));
  }

  function onGenerate(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    for (const schedule of schedules) {
      if (clockToMinutes(schedule.firstStart) >= clockToMinutes(schedule.lastEnd)) {
        setError('Each schedule must have start time before end time');
        return;
      }
    }

    const overlapError = findSessionOverlapError(schedules);
    if (overlapError) {
      setError(overlapError);
      return;
    }

    const next: BatchSlot[] = [];
    for (const schedule of schedules) {
      next.push(...generateSlotsFromSchedule(schedule, next.length + 1));
    }

    if (next.length === 0) {
      setError('No slots could be generated with these settings');
      return;
    }

    setSlots(next.map((slot, index) => ({ ...slot, name: `Batch ${index + 1}` })));
    setSuccess(`${next.length} slot${next.length === 1 ? '' : 's'} generated`);
  }

  function addSlot() {
    const last = slots[slots.length - 1];
    const schedule = schedules[0] ?? defaultSchedule();
    const start = last ? last.endTime : schedule.firstStart;
    const endMinutes = clockToMinutes(start) + Number(schedule.batchMinutes || 60);
    setSlots((prev) => [
      ...prev,
      {
        id: createId(),
        name: `Batch ${prev.length + 1}`,
        type: 'General',
        startTime: start,
        endTime: minutesToClock(endMinutes),
      },
    ]);
  }

  function updateSlot(id: string, patch: Partial<BatchSlot>) {
    setSlots((prev) => prev.map((slot) => (slot.id === id ? { ...slot, ...patch } : slot)));
  }

  function removeSlot(id: string) {
    setSlots((prev) =>
      prev
        .filter((slot) => slot.id !== id)
        .map((slot, index) => ({ ...slot, name: `Batch ${index + 1}` })),
    );
  }

  async function saveSlots() {
    setSaving(true);
    setError('');
    setSuccess('');
    const overlapError = findSessionOverlapError(schedules);
    if (overlapError) {
      setError(overlapError);
      setSaving(false);
      return;
    }
    try {
      const res = await fetch('/api/batches', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schedules: schedules.map((row) => ({
            session: row.session,
            batchMinutes: row.batchMinutes,
            breakMinutes: row.breakMinutes,
            firstStart: clockTo24h(row.firstStart),
            lastEnd: clockTo24h(row.lastEnd),
          })),
          slots: slots.map((slot) => ({
            name: slot.name,
            type: slot.type,
            startTime: clockTo24h(slot.startTime),
            endTime: clockTo24h(slot.endTime),
          })),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? 'Failed to save');
      if (payload.schedules) {
        setSchedules(
          payload.schedules.map(
            (row: {
              id?: string;
              session?: string;
              batchMinutes: number;
              breakMinutes: number;
              firstStart: string;
              lastEnd: string;
            }) => ({
              id: row.id ?? createId(),
              session: parseSession(row.session),
              batchMinutes: row.batchMinutes,
              breakMinutes: row.breakMinutes,
              firstStart: parse24hToClock(row.firstStart),
              lastEnd: parse24hToClock(row.lastEnd),
            }),
          ),
        );
      }
      if (payload.slots) {
        setSlots(
          payload.slots.map(
            (slot: {
              id: string;
              name: string;
              type: string;
              startTime: string;
              endTime: string;
            }) => ({
              ...slot,
              startTime: parse24hToClock(slot.startTime),
              endTime: parse24hToClock(slot.endTime),
            }),
          ),
        );
      }
      setMode('saved');
      setSuccess('Batch schedule saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="top-row">
          <MenuBackLink />
        </div>
        <h1>Batch List</h1>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (mode === 'saved') {
    return (
      <div className="page">
        <div className="top-row">
          <MenuBackLink />
        </div>

        <h1>Batch List</h1>
        <p className="lede">Create and manage swimming batch time slots.</p>

        <section className="card saved-summary">
          <div className="saved-schedules">
            {schedules.map((schedule, index) => (
              <div className="saved-schedule" key={schedule.id}>
                <h3>Schedule {index + 1}</h3>
                <p>
                  <strong>Session:</strong> {schedule.session}
                </p>
                <p>
                  <strong>Batch Duration (minutes):</strong> {schedule.batchMinutes} minutes
                </p>
                <p>
                  <strong>Break time (minutes):</strong> {schedule.breakMinutes} minutes
                </p>
                <p>
                  <strong>Session start time:</strong> {formatClockDisplay(schedule.firstStart)}
                </p>
                <p>
                  <strong>Session end time:</strong> {formatClockDisplay(schedule.lastEnd)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <div className="saved-list-head">
          <h2>
            {slots.length} batch{slots.length === 1 ? '' : 'es'} scheduled
          </h2>
          <button type="button" className="ghost-btn" onClick={() => setMode('edit')}>
            Modify batches
          </button>
        </div>

        <div className="batch-saved-table-wrap">
          <table className="batch-saved-table">
            <thead>
              <tr>
                <th scope="col">Batch</th>
                <th scope="col">Type</th>
                <th scope="col">Start time</th>
                <th scope="col">End time</th>
              </tr>
            </thead>
            <tbody>
              {slots.map((slot) => (
                <tr key={slot.id}>
                  <td className="batch-saved-name">{slot.name}</td>
                  <td>{slot.type}</td>
                  <td>{formatClockDisplay(slot.startTime)}</td>
                  <td>{formatClockDisplay(slot.endTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {error ? <p className="error">{error}</p> : null}
        {success ? <p className="success">{success}</p> : null}
      </div>
    );
  }

  return (
    <div className="page">
      <div className="top-row">
        <MenuBackLink />
      </div>

      <h1>Batch List</h1>
      <p className="lede">Create and manage swimming batch time slots.</p>

      <section className="card schedule-card">
        <h2>Schedule settings</h2>
        <p className="schedule-session-note">
          If there is major break (like lunch break) in batches, then please create session-wise
          schedule
        </p>
        <form onSubmit={onGenerate}>
          <div className="schedule-rows">
            {schedules.map((schedule, index) => {
              const isLast = index === schedules.length - 1;
              return (
                <div className="schedule-row" key={schedule.id}>
                  <label className="field">
                    <span className="label">
                      Session <span className="req">*</span>
                    </span>
                    <select
                      value={schedule.session}
                      onChange={(e) => updateSession(schedule.id, e.target.value as Session)}
                      required
                    >
                      {SESSIONS.map((session) => (
                        <option key={session} value={session}>
                          {session}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="label">
                      Batch Duration (minutes) <span className="req">*</span>
                    </span>
                    <input
                      type="number"
                      min={1}
                      value={schedule.batchMinutes}
                      onChange={(e) =>
                        updateSchedule(schedule.id, { batchMinutes: Number(e.target.value) || 0 })
                      }
                      required
                    />
                  </label>
                  <label className="field">
                    <span className="label">
                      Break time (minutes) <span className="req">*</span>
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={schedule.breakMinutes}
                      onChange={(e) =>
                        updateSchedule(schedule.id, { breakMinutes: Number(e.target.value) || 0 })
                      }
                      required
                    />
                  </label>
                  <label className="field">
                    <span className="label">
                      Session start time <span className="req">*</span>
                    </span>
                    <TimeSelect
                      value={schedule.firstStart}
                      onChange={(firstStart) => updateSchedule(schedule.id, { firstStart })}
                      required
                    />
                  </label>
                  <label className="field">
                    <span className="label">
                      Session end time <span className="req">*</span>
                    </span>
                    <TimeSelect
                      value={schedule.lastEnd}
                      onChange={(lastEnd) => updateSchedule(schedule.id, { lastEnd })}
                      required
                    />
                  </label>
                  <div className="schedule-row-actions">
                    {isLast ? (
                      <button
                        type="button"
                        className="icon-btn icon-add"
                        onClick={addScheduleRow}
                        title="Add another schedule"
                        aria-label="Add another schedule"
                      >
                        +
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="icon-btn icon-remove"
                        onClick={() => removeScheduleRow(schedule.id)}
                        title="Remove schedule"
                        aria-label="Remove schedule"
                      >
                        −
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <button type="submit" className="generate-btn">
            Generate slots
          </button>
        </form>
      </section>

      {slots.length > 0 ? (
        <section className="card slots-card">
          <div className="slots-head">
            <h2>Batch time slots</h2>
            <button type="button" className="btn ghost-btn" onClick={addSlot}>
              Add slot
            </button>
          </div>

          <div className="slots-table-wrap">
            <div className="slots-table-head">
              <span>Batch</span>
              <span>Type</span>
              <span>Start time</span>
              <span>End time</span>
              <span />
            </div>
            <div className="slots-list">
              {slots.map((slot) => (
                <div className="slot-row" key={slot.id}>
                  <strong className="slot-name">{slot.name}</strong>
                  <select
                    value={slot.type}
                    onChange={(e) => updateSlot(slot.id, { type: e.target.value })}
                  >
                    {BATCH_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                  <TimeSelect
                    value={slot.startTime}
                    onChange={(startTime) => updateSlot(slot.id, { startTime })}
                  />
                  <TimeSelect
                    value={slot.endTime}
                    onChange={(endTime) => updateSlot(slot.id, { endTime })}
                  />
                  <button
                    type="button"
                    className="icon-action icon-action-danger slot-remove-btn"
                    onClick={() => removeSlot(slot.id)}
                    aria-label={`Remove ${slot.name}`}
                    title="Remove"
                  >
                    <DeleteIcon />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="slots-actions">
            <button type="button" className="submit" onClick={saveSlots} disabled={saving}>
              {saving ? 'Saving…' : 'Save schedule'}
            </button>
          </div>
        </section>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
      {success ? <p className="success">{success}</p> : null}
    </div>
  );
}
