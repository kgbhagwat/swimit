import { FormEvent, useEffect, useMemo, useState } from 'react';
import { isApplicationDemo } from './applicationDemo';
import { DownloadButton } from './DownloadButton';
import { saveCsvFile } from './csvDownload';
import { InPageSelect } from './InPageSelect';
import { useT } from './i18n';
import { PlatformPage } from './PlatformPage';

type WaterQualityRecord = {
  id: number;
  recordDate: string;
  phLevel: number;
  freeChlorine: number;
  totalAlkalinity: number;
  calciumHardness: number;
  testerName: string;
};

type WaterQualityForm = {
  recordDate: string;
  phLevel: string;
  freeChlorine: string;
  totalAlkalinity: string;
  calciumHardness: string;
  testerName: string;
};

type ReadingKey = 'phLevel' | 'freeChlorine' | 'totalAlkalinity' | 'calciumHardness';

const READING_RANGES: Record<ReadingKey, { min: number; max: number; unit: string }> = {
  phLevel: { min: 7.2, max: 7.6, unit: '' },
  freeChlorine: { min: 1, max: 3, unit: 'ppm' },
  totalAlkalinity: { min: 80, max: 120, unit: 'ppm' },
  calciumHardness: { min: 200, max: 400, unit: 'ppm' },
};

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

function formatDisplayDate(value: string) {
  const match = value.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function formatReading(value: number, unit = '') {
  const text = value.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return unit ? `${text} ${unit}` : text;
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function inRange(value: number, key: ReadingKey) {
  const { min, max } = READING_RANGES[key];
  return value >= min && value <= max;
}

function readingFlags(values: {
  phLevel: number;
  freeChlorine: number;
  totalAlkalinity: number;
  calciumHardness: number;
}) {
  return {
    phLevel: !inRange(values.phLevel, 'phLevel'),
    freeChlorine: !inRange(values.freeChlorine, 'freeChlorine'),
    totalAlkalinity: !inRange(values.totalAlkalinity, 'totalAlkalinity'),
    calciumHardness: !inRange(values.calciumHardness, 'calciumHardness'),
  };
}

function isPass(values: {
  phLevel: number;
  freeChlorine: number;
  totalAlkalinity: number;
  calciumHardness: number;
}) {
  const flags = readingFlags(values);
  return !flags.phLevel && !flags.freeChlorine && !flags.totalAlkalinity && !flags.calciumHardness;
}

function emptyForm(): WaterQualityForm {
  return {
    recordDate: todayIso(),
    phLevel: '',
    freeChlorine: '',
    totalAlkalinity: '',
    calciumHardness: '',
    testerName: '',
  };
}

function clampDateToToday(value: string) {
  const today = todayIso();
  const date = String(value ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return today;
  return date > today ? today : date;
}

function shiftIsoDate(isoDate: string, dayDelta: number) {
  const date = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  date.setDate(date.getDate() + dayDelta);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Sample rows for Application preview (non-account) mode — never after today. */
function sampleWaterQualityForMonth(month: string): WaterQualityRecord[] {
  const today = todayIso();
  const [year, mon] = month.split('-').map(Number);
  if (!year || !mon) return [];

  // Last calendar day of selected month (mon is 1–12).
  const monthLastDay = new Date(year, mon, 0).getDate();
  const monthEnd = `${month}-${String(monthLastDay).padStart(2, '0')}`;
  // Never later than today.
  let cursor = monthEnd <= today ? monthEnd : today;
  if (!cursor.startsWith(`${month}-`)) return [];

  const dates: string[] = [];
  while (dates.length < 5 && cursor.startsWith(`${month}-`) && cursor <= today) {
    dates.push(cursor);
    cursor = shiftIsoDate(cursor, -2);
  }

  const samples: Omit<WaterQualityRecord, 'id' | 'recordDate'>[] = [
    {
      phLevel: 7.4,
      freeChlorine: 2,
      totalAlkalinity: 100,
      calciumHardness: 280,
      testerName: 'Rahul Patil',
    },
    {
      phLevel: 7.0,
      freeChlorine: 2.2,
      totalAlkalinity: 95,
      calciumHardness: 260,
      testerName: 'Sneha Deshmukh',
    },
    {
      phLevel: 7.3,
      freeChlorine: 0.4,
      totalAlkalinity: 110,
      calciumHardness: 310,
      testerName: 'Amit Kulkarni',
    },
    {
      phLevel: 7.5,
      freeChlorine: 1.8,
      totalAlkalinity: 140,
      calciumHardness: 220,
      testerName: 'Priya Jadhav',
    },
    {
      phLevel: 7.2,
      freeChlorine: 2.5,
      totalAlkalinity: 90,
      calciumHardness: 450,
      testerName: 'Vikram Shah',
    },
  ];

  return samples.slice(0, dates.length).map((row, index) => ({
    id: -(index + 1),
    recordDate: dates[index],
    ...row,
  }));
}

export function WaterQuality() {
  const t = useT();
  const monthOptions = useMemo(() => buildMonthOptions(), []);
  const monthSelectOptions = useMemo(
    () => monthOptions.map((value) => ({ value, label: monthLabel(value) })),
    [monthOptions],
  );
  const [month, setMonth] = useState(currentMonthValue);
  const [items, setItems] = useState<WaterQualityRecord[]>([]);
  const [form, setForm] = useState<WaterQualityForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sampleMode, setSampleMode] = useState(false);
  const [sampleNextId, setSampleNextId] = useState(-100);

  async function load(selectedMonth = month) {
    setLoading(true);
    setError('');
    try {
      if (isApplicationDemo()) {
        setItems(sampleWaterQualityForMonth(selectedMonth));
        setSampleMode(true);
        setSampleNextId(-100);
        return;
      }
      const res = await fetch(`/api/water-quality?month=${encodeURIComponent(selectedMonth)}`);
      if (!res.ok) throw new Error('Failed to load water quality records');
      const data = (await res.json()) as WaterQualityRecord[];
      setItems(data);
      setSampleMode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(month);
  }, [month]);

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm());
  }

  function startEdit(item: WaterQualityRecord) {
    setEditingId(item.id);
    setForm({
      recordDate: clampDateToToday(item.recordDate),
      phLevel: String(item.phLevel),
      freeChlorine: String(item.freeChlorine),
      totalAlkalinity: String(item.totalAlkalinity),
      calciumHardness: String(item.calciumHardness),
      testerName: item.testerName,
    });
    setError('');
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError('');
    const recordDate = clampDateToToday(form.recordDate);
    if (!form.recordDate) {
      setError('Date is required');
      return;
    }
    if (form.recordDate > todayIso()) {
      setForm((prev) => ({ ...prev, recordDate }));
      setError('Date cannot be in the future');
      return;
    }
    if (!form.testerName.trim()) {
      setError('Tester name is required');
      return;
    }
    const payload: WaterQualityRecord = {
      id: editingId ?? 0,
      recordDate,
      phLevel: Number(form.phLevel),
      freeChlorine: Number(form.freeChlorine),
      totalAlkalinity: Number(form.totalAlkalinity),
      calciumHardness: Number(form.calciumHardness),
      testerName: form.testerName.trim(),
    };
    setSaving(true);
    try {
      if (sampleMode) {
        if (editingId != null) {
          setItems((prev) =>
            prev
              .map((row) => (row.id === editingId ? { ...payload, id: editingId } : row))
              .sort((a, b) => b.recordDate.localeCompare(a.recordDate) || b.id - a.id),
          );
        } else {
          const id = sampleNextId;
          setSampleNextId((n) => n - 1);
          setItems((prev) =>
            [{ ...payload, id }, ...prev].sort(
              (a, b) => b.recordDate.localeCompare(a.recordDate) || b.id - a.id,
            ),
          );
        }
        resetForm();
        return;
      }
      const res = await fetch(
        editingId ? `/api/water-quality/${editingId}` : '/api/water-quality',
        {
          method: editingId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recordDate: payload.recordDate,
            phLevel: payload.phLevel,
            freeChlorine: payload.freeChlorine,
            totalAlkalinity: payload.totalAlkalinity,
            calciumHardness: payload.calciumHardness,
            testerName: payload.testerName,
          }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to save');
      resetForm();
      await load(month);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: number, testerName: string) {
    if (!confirm(`${t('Delete record')} “${testerName}”?`)) return;
    setError('');
    try {
      if (sampleMode) {
        setItems((prev) => prev.filter((row) => row.id !== id));
        if (editingId === id) resetForm();
        return;
      }
      const res = await fetch(`/api/water-quality/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to delete');
      }
      if (editingId === id) resetForm();
      await load(month);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  function downloadCsv() {
    const header = [
      t('Date'),
      t('pH Level'),
      t('Free Chlorine'),
      t('Total Alkalinity'),
      t('Calcium Hardness'),
      t('Tester Name'),
      t('Result'),
    ];
    const lines = [
      header.join(','),
      ...items.map((item) =>
        [
          item.recordDate ? formatDisplayDate(item.recordDate) : '',
          String(item.phLevel),
          String(item.freeChlorine),
          String(item.totalAlkalinity),
          String(item.calciumHardness),
          item.testerName,
          isPass(item) ? t('Pass') : t('Fail'),
        ]
          .map(csvEscape)
          .join(','),
      ),
    ];
    saveCsvFile(`water-quality-${month}.csv`, lines.join('\n'));
  }

  return (
    <PlatformPage
      title="Water Quality"
      actions={
        <>
          <label className="expense-month">
            <span>{t('Month')}</span>
            <InPageSelect
              value={month}
              onChange={setMonth}
              options={monthSelectOptions}
              required
              aria-label={t('Month')}
            />
          </label>
          <DownloadButton onClick={downloadCsv} disabled={items.length === 0} />
        </>
      }
    >
      <section
        className={`pass-form-card pool-core-form pass-table-card expense-table-card water-quality-table-card${
          sampleMode ? ' pass-form-card--sample' : ''
        }`}
      >
        {sampleMode ? (
          <div className="user-mgmt-sample-watermark" aria-hidden="true">
            {t('Sample')}
          </div>
        ) : null}
        <div className="expense-table-head">
          <span>{t('Date')}</span>
          <span>{t('pH Level')}</span>
          <span>{t('Free Chlorine')}</span>
          <span>{t('Total Alkalinity')}</span>
          <span>{t('Calcium Hardness')}</span>
          <span>{t('Tester Name')}</span>
          <span>{t('Actions')}</span>
          <span>{t('Result')}</span>
        </div>

        <form className="expense-entry-row" onSubmit={onSave}>
          <label className="expense-entry-field expense-entry-field--full">
            <span className="expense-entry-label">{t('Date')}</span>
            <input
              type="date"
              value={form.recordDate}
              max={todayIso()}
              onChange={(e) => {
                setForm({
                  ...form,
                  recordDate: e.target.value ? clampDateToToday(e.target.value) : '',
                });
              }}
              onBlur={() => {
                if (form.recordDate) {
                  setForm((prev) => ({
                    ...prev,
                    recordDate: clampDateToToday(prev.recordDate),
                  }));
                }
              }}
              required
              aria-label={t('Date')}
            />
          </label>
          <label className="expense-entry-field">
            <span className="expense-entry-label">{t('pH Level')}</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.phLevel}
              onChange={(e) => setForm({ ...form, phLevel: e.target.value })}
              required
              aria-label={t('pH Level')}
            />
          </label>
          <label className="expense-entry-field">
            <span className="expense-entry-label">{t('Free Chlorine')}</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.freeChlorine}
              onChange={(e) => setForm({ ...form, freeChlorine: e.target.value })}
              required
              aria-label={t('Free Chlorine')}
            />
          </label>
          <label className="expense-entry-field">
            <span className="expense-entry-label">{t('Total Alkalinity')}</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.totalAlkalinity}
              onChange={(e) => setForm({ ...form, totalAlkalinity: e.target.value })}
              required
              aria-label={t('Total Alkalinity')}
            />
          </label>
          <label className="expense-entry-field">
            <span className="expense-entry-label">{t('Calcium Hardness')}</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.calciumHardness}
              onChange={(e) => setForm({ ...form, calciumHardness: e.target.value })}
              required
              aria-label={t('Calcium Hardness')}
            />
          </label>
          <label className="expense-entry-field expense-entry-field--full">
            <span className="expense-entry-label">{t('Tester Name')}</span>
            <input
              className="water-quality-tester-input"
              value={form.testerName}
              onChange={(e) => setForm({ ...form, testerName: e.target.value })}
              placeholder={t('Tester Name')}
              required
              aria-label={t('Tester Name')}
            />
          </label>
          <div className="expense-entry-actions">
            {editingId ? (
              <button type="button" className="pass-cancel" onClick={resetForm}>
                {t('Cancel')}
              </button>
            ) : null}
            <button type="submit" className="expense-save" disabled={saving}>
              {saving ? t('Saving…') : t('Save')}
            </button>
          </div>
          <span className="water-quality-result-slot" aria-hidden />
        </form>

        {loading ? (
          <p className="pass-empty">{t('Loading…')}</p>
        ) : items.length === 0 ? (
          <p className="pass-empty">{t('No water quality records for this month.')}</p>
        ) : (
          <div className="pass-table-body">
            {items.map((item) => {
              const out = readingFlags(item);
              const passed = isPass(item);
              return (
                <div className="expense-row" key={item.id}>
                  <span data-label={t('Date')}>{formatDisplayDate(item.recordDate)}</span>
                  <span
                    data-label={t('pH Level')}
                    className={out.phLevel ? 'water-quality-out' : undefined}
                  >
                    {formatReading(item.phLevel)}
                  </span>
                  <span
                    data-label={t('Free Chlorine')}
                    className={out.freeChlorine ? 'water-quality-out' : undefined}
                  >
                    {formatReading(item.freeChlorine, READING_RANGES.freeChlorine.unit)}
                  </span>
                  <span
                    data-label={t('Total Alkalinity')}
                    className={out.totalAlkalinity ? 'water-quality-out' : undefined}
                  >
                    {formatReading(item.totalAlkalinity, READING_RANGES.totalAlkalinity.unit)}
                  </span>
                  <span
                    data-label={t('Calcium Hardness')}
                    className={out.calciumHardness ? 'water-quality-out' : undefined}
                  >
                    {formatReading(item.calciumHardness, READING_RANGES.calciumHardness.unit)}
                  </span>
                  <strong className="expense-row-title" data-label={t('Tester Name')}>
                    {item.testerName}
                  </strong>
                  <span className="pass-actions" data-label={t('Actions')}>
                    <button
                      type="button"
                      className="icon-action"
                      onClick={() => startEdit(item)}
                      aria-label={`${t('Edit')} ${item.testerName}`}
                      title={t('Edit')}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        aria-hidden
                      >
                        <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
                        <path d="M13.5 6.5l3 3" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="icon-action icon-action-danger"
                      onClick={() => onDelete(item.id, item.testerName)}
                      aria-label={`${t('Delete')} ${item.testerName}`}
                      title={t('Delete')}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        aria-hidden
                      >
                        <path d="M5 7h14" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
                        <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                    </button>
                  </span>
                  <span
                    data-label={t('Result')}
                    className={`water-quality-result ${passed ? 'is-pass' : 'is-fail'}`}
                  >
                    {passed ? t('Pass') : t('Fail')}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {error ? <p className="error">{t(error)}</p> : null}
    </PlatformPage>
  );
}
