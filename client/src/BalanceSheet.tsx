import { useEffect, useMemo, useState } from 'react';
import { isApplicationDemo } from './applicationDemo';
import { DownloadButton } from './DownloadButton';
import { saveCsvFile } from './csvDownload';
import { useT } from './i18n';
import { InPageSelect } from './InPageSelect';
import { PlatformPage } from './PlatformPage';
import { ColumnSortDir, TableColumnFilter } from './TableColumnFilter';

type LedgerItem = {
  id: string;
  entryDate: string;
  particulars: string;
  credit: number;
  debit: number;
  balance: number;
  type: 'credit' | 'debit';
  source: 'pass' | 'expense' | 'coach';
};

type SheetResult = {
  month: string;
  items: LedgerItem[];
  totalCredit: number;
  totalDebit: number;
  closingBalance: number;
};

type BalanceColumnKey = 'date' | 'particulars' | 'credit' | 'debit' | 'balance';

const BALANCE_COLUMNS: Array<{ key: BalanceColumnKey; label: string }> = [
  { key: 'date', label: 'Date' },
  { key: 'particulars', label: 'Particulars' },
  { key: 'credit', label: 'Credit' },
  { key: 'debit', label: 'Debit' },
  { key: 'balance', label: 'Balance' },
];

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

function balanceCellValue(item: LedgerItem, key: BalanceColumnKey) {
  if (key === 'date') return formatDisplayDate(item.entryDate);
  if (key === 'particulars') return item.particulars;
  if (key === 'credit') return item.credit ? formatMoney(item.credit) : '—';
  if (key === 'debit') return item.debit ? formatMoney(item.debit) : '—';
  return formatMoney(item.balance);
}

function compareBalanceItems(a: LedgerItem, b: LedgerItem, key: BalanceColumnKey) {
  if (key === 'date') return a.entryDate.localeCompare(b.entryDate);
  if (key === 'particulars') {
    return a.particulars.localeCompare(b.particulars, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  }
  return a[key] - b[key];
}

function monthDateBounds(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  const min = `${month}-01`;
  const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`;
  const today = todayIso();
  return { min, max: month === today.slice(0, 7) ? today : monthEnd };
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function sampleBalanceSheet(month: string): SheetResult {
  const raw: Array<Omit<LedgerItem, 'balance'>> = [
    {
      id: 'sample-pass-1',
      entryDate: `${month}-03`,
      particulars: 'Pass payment — Aarav Patil (Monthly Swim)',
      credit: 2000,
      debit: 0,
      type: 'credit',
      source: 'pass',
    },
    {
      id: 'sample-pass-2',
      entryDate: `${month}-05`,
      particulars: 'Pass payment — Sana Joshi (Quarterly Swim)',
      credit: 5000,
      debit: 0,
      type: 'credit',
      source: 'pass',
    },
    {
      id: 'sample-exp-1',
      entryDate: `${month}-08`,
      particulars: 'Pool chemicals & chlorine',
      credit: 0,
      debit: 1200,
      type: 'debit',
      source: 'expense',
    },
    {
      id: 'sample-pass-3',
      entryDate: `${month}-12`,
      particulars: 'Pass payment — Vihaan Kulkarni (Monthly Swim)',
      credit: 2000,
      debit: 0,
      type: 'credit',
      source: 'pass',
    },
    {
      id: 'sample-coach-1',
      entryDate: `${month}-20`,
      particulars: 'Coach payment — Riya Kulkarni',
      credit: 0,
      debit: 3500,
      type: 'debit',
      source: 'coach',
    },
    {
      id: 'sample-exp-2',
      entryDate: `${month}-25`,
      particulars: 'Electricity & pump maintenance',
      credit: 0,
      debit: 1800,
      type: 'debit',
      source: 'expense',
    },
  ];

  let running = 0;
  const items: LedgerItem[] = raw.map((row) => {
    running += row.credit - row.debit;
    return { ...row, balance: running };
  });
  const totalCredit = items.reduce((sum, row) => sum + row.credit, 0);
  const totalDebit = items.reduce((sum, row) => sum + row.debit, 0);
  return {
    month,
    items,
    totalCredit,
    totalDebit,
    closingBalance: totalCredit - totalDebit,
  };
}

type FilterMode = 'all' | 'credit' | 'debit';

export function BalanceSheet() {
  const t = useT();
  const monthOptions = useMemo(() => buildMonthOptions(), []);
  const monthSelectOptions = useMemo(
    () => monthOptions.map((value) => ({ value, label: monthLabel(value) })),
    [monthOptions],
  );
  const [month, setMonth] = useState(currentMonthValue);
  const [selectedDate, setSelectedDate] = useState('');
  const [sheet, setSheet] = useState<SheetResult | null>(null);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [openColumnFilter, setOpenColumnFilter] = useState<BalanceColumnKey | null>(null);
  const [columnSelected, setColumnSelected] = useState<
    Partial<Record<BalanceColumnKey, Set<string> | null>>
  >({});
  const [sortKey, setSortKey] = useState<BalanceColumnKey | null>(null);
  const [sortDir, setSortDir] = useState<ColumnSortDir>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sampleMode, setSampleMode] = useState(false);

  useEffect(() => {
    setFilter('all');
    setSelectedDate('');
    setOpenColumnFilter(null);
    setColumnSelected({});
    setSortKey(null);
    setSortDir(null);
  }, [month]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        if (isApplicationDemo()) {
          if (!cancelled) {
            setSheet(sampleBalanceSheet(month));
            setSampleMode(true);
          }
          return;
        }
        const res = await fetch(`/api/balance-sheet?month=${encodeURIComponent(month)}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? 'Failed to load balance sheet');
        if (!cancelled) {
          setSheet(body as SheetResult);
          setSampleMode(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load balance sheet');
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
  }, [month]);

  const displayedSheet = useMemo(() => {
    if (!sheet || !selectedDate) return sheet;
    let running = 0;
    const items = sheet.items
      .filter((item) => item.entryDate.slice(0, 10) === selectedDate)
      .map((item) => {
        running = Math.round((running + item.credit - item.debit + Number.EPSILON) * 100) / 100;
        return { ...item, balance: running };
      });
    const totalCredit = items.reduce((sum, item) => sum + item.credit, 0);
    const totalDebit = items.reduce((sum, item) => sum + item.debit, 0);
    return {
      ...sheet,
      items,
      totalCredit,
      totalDebit,
      closingBalance: totalCredit - totalDebit,
    };
  }, [sheet, selectedDate]);

  const typeItems = useMemo(() => {
    if (!displayedSheet) return [];
    if (filter === 'credit') return displayedSheet.items.filter((item) => item.credit > 0);
    if (filter === 'debit') return displayedSheet.items.filter((item) => item.debit > 0);
    return displayedSheet.items;
  }, [displayedSheet, filter]);

  const visibleItems = useMemo(() => {
    const filtered = typeItems.filter((item) =>
      BALANCE_COLUMNS.every(({ key }) => {
        const selected = columnSelected[key];
        if (!selected) return true;
        return selected.has(balanceCellValue(item, key));
      }),
    );
    if (!sortKey || !sortDir) return filtered;
    return [...filtered].sort((a, b) => {
      const comparison = compareBalanceItems(a, b, sortKey);
      return sortDir === 'asc' ? comparison : -comparison;
    });
  }, [typeItems, columnSelected, sortKey, sortDir]);

  const dateBounds = useMemo(() => monthDateBounds(month), [month]);

  function toggleFilter(next: FilterMode) {
    setFilter((current) => (current === next ? 'all' : next));
  }

  function clearSelectedDate() {
    setSelectedDate('');
    setFilter('all');
    setOpenColumnFilter(null);
    setColumnSelected({});
    setSortKey(null);
    setSortDir(null);
  }

  function downloadCsv() {
    if (!displayedSheet) return;
    const rows = visibleItems;
    const exportedCredit = rows.reduce((sum, item) => sum + item.credit, 0);
    const exportedDebit = rows.reduce((sum, item) => sum + item.debit, 0);
    const exportedBalance = exportedCredit - exportedDebit;
    const header = ['Date', 'Particulars', 'Credit', 'Debit', 'Balance'];
    const lines = [
      header.join(','),
      ...rows.map((item) =>
        [
          formatDisplayDate(item.entryDate),
          item.particulars,
          item.credit ? String(item.credit) : '',
          item.debit ? String(item.debit) : '',
          String(item.balance),
        ]
          .map(csvEscape)
          .join(','),
      ),
      [
        '',
        'Total',
        String(exportedCredit),
        String(exportedDebit),
        String(exportedBalance),
      ]
        .map(csvEscape)
        .join(','),
    ];
    saveCsvFile(
      `balance-sheet-${selectedDate || month}${filter === 'all' ? '' : `-${filter}`}.csv`,
      lines.join('\n'),
    );
  }

  return (
    <PlatformPage
      title="Balance Sheet"
      actions={
        <>
          <label className="balance-month-inline">
            <span className="label">{t('Month')}</span>
            <InPageSelect
              value={month}
              onChange={setMonth}
              options={monthSelectOptions}
              required
              aria-label={t('Month')}
            />
          </label>
          <label className="balance-month-inline balance-date-inline">
            <span className="label">{t('Day')}</span>
            <span
              className={`balance-date-picker${selectedDate ? ' selected' : ''}`}
              title={
                selectedDate
                  ? formatDisplayDate(selectedDate)
                  : t('Select a day for the balance sheet')
              }
            >
              <svg
                className="balance-date-calendar-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <rect x="3.5" y="5.5" width="17" height="15" rx="2" />
                <path d="M8 3.5v4M16 3.5v4M3.5 10h17" />
                <path d="M8 14h2M14 14h2M8 17h2M14 17h2" />
              </svg>
              <input
                type="date"
                value={selectedDate}
                min={dateBounds.min}
                max={dateBounds.max}
                onChange={(event) => {
                  setSelectedDate(event.target.value);
                  setFilter('all');
                  setOpenColumnFilter(null);
                  setColumnSelected({});
                  setSortKey(null);
                  setSortDir(null);
                }}
                aria-label={t('Select a day for the balance sheet')}
              />
            </span>
          </label>
          {selectedDate ? (
            <button
              type="button"
              className="ghost-btn balance-date-clear"
              onClick={clearSelectedDate}
            >
              {t('All month')}
            </button>
          ) : null}
          <DownloadButton
            onClick={downloadCsv}
            disabled={!displayedSheet || displayedSheet.items.length === 0}
          />
        </>
      }
    >
      <div className={`pass-form-card pool-core-form${sampleMode ? ' pass-form-card--sample' : ''}`}>
        {sampleMode ? (
          <div className="user-mgmt-sample-watermark" aria-hidden="true">
            {t('Sample')}
          </div>
        ) : null}
        {error ? <p className="error">{t(error)}</p> : null}
        {loading ? <p className="pass-count batch-list-lede">{t('Loading…')}</p> : null}

        {!loading && displayedSheet ? (
          <>
            <div className="balance-summary-cards">
              <button
                type="button"
                className={`balance-summary-card credit${filter === 'credit' ? ' selected' : ''}`}
                onClick={() => toggleFilter('credit')}
              >
                <span>{t('Total credit')}</span>
                <strong>{formatMoney(displayedSheet.totalCredit)}</strong>
              </button>
              <button
                type="button"
                className={`balance-summary-card debit${filter === 'debit' ? ' selected' : ''}`}
                onClick={() => toggleFilter('debit')}
              >
                <span>{t('Total debit')}</span>
                <strong>{formatMoney(displayedSheet.totalDebit)}</strong>
              </button>
              <button
                type="button"
                className={`balance-summary-card closing${filter === 'all' ? ' selected' : ''}`}
                onClick={() => setFilter('all')}
              >
                <span>{t('Closing balance')}</span>
                <strong>{formatMoney(displayedSheet.closingBalance)}</strong>
              </button>
            </div>

            <p className="pass-count">
              {filter === 'credit'
                ? `${t('Showing credit entries')} (${visibleItems.length})`
                : filter === 'debit'
                  ? `${t('Showing debit entries')} (${visibleItems.length})`
                  : `${t('Showing all entries')} (${visibleItems.length})`}
              {selectedDate ? ` · ${formatDisplayDate(selectedDate)}` : ''}
            </p>

            <div
              className={`balance-table${openColumnFilter ? ' balance-table--filter-open' : ''}`}
            >
              <div className="balance-head">
                {BALANCE_COLUMNS.map(({ key, label }) => (
                  <div className="balance-col-head" key={key}>
                    <TableColumnFilter
                      label={label}
                      values={typeItems.map((item) => balanceCellValue(item, key))}
                      selected={columnSelected[key] ?? null}
                      sortDir={sortKey === key ? sortDir : null}
                      open={openColumnFilter === key}
                      onToggleOpen={() =>
                        setOpenColumnFilter((current) => (current === key ? null : key))
                      }
                      onClose={() => setOpenColumnFilter(null)}
                      onSelectedChange={(next) =>
                        setColumnSelected((current) => ({ ...current, [key]: next }))
                      }
                      onSort={(direction) => {
                        setSortKey(direction ? key : null);
                        setSortDir(direction);
                      }}
                    />
                  </div>
                ))}
              </div>
              {visibleItems.length === 0 ? (
                <p className="pass-empty">
                  {typeItems.length > 0
                    ? t('No balance sheet entries match these filters.')
                    : filter === 'credit'
                    ? t(
                        selectedDate
                          ? 'No credit entries for this day.'
                          : 'No credit entries for this month.',
                      )
                    : filter === 'debit'
                      ? t(
                          selectedDate
                            ? 'No debit entries for this day.'
                            : 'No debit entries for this month.',
                        )
                      : t(
                          selectedDate
                            ? 'No credit or debit entries for this day.'
                            : 'No credit or debit entries for this month.',
                        )}
                </p>
              ) : (
                visibleItems.map((item) => (
                  <div className="balance-row" key={item.id}>
                    <span data-label={t('Date')}>{formatDisplayDate(item.entryDate)}</span>
                    <span className="balance-row-title" data-label={t('Particulars')}>
                      {item.particulars}
                    </span>
                    <span data-label={t('Credit')} className="balance-credit">
                      {item.credit ? formatMoney(item.credit) : '—'}
                    </span>
                    <span data-label={t('Debit')} className="balance-debit">
                      {item.debit ? formatMoney(item.debit) : '—'}
                    </span>
                    <span data-label={t('Balance')}>
                      <strong>{formatMoney(item.balance)}</strong>
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="coach-payment-total-row">
              <div className="coach-payment-total coach-payment-total-compact">
                <span>
                  {filter === 'debit' ? (
                    <>
                      {t('Total debit')}: <strong>{formatMoney(displayedSheet.totalDebit)}</strong>
                    </>
                  ) : filter === 'credit' ? (
                    <>
                      {t('Total credit')}: <strong>{formatMoney(displayedSheet.totalCredit)}</strong>
                    </>
                  ) : (
                    <>
                      {t('Closing balance')}:{' '}
                      <strong>{formatMoney(displayedSheet.closingBalance)}</strong>
                    </>
                  )}
                </span>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </PlatformPage>
  );
}
