import { FormEvent, useEffect, useMemo, useState } from 'react';
import { MenuBackLink } from './MenuBackLink';
import { nationalHolidaysForYear } from './nationalHolidays';

type HolidayType = 'annual' | 'surprise';
type DaySpan = 'full' | 'partial';

type HolidayItem = {
  id: number;
  holidayType: HolidayType;
  name: string;
  startDate: string;
  endDate: string;
  daySpan?: DaySpan;
  startTime?: string;
  endTime?: string;
  notes: string;
  extendPassHolders?: boolean;
};

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

function currentYear() {
  return new Date().getFullYear();
}

function yearOptions() {
  const y = currentYear();
  return [y - 1, y, y + 1, y + 2];
}

function formatRange(start: string, end: string) {
  if (!start) return '—';
  if (!end || end === start) return start;
  return `${start} to ${end}`;
}

function formatSurpriseWhen(item: HolidayItem) {
  const dateLabel = formatRange(item.startDate, item.endDate);
  if (item.daySpan === 'partial' && item.startTime && item.endTime) {
    return `${dateLabel} · ${item.startTime}–${item.endTime} (Partial day)`;
  }
  return `${dateLabel} (Full day)`;
}

const emptyForm = {
  name: '',
  startDate: '',
  endDate: '',
  notes: '',
  startTime: '',
  endTime: '',
};

export function HolidayManagement() {
  const [year, setYear] = useState(currentYear());
  const [weeklyHolidays, setWeeklyHolidays] = useState<string[]>([]);
  const [holidays, setHolidays] = useState<HolidayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingWeekly, setSavingWeekly] = useState(false);
  const [savingLeave, setSavingLeave] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [annualForm, setAnnualForm] = useState(emptyForm);
  const [surpriseForm, setSurpriseForm] = useState(emptyForm);
  const [surpriseDaySpan, setSurpriseDaySpan] = useState<DaySpan>('full');
  const [extendPassHolders, setExtendPassHolders] = useState(false);
  const [selectedNationalIds, setSelectedNationalIds] = useState<string[]>([]);
  const [showCustomAnnual, setShowCustomAnnual] = useState(false);

  const nationalOptions = useMemo(() => nationalHolidaysForYear(year), [year]);

  const annualLeaves = useMemo(
    () => holidays.filter((item) => item.holidayType === 'annual'),
    [holidays],
  );
  const surpriseLeaves = useMemo(
    () => holidays.filter((item) => item.holidayType === 'surprise'),
    [holidays],
  );

  const addedNationalKeys = useMemo(() => {
    return new Set(annualLeaves.map((item) => `${item.name.toLowerCase()}|${item.startDate}`));
  }, [annualLeaves]);

  function isNationalAdded(name: string, date: string) {
    return addedNationalKeys.has(`${name.toLowerCase()}|${date}`);
  }

  function findAnnualLeave(name: string, date: string) {
    return annualLeaves.find(
      (item) => item.name.toLowerCase() === name.toLowerCase() && item.startDate === date,
    );
  }

  const customAnnualLeaves = useMemo(() => {
    return annualLeaves.filter((leave) => {
      return !nationalOptions.some(
        (option) =>
          option.name.toLowerCase() === leave.name.toLowerCase() &&
          option.date === leave.startDate,
      );
    });
  }, [annualLeaves, nationalOptions]);

  const annualListRows = useMemo(() => {
    type AnnualRow =
      | {
          kind: 'national';
          sortDate: string;
          option: (typeof nationalOptions)[number];
        }
      | {
          kind: 'custom';
          sortDate: string;
          leave: HolidayItem;
        };

    const rows: AnnualRow[] = [
      ...nationalOptions.map((option) => ({
        kind: 'national' as const,
        sortDate: option.date,
        option,
      })),
      ...customAnnualLeaves.map((leave) => ({
        kind: 'custom' as const,
        sortDate: leave.startDate,
        leave,
      })),
    ];

    return rows.sort((a, b) => {
      const byDate = a.sortDate.localeCompare(b.sortDate);
      if (byDate !== 0) return byDate;
      const nameA = a.kind === 'national' ? a.option.name : a.leave.name;
      const nameB = b.kind === 'national' ? b.option.name : b.leave.name;
      return nameA.localeCompare(nameB);
    });
  }, [nationalOptions, customAnnualLeaves]);

  const selectableNationalCount = useMemo(
    () =>
      nationalOptions.filter((option) => !isNationalAdded(option.name, option.date)).length,
    [nationalOptions, addedNationalKeys],
  );

  useEffect(() => {
    setSelectedNationalIds([]);
    setAnnualForm(emptyForm);
    setSurpriseForm(emptyForm);
    setSurpriseDaySpan('full');
    setExtendPassHolders(false);
    setShowCustomAnnual(false);
  }, [year]);

  function toggleNational(id: string) {
    setSelectedNationalIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
    setSuccess('');
  }

  function selectAllNational() {
    setSelectedNationalIds(
      nationalOptions
        .filter((option) => !isNationalAdded(option.name, option.date))
        .map((option) => option.id),
    );
    setSuccess('');
  }

  function clearNationalSelection() {
    setSelectedNationalIds([]);
    setSuccess('');
  }

  async function load(nextYear = year) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/holidays?year=${nextYear}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to load holidays');
      setWeeklyHolidays(Array.isArray(body.weeklyHolidays) ? body.weeklyHolidays : []);
      setHolidays(Array.isArray(body.holidays) ? body.holidays : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setHolidays([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(year);
  }, [year]);

  function toggleWeekday(day: string) {
    setWeeklyHolidays((prev) =>
      prev.includes(day) ? prev.filter((item) => item !== day) : [...prev, day],
    );
    setSuccess('');
  }

  async function saveWeekly() {
    setSavingWeekly(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/holidays/weekly', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weeklyHolidays }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to save weekly holidays');
      setWeeklyHolidays(Array.isArray(body.weeklyHolidays) ? body.weeklyHolidays : weeklyHolidays);
      setSuccess('Weekly holidays saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save weekly holidays');
    } finally {
      setSavingWeekly(false);
    }
  }

  async function addLeave(
    type: HolidayType,
    form: typeof emptyForm,
    options?: { extendPassHolders?: boolean; daySpan?: DaySpan },
  ) {
    setSavingLeave(true);
    setError('');
    setSuccess('');
    try {
      const daySpan = type === 'surprise' ? options?.daySpan ?? 'full' : 'full';
      const res = await fetch('/api/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holidayType: type,
          name: form.name.trim(),
          startDate: form.startDate,
          endDate: form.endDate || form.startDate,
          notes: form.notes.trim(),
          extendPassHolders: Boolean(options?.extendPassHolders),
          daySpan,
          startTime: daySpan === 'partial' ? form.startTime : undefined,
          endTime: daySpan === 'partial' ? form.endTime : undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to add leave');
      if (type === 'annual') {
        setAnnualForm(emptyForm);
        setShowCustomAnnual(false);
      } else {
        setSurpriseForm(emptyForm);
        setSurpriseDaySpan('full');
        setExtendPassHolders(false);
      }
      if (type === 'surprise' && options?.extendPassHolders) {
        const count = Number(body.extendedPassHolders ?? 0);
        setSuccess(
          count > 0
            ? `Surprise leave added. Extended ${count} active pass holder${count === 1 ? '' : 's'} by 1 day.`
            : 'Surprise leave added. No active pass holders to extend.',
        );
      } else {
        setSuccess(type === 'annual' ? 'Annual leave added.' : 'Surprise leave added.');
      }
      await load(year);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add leave');
    } finally {
      setSavingLeave(false);
    }
  }

  async function addSelectedNationalLeaves() {
    const selected = nationalOptions.filter(
      (option) =>
        selectedNationalIds.includes(option.id) && !isNationalAdded(option.name, option.date),
    );
    if (selected.length === 0) {
      setError('Select at least one national holiday');
      return;
    }

    setSavingLeave(true);
    setError('');
    setSuccess('');
    try {
      for (const option of selected) {
        const res = await fetch('/api/holidays', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            holidayType: 'annual',
            name: option.name,
            startDate: option.date,
            endDate: option.date,
            notes: 'National holiday',
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? `Failed to add ${option.name}`);
      }
      setSelectedNationalIds([]);
      setSuccess(
        selected.length === 1
          ? '1 national holiday added.'
          : `${selected.length} national holidays added.`,
      );
      await load(year);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add selected holidays');
      await load(year);
    } finally {
      setSavingLeave(false);
    }
  }

  async function onAddAnnual(e: FormEvent) {
    e.preventDefault();
    await addLeave('annual', annualForm);
  }

  async function onAddSurprise(e: FormEvent) {
    e.preventDefault();
    if (surpriseDaySpan === 'partial') {
      if (!surpriseForm.startTime || !surpriseForm.endTime) {
        setError('Start time and end time are required for partial day');
        return;
      }
      if (surpriseForm.endTime <= surpriseForm.startTime) {
        setError('End time must be after start time');
        return;
      }
    }
    await addLeave('surprise', surpriseForm, {
      extendPassHolders,
      daySpan: surpriseDaySpan,
    });
  }

  async function removeLeave(id: number) {
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/holidays/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to delete');
      }
      setSuccess('Leave removed.');
      await load(year);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  return (
    <div className="page holiday-page">
      <div className="top-row">
        <MenuBackLink />
      </div>

      <div className="pass-head">
        <div>
          <h1>Holiday Management</h1>
          <p className="lede">Define weekly off days, annual leaves, and surprise closures.</p>
        </div>
        <label className="field holiday-year-field">
          <span className="label">Year</span>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {yearOptions().map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {success ? <p className="success">{success}</p> : null}
      {loading ? <p className="pass-empty">Loading…</p> : null}

      {!loading ? (
        <>
          <section className="card holiday-section">
            <h2>Weekly holidays</h2>
            <p className="hint">Select the regular weekly off day(s) for the pool.</p>
            <div className="holiday-weekdays">
              {WEEKDAYS.map((day) => {
                const selected = weeklyHolidays.includes(day);
                return (
                  <label key={day} className={`choice-chip${selected ? ' selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleWeekday(day)}
                    />
                    {day}
                  </label>
                );
              })}
            </div>
            <div className="pass-form-actions">
              <button
                type="button"
                className="submit"
                onClick={() => void saveWeekly()}
                disabled={savingWeekly}
              >
                {savingWeekly ? 'Saving…' : 'Save weekly holidays'}
              </button>
            </div>
          </section>

          <section className="card holiday-section">
            <h2>Annual leaves ({year})</h2>
            <p className="hint">
              Tick national holidays from the list below, then add the selected ones.
            </p>

            <div className="holiday-national-toolbar">
              <button
                type="button"
                className="terms-link"
                onClick={selectAllNational}
                disabled={selectableNationalCount === 0}
              >
                Select all
              </button>
              <button
                type="button"
                className="terms-link"
                onClick={clearNationalSelection}
                disabled={selectedNationalIds.length === 0}
              >
                Clear
              </button>
              <span className="holiday-national-count">
                {selectedNationalIds.length} selected
              </span>
            </div>

            <div className="holiday-national-list">
              {annualListRows.length === 0 ? (
                <p className="pass-empty">No national holidays available for {year}.</p>
              ) : (
                annualListRows.map((row) => {
                  if (row.kind === 'custom') {
                    const item = row.leave;
                    return (
                      <div
                        key={`custom-${item.id}`}
                        className="holiday-national-item selected added"
                      >
                        <label className="holiday-national-check">
                          <input type="checkbox" checked disabled />
                          <span className="holiday-national-name">{item.name}</span>
                          <span className="holiday-national-date">
                            {formatRange(item.startDate, item.endDate)}
                          </span>
                        </label>
                        <button
                          type="button"
                          className="remove-link"
                          onClick={() => void removeLeave(item.id)}
                        >
                          Remove
                        </button>
                      </div>
                    );
                  }

                  const option = row.option;
                  const addedLeave = findAnnualLeave(option.name, option.date);
                  const alreadyAdded = Boolean(addedLeave);
                  const checked = alreadyAdded || selectedNationalIds.includes(option.id);
                  return (
                    <div
                      key={option.id}
                      className={`holiday-national-item${checked ? ' selected' : ''}${alreadyAdded ? ' added' : ''}`}
                    >
                      <label className="holiday-national-check">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={alreadyAdded}
                          onChange={() => toggleNational(option.id)}
                        />
                        <span className="holiday-national-name">{option.name}</span>
                        <span className="holiday-national-date">{option.date}</span>
                      </label>
                      {alreadyAdded && addedLeave ? (
                        <button
                          type="button"
                          className="remove-link"
                          onClick={() => void removeLeave(addedLeave.id)}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>

            <div className="pass-form-actions">
              <button
                type="button"
                className="submit"
                onClick={() => void addSelectedNationalLeaves()}
                disabled={savingLeave || selectedNationalIds.length === 0}
              >
                {savingLeave
                  ? 'Saving…'
                  : selectedNationalIds.length > 1
                    ? `Add ${selectedNationalIds.length} selected holidays`
                    : 'Add selected holiday'}
              </button>
            </div>

            <div className="holiday-custom-divider">
              <button
                type="button"
                className="terms-link"
                onClick={() => setShowCustomAnnual((prev) => !prev)}
              >
                {showCustomAnnual ? 'Hide custom leave' : 'Add other / custom leave'}
              </button>
            </div>

            {showCustomAnnual ? (
              <form className="holiday-leave-form" onSubmit={onAddAnnual}>
                <label className="field">
                  <span className="label">
                    Name <span className="req">*</span>
                  </span>
                  <input
                    value={annualForm.name}
                    onChange={(e) => setAnnualForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Local festival / school holiday"
                    required
                  />
                </label>
                <div className="grid-2">
                  <label className="field">
                    <span className="label">
                      From <span className="req">*</span>
                    </span>
                    <input
                      type="date"
                      value={annualForm.startDate}
                      onChange={(e) =>
                        setAnnualForm((prev) => ({
                          ...prev,
                          startDate: e.target.value,
                          endDate: prev.endDate || e.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label className="field">
                    <span className="label">To</span>
                    <input
                      type="date"
                      value={annualForm.endDate}
                      min={annualForm.startDate || undefined}
                      onChange={(e) =>
                        setAnnualForm((prev) => ({ ...prev, endDate: e.target.value }))
                      }
                    />
                  </label>
                </div>
                <label className="field">
                  <span className="label">Notes</span>
                  <input
                    value={annualForm.notes}
                    onChange={(e) => setAnnualForm((prev) => ({ ...prev, notes: e.target.value }))}
                    placeholder="Optional note"
                  />
                </label>
                <div className="pass-form-actions">
                  <button
                    type="submit"
                    className="submit"
                    disabled={savingLeave || !annualForm.name || !annualForm.startDate}
                  >
                    {savingLeave ? 'Saving…' : 'Add custom leave'}
                  </button>
                </div>
              </form>
            ) : null}
          </section>

          <section className="card holiday-section">
            <h2>Surprise leaves</h2>
            <p className="hint">Unplanned or short-notice closures (maintenance, weather, etc.).</p>

            <form className="holiday-leave-form" onSubmit={onAddSurprise}>
              <div className="surprise-leave-row">
                <label className="field surprise-reason-field">
                  <span className="label">
                    Reason / name <span className="req">*</span>
                  </span>
                  <input
                    value={surpriseForm.name}
                    onChange={(e) => setSurpriseForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Heavy rain / filter cleaning"
                    required
                  />
                </label>
                <fieldset className="field surprise-span-field">
                  <legend className="label">
                    Day type <span className="req">*</span>
                  </legend>
                  <div className="surprise-span-options" role="radiogroup" aria-label="Day type">
                    <label className="surprise-span-option">
                      <input
                        type="radio"
                        name="surprise-day-span"
                        checked={surpriseDaySpan === 'full'}
                        onChange={() => {
                          setSurpriseDaySpan('full');
                          setSurpriseForm((prev) => ({ ...prev, startTime: '', endTime: '' }));
                        }}
                      />
                      <span>Full day</span>
                    </label>
                    <label className="surprise-span-option">
                      <input
                        type="radio"
                        name="surprise-day-span"
                        checked={surpriseDaySpan === 'partial'}
                        onChange={() => setSurpriseDaySpan('partial')}
                      />
                      <span>Partial day</span>
                    </label>
                  </div>
                </fieldset>
              </div>
              <div className="surprise-datetime-row">
                <label className="field surprise-date-field">
                  <span className="label">
                    Date <span className="req">*</span>
                  </span>
                  <input
                    type="date"
                    value={surpriseForm.startDate}
                    onChange={(e) =>
                      setSurpriseForm((prev) => ({
                        ...prev,
                        startDate: e.target.value,
                        endDate: e.target.value,
                      }))
                    }
                    required
                  />
                </label>
                {surpriseDaySpan === 'partial' ? (
                  <div className="surprise-time-row">
                    <label className="field surprise-time-field">
                      <span className="label">
                        Start time <span className="req">*</span>
                      </span>
                      <input
                        type="time"
                        value={surpriseForm.startTime}
                        onChange={(e) =>
                          setSurpriseForm((prev) => ({ ...prev, startTime: e.target.value }))
                        }
                        required
                      />
                    </label>
                    <label className="field surprise-time-field">
                      <span className="label">
                        End time <span className="req">*</span>
                      </span>
                      <input
                        type="time"
                        value={surpriseForm.endTime}
                        onChange={(e) =>
                          setSurpriseForm((prev) => ({ ...prev, endTime: e.target.value }))
                        }
                        required
                      />
                    </label>
                  </div>
                ) : null}
              </div>
              <label className="field">
                <span className="label">Notes</span>
                <input
                  value={surpriseForm.notes}
                  onChange={(e) => setSurpriseForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Optional note"
                />
              </label>
              <label className="extend-pass-check">
                <input
                  type="checkbox"
                  checked={extendPassHolders}
                  onChange={(e) => setExtendPassHolders(e.target.checked)}
                />
                <span>Extension to Pass holder</span>
              </label>
              <div className="pass-form-actions">
                <button type="submit" className="submit" disabled={savingLeave}>
                  {savingLeave ? 'Saving…' : 'Add surprise leave'}
                </button>
              </div>
            </form>

            <div className="holiday-list">
              {surpriseLeaves.length === 0 ? (
                <p className="pass-empty">No surprise leaves for {year}.</p>
              ) : (
                surpriseLeaves.map((item) => (
                  <div className="holiday-list-row" key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <span className="holiday-list-meta">{formatSurpriseWhen(item)}</span>
                      {item.extendPassHolders ? (
                        <span className="holiday-list-notes">Pass holders extended by 1 day</span>
                      ) : null}
                      {item.notes ? <span className="holiday-list-notes">{item.notes}</span> : null}
                    </div>
                    <button
                      type="button"
                      className="remove-link"
                      onClick={() => void removeLeave(item.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
