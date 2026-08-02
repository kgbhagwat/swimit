import { useEffect, useMemo, useState } from 'react';
import { DownloadButton } from './DownloadButton';
import { PlatformPage } from './PlatformPage';

type CoachOption = {
  id: number;
  full_name: string;
  registration_for: string;
  is_active?: boolean;
};

type PaymentItem = {
  registrationId: number;
  fullName: string;
  passType: string;
  batch: string;
  isActive: boolean;
  coachingCharges: number;
  duration: string;
  durationDays: number;
  attendedDays: number;
  dailyRate: number;
  amount: number;
};

type PaymentResult = {
  coach: string;
  month: string;
  basis: 'month' | 'day';
  items: PaymentItem[];
  total: number;
  swimmerCount: number;
};

type SummaryItem = {
  coachId: number;
  coachName: string;
  passType: string;
  coachingCharges: number;
  swimmerCount: number;
  total: number;
};

type SummaryResult = {
  month: string;
  basis: 'month' | 'day';
  items: SummaryItem[];
  totalSwimmers: number;
  grandTotal: number;
};

type Basis = 'month' | 'day';
type ViewMode = 'detail' | 'summary';

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

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function CoachPayment() {
  const monthOptions = useMemo(() => buildMonthOptions(), []);
  const [coaches, setCoaches] = useState<CoachOption[]>([]);
  const [coach, setCoach] = useState('');
  const [month, setMonth] = useState(currentMonthValue);
  const [basis, setBasis] = useState<Basis>('month');
  const [viewMode, setViewMode] = useState<ViewMode>('detail');
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [loadingCoaches, setLoadingCoaches] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadCoaches() {
      setLoadingCoaches(true);
      setError('');
      try {
        const res = await fetch('/api/staff-registrations');
        if (!res.ok) throw new Error('Failed to load coaches');
        const rows = (await res.json()) as CoachOption[];
        if (cancelled) return;
        const list = rows
          .filter((row) => row.registration_for === 'Coach' && row.is_active !== false)
          .sort((a, b) => a.full_name.localeCompare(b.full_name));
        setCoaches(list);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load coaches');
          setCoaches([]);
        }
      } finally {
        if (!cancelled) setLoadingCoaches(false);
      }
    }
    void loadCoaches();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (viewMode !== 'detail') return;
    if (!coach) {
      setResult(null);
      return;
    }

    let cancelled = false;
    async function loadPayment() {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({ coach, month, basis });
        const res = await fetch(`/api/coach-payment?${params}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? 'Failed to calculate payment');
        if (!cancelled) setResult(body as PaymentResult);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to calculate payment');
          setResult(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadPayment();
    return () => {
      cancelled = true;
    };
  }, [viewMode, coach, month, basis]);

  useEffect(() => {
    if (viewMode !== 'summary') return;

    let cancelled = false;
    async function loadSummary() {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({ month, basis });
        const res = await fetch(`/api/coach-payment/summary?${params}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? 'Failed to load summary');
        if (!cancelled) setSummary(body as SummaryResult);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load summary');
          setSummary(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadSummary();
    return () => {
      cancelled = true;
    };
  }, [viewMode, month, basis]);

  function openSummary() {
    setError('');
    setViewMode('summary');
  }

  function openDetail() {
    setError('');
    setViewMode('detail');
  }

  function downloadSummaryCsv() {
    if (!summary) return;
    const header = [
      'Coach name',
      'Pass type',
      'Coaching charges',
      'Swimmers',
      'Total coaching charges',
    ];
    const lines = [
      header.join(','),
      ...summary.items.map((item) =>
        [
          item.coachName,
          item.passType || '',
          String(item.coachingCharges ?? 0),
          String(item.swimmerCount),
          String(item.total),
        ]
          .map(csvEscape)
          .join(','),
      ),
      ['', '', '', 'Grand total', String(summary.grandTotal)].map(csvEscape).join(','),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `coach-payment-summary-${month}-${basis}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function downloadDetailCsv() {
    if (!result) return;
    const header = [
      'Swimmer',
      'Pass type',
      'Batch',
      basis === 'day' ? 'Attended days' : 'Duration',
      basis === 'day' ? 'Duration days' : '',
      'Coaching charges',
      'Amount',
    ].filter(Boolean);
    const lines = [
      header.join(','),
      ...result.items.map((item) =>
        (
          basis === 'day'
            ? [
                item.fullName,
                item.passType || '',
                item.batch || '',
                String(item.attendedDays),
                String(item.durationDays),
                String(item.coachingCharges),
                String(item.amount),
              ]
            : [
                item.fullName,
                item.passType || '',
                item.batch || '',
                item.duration || '',
                String(item.coachingCharges),
                String(item.amount),
              ]
        )
          .map(csvEscape)
          .join(','),
      ),
      ['', '', '', '', 'Total', String(result.total)].map(csvEscape).join(','),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `coach-payment-${coach.replace(/\s+/g, '-').toLowerCase()}-${month}-${basis}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PlatformPage
      title={viewMode === 'summary' ? 'Coach Payment Summary' : 'Coach Payment'}
      actions={
        <>
          {viewMode === 'summary' ? (
            <button type="button" className="menu-link coach-payment-back" onClick={openDetail}>
              ← Back
            </button>
          ) : null}
          {viewMode === 'summary' ? (
            <DownloadButton
              onClick={downloadSummaryCsv}
              disabled={!summary || summary.items.length === 0}
            />
          ) : (
            <>
              <DownloadButton
                onClick={downloadDetailCsv}
                disabled={!result || result.items.length === 0}
              />
              <button type="button" className="submit" onClick={openSummary}>
                Summary
              </button>
            </>
          )}
        </>
      }
    >
      <div className="swimmer-list-card">
        <div className="coach-payment-controls">
          {viewMode === 'detail' ? (
            <label className="field">
              <span className="label">Coach</span>
              <select
                value={coach}
                onChange={(e) => setCoach(e.target.value)}
                disabled={loadingCoaches}
              >
                <option value="">Select coach</option>
                {coaches.map((item) => (
                  <option key={item.id} value={item.full_name}>
                    {item.full_name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="field">
              <span className="label">View</span>
              <p className="pass-count coach-payment-view-note">All active coaches</p>
            </div>
          )}

          <label className="field">
            <span className="label">Month</span>
            <select value={month} onChange={(e) => setMonth(e.target.value)}>
              {monthOptions.map((value) => (
                <option key={value} value={value}>
                  {monthLabel(value)}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="coach-payment-basis">
            <legend className="label">Payment calculation</legend>
            <div className="staff-role-radios">
              <label className={`staff-role-option${basis === 'month' ? ' selected' : ''}`}>
                <input
                  type="checkbox"
                  checked={basis === 'month'}
                  onChange={() => setBasis('month')}
                />
                Month basis
              </label>
              <label className={`staff-role-option${basis === 'day' ? ' selected' : ''}`}>
                <input
                  type="checkbox"
                  checked={basis === 'day'}
                  onChange={() => setBasis('day')}
                />
                Day basis
              </label>
            </div>
          </fieldset>
        </div>

        {basis === 'month' ? (
          <p className="pass-count">
            Month basis uses the coaching charges defined on each swimmer&apos;s pass type.
          </p>
        ) : (
          <p className="pass-count">
            Day basis = (coaching charges ÷ pass duration days) × attendance days in{' '}
            {monthLabel(month)}.
          </p>
        )}

        {error ? <p className="error">{error}</p> : null}

        {loading ? <p className="pass-count">Calculating…</p> : null}

        {!loading && viewMode === 'summary' && summary ? (
          <>
            <div className="pass-table-card coach-payment-table">
              <div className="coach-summary-head">
                <span>Coach name</span>
                <span>Pass type</span>
                <span>Coaching charges</span>
                <span>Swimmers</span>
                <span>Total coaching charges</span>
              </div>
              {summary.items.length === 0 ? (
                <p className="pass-empty">No active coaches found.</p>
              ) : (
                summary.items.map((item) => (
                  <div
                    className="coach-summary-row"
                    key={`${item.coachId}-${item.passType}`}
                  >
                    <span data-label="Coach name">
                      <strong>{item.coachName}</strong>
                    </span>
                    <span data-label="Pass type">{item.passType || '—'}</span>
                    <span data-label="Coaching charges">
                      {formatMoney(item.coachingCharges ?? 0)}
                    </span>
                    <span data-label="Swimmers">{item.swimmerCount}</span>
                    <span data-label="Total coaching charges">
                      <strong>{formatMoney(item.total)}</strong>
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="coach-payment-total-row">
              <div className="coach-payment-total coach-payment-total-compact">
                <span>
                  Grand total: <strong>{formatMoney(summary.grandTotal)}</strong>
                </span>
              </div>
            </div>
          </>
        ) : null}

        {!loading && viewMode === 'detail' ? (
          !coach ? (
            <p className="pass-count">Select a coach to view payment details, or open Summary.</p>
          ) : result ? (
            <>
              <div className="pass-table-card coach-payment-table">
                <div className="coach-payment-head">
                  <span>Swimmer</span>
                  <span>Pass type</span>
                  <span>Batch</span>
                  {basis === 'day' ? <span>Days</span> : <span>Duration</span>}
                  <span>Coaching charges</span>
                  <span>Amount</span>
                </div>
                {result.items.length === 0 ? (
                  <p className="pass-empty">No swimmers assigned to this coach.</p>
                ) : (
                  result.items.map((item) => (
                    <div className="coach-payment-row" key={item.registrationId}>
                      <span data-label="Swimmer">
                        <strong>{item.fullName}</strong>
                      </span>
                      <span data-label="Pass type">{item.passType || '—'}</span>
                      <span data-label="Batch">{item.batch || '—'}</span>
                      {basis === 'day' ? (
                        <span data-label="Days">
                          {item.attendedDays} / {item.durationDays}
                        </span>
                      ) : (
                        <span data-label="Duration">{item.duration || '—'}</span>
                      )}
                      <span data-label="Coaching charges">{formatMoney(item.coachingCharges)}</span>
                      <span data-label="Amount">
                        <strong>{formatMoney(item.amount)}</strong>
                      </span>
                    </div>
                  ))
                )}
              </div>

              <div className="coach-payment-total">
                <span>
                  Swimmers: <strong>{result.swimmerCount}</strong>
                </span>
                <span>
                  Total coaching charges: <strong>{formatMoney(result.total)}</strong>
                </span>
              </div>
            </>
          ) : null
        ) : null}
      </div>
    </PlatformPage>
  );
}
