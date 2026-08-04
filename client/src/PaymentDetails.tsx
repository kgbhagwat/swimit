import { FormEvent, useEffect, useMemo, useState } from 'react';
import { isApplicationDemo } from './applicationDemo';
import { PlatformPage } from './PlatformPage';
import { ColumnSortDir, TableColumnFilter } from './TableColumnFilter';

type RecentPassPayment = {
  id: number;
  swimmerName: string;
  passType: string;
  amount: number;
  paymentDate: string | null;
  paymentMode: string;
  transactionId: string;
  mobile: string;
};

type PaymentColKey =
  | 'swimmerName'
  | 'mobile'
  | 'paymentDate'
  | 'passType'
  | 'amount'
  | 'paymentMode'
  | 'transactionId';

const PAYMENT_COLUMNS: Array<{ key: PaymentColKey; label: string }> = [
  { key: 'swimmerName', label: 'Swimmer' },
  { key: 'mobile', label: 'Mobile' },
  { key: 'paymentDate', label: 'Payment date' },
  { key: 'passType', label: 'Pass' },
  { key: 'amount', label: 'Amount' },
  { key: 'paymentMode', label: 'Mode' },
  { key: 'transactionId', label: 'Transaction ID' },
];

function formatMoney(value: number) {
  return `₹${Number(value || 0).toLocaleString('en-IN')}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function cellValue(row: RecentPassPayment, key: PaymentColKey) {
  switch (key) {
    case 'swimmerName':
      return row.swimmerName || '—';
    case 'mobile':
      return row.mobile || '—';
    case 'paymentDate':
      return row.paymentDate || '—';
    case 'passType':
      return row.passType || '—';
    case 'amount':
      return formatMoney(row.amount);
    case 'paymentMode':
      return row.paymentMode || '—';
    case 'transactionId':
      return row.transactionId || '—';
  }
}

const SAMPLE_PAYMENTS: RecentPassPayment[] = [
  {
    id: -1,
    swimmerName: 'Aarav Patil',
    passType: 'Monthly Swim',
    amount: 2000,
    paymentDate: daysAgoIso(1),
    paymentMode: 'Online',
    transactionId: 'SAMPLETXN001',
    mobile: '9876543210',
  },
  {
    id: -2,
    swimmerName: 'Sana Joshi',
    passType: 'Quarterly Swim',
    amount: 5000,
    paymentDate: daysAgoIso(3),
    paymentMode: 'Cash',
    transactionId: '—',
    mobile: '9123456780',
  },
  {
    id: -3,
    swimmerName: 'Vihaan Kulkarni',
    passType: 'Monthly Swim',
    amount: 2000,
    paymentDate: daysAgoIso(5),
    paymentMode: 'Online',
    transactionId: 'SAMPLETXN002',
    mobile: '9988776655',
  },
  {
    id: -4,
    swimmerName: 'Rohan Mehta',
    passType: 'Monthly Swim',
    amount: 2000,
    paymentDate: daysAgoIso(8),
    paymentMode: 'Cash',
    transactionId: '—',
    mobile: '9012345678',
  },
  {
    id: -5,
    swimmerName: 'Isha Nair',
    passType: 'Monthly Swim',
    amount: 2000,
    paymentDate: daysAgoIso(12),
    paymentMode: 'Online',
    transactionId: 'SAMPLETXN003',
    mobile: '9090909091',
  },
];

function filterSampleByRange(from: string, to: string) {
  return SAMPLE_PAYMENTS.filter((row) => {
    if (!row.paymentDate) return false;
    return row.paymentDate >= from && row.paymentDate <= to;
  });
}

export function PaymentDetails() {
  const [payments, setPayments] = useState<RecentPassPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showRangeForm, setShowRangeForm] = useState(false);
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [rangeActive, setRangeActive] = useState(false);
  const [txnLoading, setTxnLoading] = useState(false);
  const [sampleMode, setSampleMode] = useState(false);
  const [openFilter, setOpenFilter] = useState<PaymentColKey | null>(null);
  const [columnSelected, setColumnSelected] = useState<
    Partial<Record<PaymentColKey, Set<string> | null>>
  >({});
  const [sortKey, setSortKey] = useState<PaymentColKey | null>(null);
  const [sortDir, setSortDir] = useState<ColumnSortDir>(null);

  const visiblePayments = useMemo(() => {
    let rows = payments.filter((row) =>
      PAYMENT_COLUMNS.every(({ key }) => {
        const selected = columnSelected[key];
        if (!selected) return true;
        return selected.has(cellValue(row, key));
      }),
    );
    if (sortKey && sortDir) {
      rows = [...rows].sort((a, b) => {
        const av = cellValue(a, sortKey);
        const bv = cellValue(b, sortKey);
        const cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' });
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return rows;
  }, [payments, columnSelected, sortKey, sortDir]);

  async function loadPayments(params?: { from?: string; to?: string }) {
    if (isApplicationDemo()) {
      const rows =
        params?.from && params?.to
          ? filterSampleByRange(params.from, params.to)
          : SAMPLE_PAYMENTS.slice(0, 10);
      setPayments(rows);
      setRangeActive(Boolean(params?.from && params?.to));
      setSampleMode(true);
      return;
    }
    const qs =
      params?.from && params?.to
        ? `?from=${encodeURIComponent(params.from)}&to=${encodeURIComponent(params.to)}`
        : '';
    const res = await fetch(`/api/registrations/pass-payments/recent${qs}`);
    const body = await res.json().catch(() => []);
    if (!res.ok) {
      throw new Error(
        body && typeof body === 'object' && 'error' in body
          ? String((body as { error?: string }).error ?? 'Failed to load payments')
          : 'Failed to load payments',
      );
    }
    setPayments(
      Array.isArray(body)
        ? body.map((row: Record<string, unknown>) => ({
            id: Number(row.id),
            swimmerName: String(row.swimmerName ?? ''),
            passType: String(row.passType ?? ''),
            amount: Number(row.amount ?? 0),
            paymentDate: row.paymentDate ? String(row.paymentDate) : null,
            paymentMode: String(row.paymentMode ?? ''),
            transactionId: String(row.transactionId ?? '—'),
            mobile: String(row.mobile ?? ''),
          }))
        : [],
    );
    setRangeActive(Boolean(params?.from && params?.to));
    setSampleMode(false);
  }

  useEffect(() => {
    setLoading(true);
    setError('');
    void loadPayments()
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  function onRangeSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!rangeFrom || !rangeTo) {
      setError('Select both from and to dates');
      return;
    }
    if (rangeFrom > rangeTo) {
      setError('From date must be on or before to date');
      return;
    }
    setTxnLoading(true);
    void loadPayments({ from: rangeFrom, to: rangeTo })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setTxnLoading(false));
  }

  return (
    <PlatformPage title="Payment Details">
      {!sampleMode ? (
        <p className="lede batch-list-lede">
          Confirmed pass payments for this swimming pool account.
        </p>
      ) : null}

      <section
        className={`pass-form-card pool-core-form platform-payment-txns${sampleMode ? ' pass-form-card--sample' : ''}`}
      >
        {sampleMode ? (
          <div className="user-mgmt-sample-watermark" aria-hidden="true">
            Sample
          </div>
        ) : null}
        <div className="platform-payment-txns-head">
          <h2>Recent payments</h2>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              setShowRangeForm((v) => !v);
              setError('');
              if (!rangeFrom && !rangeTo) {
                setRangeFrom(daysAgoIso(14));
                setRangeTo(todayIso());
              }
            }}
          >
            {showRangeForm ? 'Hide' : 'More transactions'}
          </button>
        </div>

        {showRangeForm ? (
          <form className="platform-payment-range" onSubmit={onRangeSubmit}>
            <label className="field platform-payment-range-field">
              <span className="label">From</span>
              <input
                type="date"
                value={rangeFrom}
                onChange={(e) => setRangeFrom(e.target.value)}
                required
              />
            </label>
            <label className="field platform-payment-range-field">
              <span className="label">To</span>
              <input
                type="date"
                value={rangeTo}
                onChange={(e) => setRangeTo(e.target.value)}
                required
              />
            </label>
            <button type="submit" className="submit platform-payment-get-btn" disabled={txnLoading}>
              {txnLoading ? 'Loading…' : 'Get'}
            </button>
            {rangeActive ? (
              <button
                type="button"
                className="ghost-btn"
                disabled={txnLoading}
                onClick={() => {
                  setError('');
                  setTxnLoading(true);
                  void loadPayments()
                    .then(() => {
                      setRangeFrom('');
                      setRangeTo('');
                    })
                    .catch((err) =>
                      setError(err instanceof Error ? err.message : 'Failed to load'),
                    )
                    .finally(() => setTxnLoading(false));
                }}
              >
                Show last 10
              </button>
            ) : null}
          </form>
        ) : null}

        <p className="muted platform-payment-txns-lede">
          {rangeActive
            ? `Confirmed payments from ${rangeFrom} to ${rangeTo}.`
            : 'Last 10 confirmed pass payments.'}
        </p>

        {loading ? <p className="pass-empty">Loading…</p> : null}
        {error ? <p className="error">{error}</p> : null}

        {!loading && payments.length === 0 ? (
          <p className="pass-empty">
            {rangeActive
              ? 'No confirmed payments in this date range.'
              : 'No confirmed payments yet.'}
          </p>
        ) : null}

        {!loading && payments.length > 0 ? (
          <div className="accounts-table-wrap">
            <table className="accounts-table platform-payment-txn-table">
              <thead>
                <tr>
                  {PAYMENT_COLUMNS.map(({ key, label }) => (
                    <th key={key} className="platform-payment-col-head">
                      <TableColumnFilter
                        label={label}
                        values={payments.map((row) => cellValue(row, key))}
                        selected={columnSelected[key] ?? null}
                        sortDir={sortKey === key ? sortDir : null}
                        open={openFilter === key}
                        onToggleOpen={() =>
                          setOpenFilter((prev) => (prev === key ? null : key))
                        }
                        onClose={() => setOpenFilter(null)}
                        onSelectedChange={(next) =>
                          setColumnSelected((prev) => ({ ...prev, [key]: next }))
                        }
                        onSort={(dir) => {
                          setSortKey(dir ? key : null);
                          setSortDir(dir);
                        }}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visiblePayments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="pass-empty">
                      No payments match these filters.
                    </td>
                  </tr>
                ) : (
                  visiblePayments.map((txn) => (
                    <tr key={txn.id}>
                      <td>{txn.swimmerName}</td>
                      <td>{txn.mobile || '—'}</td>
                      <td>{txn.paymentDate || '—'}</td>
                      <td>{txn.passType}</td>
                      <td>{formatMoney(txn.amount)}</td>
                      <td>{txn.paymentMode || '—'}</td>
                      <td>{txn.transactionId || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </PlatformPage>
  );
}
