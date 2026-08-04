import { FormEvent, useEffect, useMemo, useState } from 'react';
import { nationalHolidaysForYear } from './nationalHolidays';
import { PlatformPage } from './PlatformPage';

type HolidayType = 'annual' | 'surprise';
type DaySpan = 'full' | 'partial';
type SurpriseDayMode = 'multiple' | 'full' | 'partial';

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
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
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

function todayYmd() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatSurpriseWhen(item: HolidayItem) {
  const dateLabel = formatRange(item.startDate, item.endDate);
  if (item.daySpan === 'partial' && item.startTime && item.endTime) {
    return `${dateLabel} · ${item.startTime}–${item.endTime} (Partial day)`;
  }
  if (item.endDate && item.endDate !== item.startDate) {
    return `${dateLabel} (Multiple days)`;
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
  const [messageSource, setMessageSource] = useState<
    'weekly' | 'annual' | 'surprise' | 'page'
  >('page');

  function clearMessages() {
    setError('');
    setSuccess('');
  }

  function showError(message: string, source: typeof messageSource) {
    setMessageSource(source);
    setSuccess('');
    setError(message);
  }

  function showSuccess(message: string, source: typeof messageSource) {
    setMessageSource(source);
    setError('');
    setSuccess(message);
  }

  function actionMessage(source: typeof messageSource, className = 'holiday-action-message') {
    if (messageSource !== source) return null;
    if (error) return <p className={`error ${className}`}>{error}</p>;
    if (success) return <p className={`success ${className}`}>{success}</p>;
    return null;
  }

  const [annualForm, setAnnualForm] = useState(emptyForm);
  const [surpriseForm, setSurpriseForm] = useState(emptyForm);
  const [surpriseDayMode, setSurpriseDayMode] = useState<SurpriseDayMode>('full');
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
    setSurpriseDayMode('full');
    setExtendPassHolders(false);
    setShowCustomAnnual(false);
  }, [year]);

  function toggleNational(id: string) {
    setSelectedNationalIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
    clearMessages();
  }

  function selectAllNational() {
    setSelectedNationalIds(
      nationalOptions
        .filter((option) => !isNationalAdded(option.name, option.date))
        .map((option) => option.id),
    );
    clearMessages();
  }

  function clearNationalSelection() {
    setSelectedNationalIds([]);
    clearMessages();
  }

  async function load(nextYear = year, options?: { quiet?: boolean }) {
    if (!options?.quiet) {
      setLoading(true);
      setError('');
    }
    try {
      const res = await fetch(`/api/holidays?year=${nextYear}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to load holidays');
      setWeeklyHolidays(Array.isArray(body.weeklyHolidays) ? body.weeklyHolidays : []);
      setHolidays(Array.isArray(body.holidays) ? body.holidays : []);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load', 'page');
      setHolidays([]);
    } finally {
      if (!options?.quiet) setLoading(false);
    }
  }

  useEffect(() => {
    void load(year);
  }, [year]);

  function toggleWeekday(day: string) {
    setWeeklyHolidays((prev) =>
      prev.includes(day) ? prev.filter((item) => item !== day) : [...prev, day],
    );
    clearMessages();
  }

  async function saveWeekly() {
    setSavingWeekly(true);
    clearMessages();
    try {
      const res = await fetch('/api/holidays/weekly', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weeklyHolidays }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to save weekly holidays');
      setWeeklyHolidays(Array.isArray(body.weeklyHolidays) ? body.weeklyHolidays : weeklyHolidays);
      showSuccess('Weekly holidays saved.', 'weekly');
    } catch (err) {
      showError(
        err instanceof Error ? err.message : 'Failed to save weekly holidays',
        'weekly',
      );
    } finally {
      setSavingWeekly(false);
    }
  }

  async function addLeave(
    type: HolidayType,
    form: typeof emptyForm,
    options?: { extendPassHolders?: boolean; daySpan?: DaySpan },
  ) {
    const source = type === 'annual' ? 'annual' : 'surprise';
    setSavingLeave(true);
    clearMessages();
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
        setSurpriseDayMode('full');
        setExtendPassHolders(false);
      }
      if (type === 'surprise' && options?.extendPassHolders) {
        const count = Number(body.extendedPassHolders ?? 0);
        showSuccess(
          count > 0
            ? `Surprise leave added. Extended ${count} active pass holder${count === 1 ? '' : 's'} by 1 day.`
            : 'Surprise leave added. No active pass holders to extend.',
          'surprise',
        );
      } else {
        showSuccess(
          type === 'annual' ? 'Annual leave added.' : 'Surprise leave added.',
          source,
        );
      }
      await load(year, { quiet: true });
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to add leave', source);
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
      showError('Select at least one holiday', 'annual');
      return;
    }

    setSavingLeave(true);
    clearMessages();
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
            notes: option.scope === 'state' ? 'State holiday' : 'National holiday',
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? `Failed to add ${option.name}`);
      }
      setSelectedNationalIds([]);
      showSuccess(
        selected.length === 1 ? '1 holiday added.' : `${selected.length} holidays added.`,
        'annual',
      );
      await load(year, { quiet: true });
    } catch (err) {
      showError(
        err instanceof Error ? err.message : 'Failed to add selected holidays',
        'annual',
      );
      await load(year, { quiet: true });
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
    if (!surpriseForm.startDate) {
      showError('Date is required', 'surprise');
      return;
    }
    const today = todayYmd();
    if (surpriseForm.startDate < today) {
      showError('Cannot add a surprise leave in the past', 'surprise');
      return;
    }
    if (surpriseDayMode === 'multiple') {
      if (!surpriseForm.endDate) {
        showError('To date is required for multiple days', 'surprise');
        return;
      }
      if (surpriseForm.endDate < surpriseForm.startDate) {
        showError('To date must be on or after From date', 'surprise');
        return;
      }
      if (surpriseForm.endDate < today) {
        showError('Cannot add a surprise leave in the past', 'surprise');
        return;
      }
    }
    if (surpriseDayMode === 'partial') {
      if (!surpriseForm.startTime || !surpriseForm.endTime) {
        showError('Start time and end time are required for partial day', 'surprise');
        return;
      }
      if (surpriseForm.endTime <= surpriseForm.startTime) {
        showError('End time must be after start time', 'surprise');
        return;
      }
      if (surpriseForm.startDate === today) {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const currentTime = `${hh}:${mm}`;
        if (surpriseForm.endTime <= currentTime) {
          showError('Partial-day end time must be in the future', 'surprise');
          return;
        }
      }
    }
    const autoName =
      surpriseDayMode === 'partial'
        ? 'Surprise leave (partial)'
        : surpriseDayMode === 'multiple'
          ? 'Surprise leave (multiple days)'
          : 'Surprise leave';
    const payload = {
      ...surpriseForm,
      name: autoName,
      endDate:
        surpriseDayMode === 'multiple' ? surpriseForm.endDate : surpriseForm.startDate,
    };
    await addLeave('surprise', payload, {
      extendPassHolders,
      daySpan: surpriseDayMode === 'partial' ? 'partial' : 'full',
    });
  }

  async function removeLeave(id: number) {
    const existing = holidays.find((item) => item.id === id);
    const source = existing?.holidayType === 'surprise' ? 'surprise' : 'annual';
    clearMessages();
    try {
      const res = await fetch(`/api/holidays/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to delete');
      }
      showSuccess('Leave removed.', source);
      await load(year, { quiet: true });
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete', source);
    }
  }

  return (
    <PlatformPage
      title="Holidays"
      className="holiday-page"
      actions={
        <>
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
        </>
      }
    >
      <p className="lede batch-list-lede">
        Define weekly off days, annual leaves, and surprise closures.
      </p>

      {actionMessage('page')}
      {loading ? <p className="pass-empty">Loading…</p> : null}

      {!loading ? (
        <>
          <section className="card holiday-section">
            <h2>
              Weekly holiday{' '}
              <span className="holiday-heading-note">
                (Select the regular weekly off day(s) for the pool.)
              </span>
            </h2>
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
              {actionMessage('weekly', 'holiday-action-message holiday-action-message--inline')}
              <button
                type="button"
                className="submit holiday-weekdays-save"
                onClick={() => void saveWeekly()}
                disabled={savingWeekly}
              >
                {savingWeekly ? 'Saving…' : 'Save'}
              </button>
            </div>
          </section>

          <section className="card holiday-section">
            <h2>Annual leaves ({year})</h2>
            <div className="holiday-national-heading-row">
              <p className="hint">
                Tick national and state holidays from the list below, then add the selected ones.
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
            </div>

            <div className="holiday-national-list">
              {annualListRows.length === 0 ? (
                <p className="pass-empty">No holidays available for {year}.</p>
              ) : (
                annualListRows.map((row) => {
                  if (row.kind === 'custom') {
                    const item = row.leave;
                    const customKey = `custom-${item.id}`;
                    const checked = selectedNationalIds.includes(customKey);
                    return (
                      <div
                        key={customKey}
                        className={`holiday-national-item${checked ? ' selected' : ''} added`}
                      >
                        <label className="holiday-national-check">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleNational(customKey)}
                          />
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
                  const checked = selectedNationalIds.includes(option.id);
                  return (
                    <div
                      key={option.id}
                      className={`holiday-national-item${checked ? ' selected' : ''}${alreadyAdded ? ' added' : ''}`}
                    >
                      <label className="holiday-national-check">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleNational(option.id)}
                        />
                        <span className="holiday-national-name">
                          {option.name}
                          <span
                            className={`holiday-scope-badge holiday-scope-badge--${option.scope}`}
                          >
                            {option.scope === 'state' ? 'State' : 'National'}
                          </span>
                        </span>
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
              {actionMessage('annual')}
              <button
                type="button"
                className="submit"
                onClick={() => void addSelectedNationalLeaves()}
                disabled={savingLeave || selectedNationalIds.length === 0}
              >
                {savingLeave ? 'Saving…' : 'Save'}
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
              <form className="holiday-leave-form holiday-custom-annual-form" onSubmit={onAddAnnual}>
                <div className="holiday-custom-annual-row">
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
                  <label className="field">
                    <span className="label">
                      Date <span className="req">*</span>
                    </span>
                    <input
                      type="date"
                      value={annualForm.startDate}
                      onChange={(e) =>
                        setAnnualForm((prev) => ({
                          ...prev,
                          startDate: e.target.value,
                          endDate: e.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label className="field">
                    <span className="label">Note</span>
                    <input
                      value={annualForm.notes}
                      onChange={(e) =>
                        setAnnualForm((prev) => ({ ...prev, notes: e.target.value }))
                      }
                      placeholder="Optional note"
                    />
                  </label>
                  <div className="holiday-custom-annual-actions">
                    <button
                      type="submit"
                      className="submit"
                      disabled={savingLeave || !annualForm.name || !annualForm.startDate}
                    >
                      {savingLeave ? 'Saving…' : 'Add'}
                    </button>
                  </div>
                </div>
              </form>
            ) : null}
          </section>

          <section className="card holiday-section">
            <h2>Surprise leave</h2>
            <p className="hint">Unplanned or short-notice closures (maintenance, weather, etc.).</p>

            <form className="holiday-leave-form" onSubmit={onAddSurprise}>
              <div className="surprise-leave-row surprise-daytype-date-row">
                <fieldset className="field surprise-span-field">
                  <span className="label">
                    Day type <span className="req">*</span>
                  </span>
                  <div className="surprise-span-options" role="radiogroup" aria-label="Day type">
                    <label className="surprise-span-option">
                      <input
                        type="radio"
                        name="surprise-day-span"
                        checked={surpriseDayMode === 'multiple'}
                        onChange={() => {
                          setSurpriseDayMode('multiple');
                          setSurpriseForm((prev) => ({
                            ...prev,
                            startTime: '',
                            endTime: '',
                            endDate: prev.endDate || prev.startDate,
                          }));
                        }}
                      />
                      <span>Multiple day</span>
                    </label>
                    <label className="surprise-span-option">
                      <input
                        type="radio"
                        name="surprise-day-span"
                        checked={surpriseDayMode === 'full'}
                        onChange={() => {
                          setSurpriseDayMode('full');
                          setSurpriseForm((prev) => ({
                            ...prev,
                            startTime: '',
                            endTime: '',
                            endDate: prev.startDate,
                          }));
                        }}
                      />
                      <span>Full day</span>
                    </label>
                    <label className="surprise-span-option">
                      <input
                        type="radio"
                        name="surprise-day-span"
                        checked={surpriseDayMode === 'partial'}
                        onChange={() => {
                          setSurpriseDayMode('partial');
                          setSurpriseForm((prev) => ({
                            ...prev,
                            endDate: prev.startDate,
                          }));
                        }}
                      />
                      <span>Partial day</span>
                    </label>
                  </div>
                </fieldset>

                {surpriseDayMode === 'multiple' ? (
                  <div className="surprise-datetime-row surprise-datetime-inline">
                    <label className="field surprise-date-field">
                      <span className="label">
                        From <span className="req">*</span>
                      </span>
                      <input
                        type="date"
                        value={surpriseForm.startDate}
                        min={todayYmd()}
                        onChange={(e) =>
                          setSurpriseForm((prev) => ({
                            ...prev,
                            startDate: e.target.value,
                            endDate:
                              !prev.endDate || prev.endDate < e.target.value
                                ? e.target.value
                                : prev.endDate,
                          }))
                        }
                        required
                      />
                    </label>
                    <label className="field surprise-date-field">
                      <span className="label">
                        To <span className="req">*</span>
                      </span>
                      <input
                        type="date"
                        value={surpriseForm.endDate}
                        min={
                          surpriseForm.startDate && surpriseForm.startDate > todayYmd()
                            ? surpriseForm.startDate
                            : todayYmd()
                        }
                        onChange={(e) =>
                          setSurpriseForm((prev) => ({ ...prev, endDate: e.target.value }))
                        }
                        required
                      />
                    </label>
                  </div>
                ) : (
                  <div className="surprise-datetime-row surprise-datetime-inline">
                    <label className="field surprise-date-field">
                      <span className="label">
                        Date <span className="req">*</span>
                      </span>
                      <input
                        type="date"
                        value={surpriseForm.startDate}
                        min={todayYmd()}
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
                    {surpriseDayMode === 'partial' ? (
                      <>
                        <label className="field surprise-time-field">
                          <span className="label">
                            Start <span className="req">*</span>
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
                            End <span className="req">*</span>
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
                      </>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="surprise-notes-extend-row">
                <label className="field surprise-notes-field">
                  <span className="label">Notes / Reason</span>
                  <input
                    value={surpriseForm.notes}
                    onChange={(e) =>
                      setSurpriseForm((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    placeholder="Optional note"
                  />
                </label>
                <div className="field surprise-extend-field">
                  <span className="label">Give Extension to Pass</span>
                  <div
                    className="pass-yes-no"
                    role="radiogroup"
                    aria-label="Give Extension to Pass"
                  >
                    {(['Yes', 'No'] as const).map((option) => (
                      <label key={option} className="pass-yes-no-option">
                        <input
                          type="radio"
                          name="extendPassHolders"
                          value={option}
                          checked={extendPassHolders === (option === 'Yes')}
                          onChange={() => setExtendPassHolders(option === 'Yes')}
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="pass-form-actions">
                {actionMessage('surprise')}
                <button type="submit" className="submit" disabled={savingLeave}>
                  {savingLeave ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>

            <div className="holiday-list">
              {surpriseLeaves.length === 0 ? (
                <p className="pass-empty">No surprise leaves for {year}.</p>
              ) : (
                surpriseLeaves.map((item) => (
                  <div className="holiday-list-row holiday-list-row--surprise" key={item.id}>
                    <strong className="holiday-list-col holiday-list-col--name">{item.name}</strong>
                    <span className="holiday-list-col holiday-list-meta">
                      {formatSurpriseWhen(item)}
                    </span>
                    <span className="holiday-list-col holiday-list-notes">
                      {item.extendPassHolders ? 'Pass holders extended by 1 day' : '—'}
                    </span>
                    <span className="holiday-list-col holiday-list-notes">
                      {item.notes?.trim() ? item.notes : '—'}
                    </span>
                    <button
                      type="button"
                      className="remove-link holiday-list-col holiday-list-col--action"
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
    </PlatformPage>
  );
}
