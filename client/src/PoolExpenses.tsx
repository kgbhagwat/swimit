import { FormEvent, useEffect, useMemo, useState } from 'react';
import { DownloadButton } from './DownloadButton';
import { saveCsvFile } from './csvDownload';
import { InPageSelect } from './InPageSelect';
import { useT } from './i18n';
import { PlatformPage } from './PlatformPage';

type Expense = {
  id: number;
  expenseDate: string;
  description: string;
  amount: number;
  mode: string;
  hasBill: boolean;
};

type ExpenseForm = {
  expenseDate: string;
  description: string;
  amount: string;
  mode: string;
  hasBill: boolean;
};

const MODES = ['Cash', 'UPI', 'Card', 'Bank transfer'] as const;

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
  const month = now.getMonth(); // 0-11
  // Indian FY starts in April (month index 3)
  const fyStartYear = month >= 3 ? year : year - 1;
  const currentValue = `${year}-${String(month + 1).padStart(2, '0')}`;
  const options: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    const d = new Date(fyStartYear, 3 + i, 1); // Apr .. Mar next year
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (value > currentValue) break;
    options.push(value);
  }
  return options;
}

function formatMoney(value: number) {
  return `₹${value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDisplayDate(value: string) {
  const match = value.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function emptyForm(): ExpenseForm {
  return {
    expenseDate: todayIso(),
    description: '',
    amount: '',
    mode: 'Cash',
    hasBill: false,
  };
}

export function PoolExpenses() {
  const t = useT();
  const monthOptions = useMemo(() => buildMonthOptions(), []);
  const monthSelectOptions = useMemo(
    () => monthOptions.map((value) => ({ value, label: monthLabel(value) })),
    [monthOptions],
  );
  const modeOptions = useMemo(
    () => MODES.map((mode) => ({ value: mode, label: t(mode) })),
    [t],
  );
  const [month, setMonth] = useState(currentMonthValue);
  const [items, setItems] = useState<Expense[]>([]);
  const [form, setForm] = useState<ExpenseForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load(selectedMonth = month) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/pool-expenses?month=${encodeURIComponent(selectedMonth)}`);
      if (!res.ok) throw new Error('Failed to load expenses');
      const data = (await res.json()) as Expense[];
      setItems(data);
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

  function startEdit(item: Expense) {
    setEditingId(item.id);
    setForm({
      expenseDate: item.expenseDate,
      description: item.description,
      amount: String(item.amount),
      mode: item.mode,
      hasBill: item.hasBill,
    });
    setError('');
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError('');
    const today = todayIso();
    if (!form.expenseDate || form.expenseDate > today) {
      setError('Expense date cannot be in the future');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        expenseDate: form.expenseDate,
        description: form.description.trim(),
        amount: Number(form.amount),
        mode: form.mode,
        hasBill: form.hasBill,
      };
      const res = await fetch(
        editingId ? `/api/pool-expenses/${editingId}` : '/api/pool-expenses',
        {
          method: editingId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
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

  async function onDelete(id: number, description: string) {
    if (!confirm(`${t('Delete expense')} “${description}”?`)) return;
    setError('');
    try {
      const res = await fetch(`/api/pool-expenses/${id}`, { method: 'DELETE' });
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
      t('Expense description'),
      t('Amount'),
      t('Mode'),
      t('Bill'),
    ];
    const lines = [
      header.join(','),
      ...items.map((item) =>
        [
          item.expenseDate ? formatDisplayDate(item.expenseDate) : '',
          item.description,
          String(item.amount),
          t(item.mode),
          item.hasBill ? t('Bill') : t('No bill'),
        ]
          .map(csvEscape)
          .join(','),
      ),
    ];
    saveCsvFile(`pool-expenses-${month}.csv`, lines.join('\n'));
  }

  return (
    <PlatformPage
      title="Pool Expenses"
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
      <section className="pass-form-card pool-core-form pass-table-card expense-table-card">
        <div className="expense-table-head">
          <span>{t('Date')}</span>
          <span>{t('Expense description')}</span>
          <span>{t('Amount')}</span>
          <span>{t('Mode')}</span>
          <span>{t('Bill')}</span>
          <span>{t('Actions')}</span>
        </div>

        <form className="expense-entry-row" onSubmit={onSave}>
          <input
            type="date"
            value={form.expenseDate}
            max={todayIso()}
            onChange={(e) => {
              const next = e.target.value;
              const today = todayIso();
              setForm({
                ...form,
                expenseDate: next && next > today ? today : next,
              });
            }}
            required
            aria-label={t('Expense date')}
          />
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder={t('Expense description')}
            required
            aria-label={t('Expense description')}
          />
          <input
            type="number"
            min={0}
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            placeholder="0"
            required
            aria-label={t('Amount')}
          />
          <InPageSelect
            value={form.mode}
            onChange={(mode) => setForm({ ...form, mode })}
            options={modeOptions}
            required
            aria-label={t('Payment mode')}
          />
          <div className="expense-bill-radios" role="radiogroup" aria-label={t('Bill')}>
            <label className={form.hasBill ? 'selected' : ''}>
              <input
                type="radio"
                name="hasBill"
                checked={form.hasBill}
                onChange={() => setForm({ ...form, hasBill: true })}
              />
              <span>{t('Bill')}</span>
            </label>
            <label className={!form.hasBill ? 'selected' : ''}>
              <input
                type="radio"
                name="hasBill"
                checked={!form.hasBill}
                onChange={() => setForm({ ...form, hasBill: false })}
              />
              <span>{t('No bill')}</span>
            </label>
          </div>
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
        </form>

        {loading ? (
          <p className="pass-empty">{t('Loading…')}</p>
        ) : items.length === 0 ? (
          <p className="pass-empty">{t('No expenses recorded for this month.')}</p>
        ) : (
          <div className="pass-table-body">
            {items.map((item) => (
              <div className="expense-row" key={item.id}>
                <span data-label={t('Date')}>{formatDisplayDate(item.expenseDate)}</span>
                <strong className="expense-row-title" data-label={t('Description')}>
                  {item.description}
                </strong>
                <span data-label={t('Amount')}>{formatMoney(item.amount)}</span>
                <span data-label={t('Payment method')}>{t(item.mode)}</span>
                <span data-label={t('Bill status')}>{item.hasBill ? t('Bill') : t('No bill')}</span>
                <span className="pass-actions" data-label={t('Actions')}>
                  <button
                    type="button"
                    className="icon-action"
                    onClick={() => startEdit(item)}
                    aria-label={`${t('Edit')} ${item.description}`}
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
                    onClick={() => onDelete(item.id, item.description)}
                    aria-label={`${t('Delete')} ${item.description}`}
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
              </div>
            ))}
          </div>
        )}
      </section>

      {error ? <p className="error">{t(error)}</p> : null}
    </PlatformPage>
  );
}
