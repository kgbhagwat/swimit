import { FormEvent, useEffect, useState } from 'react';
import { isApplicationDemo } from './applicationDemo';
import { PlatformPage } from './PlatformPage';

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
      <p className="lede batch-list-lede">
        {sampleMode
          ? 'Sample layout — preview of confirmed pass payments.'
          : 'Confirmed pass payments for this swimming pool account.'}
      </p>

      <section
        className={`pass-form-card pool-core-form platform-payment-txns${sampleMode ? ' pass-form-card--sample' : ''}`}
      >
        {sampleMode ? (
          <div className="user-mgmt-sample-watermark" aria-hidden="true">
            Sample
          </div>
        ) : null}
        <div className="platform-payment-txns-head">
          <div>
            <h2>Recent payments</h2>
            <p className="muted" style={{ marginTop: 0, marginBottom: 0 }}>
              {rangeActive
                ? `Confirmed payments from ${rangeFrom} to ${rangeTo}.`
                : 'Last 10 confirmed pass payments (amount and UPI verified from screenshot when paid online).'}
            </p>
          </div>
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
            {showRangeForm ? 'Hide date range' : 'More transaction details'}
          </button>
        </div>

        {showRangeForm ? (
          <form className="platform-payment-range" onSubmit={onRangeSubmit}>
            <label className="field">
              <span className="label">From</span>
              <input
                type="date"
                value={rangeFrom}
                onChange={(e) => setRangeFrom(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span className="label">To</span>
              <input
                type="date"
                value={rangeTo}
                onChange={(e) => setRangeTo(e.target.value)}
                required
              />
            </label>
            <div className="platform-payment-range-actions">
              <button type="submit" className="csv-btn" disabled={txnLoading}>
                {txnLoading ? 'Loading…' : 'Get transactions'}
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
            </div>
          </form>
        ) : null}

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
                  <th>Swimmer</th>
                  <th>Mobile</th>
                  <th>Payment date</th>
                  <th>Pass</th>
                  <th>Amount</th>
                  <th>Mode</th>
                  <th>Transaction ID</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((txn) => (
                  <tr key={txn.id}>
                    <td>{txn.swimmerName}</td>
                    <td>{txn.mobile || '—'}</td>
                    <td>{txn.paymentDate || '—'}</td>
                    <td>{txn.passType}</td>
                    <td>{formatMoney(txn.amount)}</td>
                    <td>{txn.paymentMode || '—'}</td>
                    <td>{txn.transactionId || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </PlatformPage>
  );
}
