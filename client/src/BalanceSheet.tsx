import { useEffect, useMemo, useState } from 'react';
import { isApplicationDemo } from './applicationDemo';
import { DownloadButton } from './DownloadButton';
import { useT } from './i18n';
import { InPageSelect } from './InPageSelect';
import { PlatformPage } from './PlatformPage';

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
  const [sheet, setSheet] = useState<SheetResult | null>(null);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sampleMode, setSampleMode] = useState(false);

  useEffect(() => {
    setFilter('all');
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

  const visibleItems = useMemo(() => {
    if (!sheet) return [];
    if (filter === 'credit') return sheet.items.filter((item) => item.credit > 0);
    if (filter === 'debit') return sheet.items.filter((item) => item.debit > 0);
    return sheet.items;
  }, [sheet, filter]);

  function toggleFilter(next: FilterMode) {
    setFilter((current) => (current === next ? 'all' : next));
  }

  function downloadCsv() {
    if (!sheet) return;
    const rows = filter === 'all' ? sheet.items : visibleItems;
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
      ['', 'Total', String(sheet.totalCredit), String(sheet.totalDebit), String(sheet.closingBalance)]
        .map(csvEscape)
        .join(','),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `balance-sheet-${month}${filter === 'all' ? '' : `-${filter}`}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
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
          <DownloadButton onClick={downloadCsv} disabled={!sheet || sheet.items.length === 0} />
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

        {!loading && sheet ? (
          <>
            <div className="balance-summary-cards">
              <button
                type="button"
                className={`balance-summary-card credit${filter === 'credit' ? ' selected' : ''}`}
                onClick={() => toggleFilter('credit')}
              >
                <span>{t('Total credit')}</span>
                <strong>{formatMoney(sheet.totalCredit)}</strong>
              </button>
              <button
                type="button"
                className={`balance-summary-card debit${filter === 'debit' ? ' selected' : ''}`}
                onClick={() => toggleFilter('debit')}
              >
                <span>{t('Total debit')}</span>
                <strong>{formatMoney(sheet.totalDebit)}</strong>
              </button>
              <button
                type="button"
                className={`balance-summary-card closing${filter === 'all' ? ' selected' : ''}`}
                onClick={() => setFilter('all')}
              >
                <span>{t('Closing balance')}</span>
                <strong>{formatMoney(sheet.closingBalance)}</strong>
              </button>
            </div>

            <p className="pass-count">
              {filter === 'credit'
                ? `${t('Showing credit entries')} (${visibleItems.length})`
                : filter === 'debit'
                  ? `${t('Showing debit entries')} (${visibleItems.length})`
                  : `${t('Showing all entries')} (${visibleItems.length})`}
            </p>

            <div className="balance-table">
              <div className="balance-head">
                <span>{t('Date')}</span>
                <span>{t('Particulars')}</span>
                <span>{t('Credit')}</span>
                <span>{t('Debit')}</span>
                <span>{t('Balance')}</span>
              </div>
              {visibleItems.length === 0 ? (
                <p className="pass-empty">
                  {filter === 'credit'
                    ? t('No credit entries for this month.')
                    : filter === 'debit'
                      ? t('No debit entries for this month.')
                      : t('No credit or debit entries for this month.')}
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
                      {t('Total debit')}: <strong>{formatMoney(sheet.totalDebit)}</strong>
                    </>
                  ) : filter === 'credit' ? (
                    <>
                      {t('Total credit')}: <strong>{formatMoney(sheet.totalCredit)}</strong>
                    </>
                  ) : (
                    <>
                      {t('Closing balance')}: <strong>{formatMoney(sheet.closingBalance)}</strong>
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
