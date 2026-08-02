import { FormEvent, useEffect, useState } from 'react';
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

export function PaymentDetails() {
  const [payments, setPayments] = useState<RecentPassPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showRangeForm, setShowRangeForm] = useState(false);
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [rangeActive, setRangeActive] = useState(false);
  const [txnLoading, setTxnLoading] = useState(false);

  async function loadPayments(params?: { from?: string; to?: string }) {
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
      <p className="lede">Confirmed pass payments for this swimming pool account.</p>

      <section className="pass-form-card platform-payment-txns">
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
