import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useT } from './i18n';
import { isApplicationDemo } from './applicationDemo';
import { FilePreview } from './FilePreview';
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
  screenshotUrl: string | null;
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

function isOnlinePayment(mode: string) {
  return /^(online|upi)$/i.test(String(mode ?? '').trim());
}

function formatMoney(value: number) {
  return `₹${Number(value || 0).toLocaleString('en-IN')}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const SAMPLE_SCREENSHOT_URL =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="480" viewBox="0 0 360 480">
      <rect width="360" height="480" fill="#eef3f9"/>
      <rect x="24" y="24" width="312" height="432" rx="16" fill="#fff" stroke="#c5d3e4"/>
      <text x="180" y="88" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#1a3568">UPI payment</text>
      <text x="180" y="230" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" fill="#0a8f4d">Paid</text>
      <text x="180" y="280" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#5b6b84">Sample screenshot</text>
    </svg>`,
  );

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
    screenshotUrl: SAMPLE_SCREENSHOT_URL,
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
    screenshotUrl: null,
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
    screenshotUrl: SAMPLE_SCREENSHOT_URL,
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
    screenshotUrl: null,
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
    screenshotUrl: SAMPLE_SCREENSHOT_URL,
  },
];

function filterSampleByRange(from: string, to: string) {
  return SAMPLE_PAYMENTS.filter((row) => {
    if (!row.paymentDate) return false;
    return row.paymentDate >= from && row.paymentDate <= to;
  });
}

export function PaymentDetails() {
  const t = useT();
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
  const [preview, setPreview] = useState<RecentPassPayment | null>(null);

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
            screenshotUrl: row.screenshotUrl ? String(row.screenshotUrl) : null,
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

  useEffect(() => {
    if (!preview) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setPreview(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);

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
          {t('Confirmed pass payments for this swimming pool account.')}
        </p>
      ) : null}

      <section
        className={`pass-form-card pool-core-form platform-payment-txns${sampleMode ? ' pass-form-card--sample' : ''}`}
      >
        {sampleMode ? (
          <div className="user-mgmt-sample-watermark" aria-hidden="true">
            {t('Sample')}
          </div>
        ) : null}
        <div className="platform-payment-txns-head">
          <h2>{t('Recent payments')}</h2>
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
            {showRangeForm ? t('Hide') : t('More transactions')}
          </button>
        </div>

        {showRangeForm ? (
          <form className="platform-payment-range" onSubmit={onRangeSubmit}>
            <label className="field platform-payment-range-field">
              <span className="label">{t('From')}</span>
              <input
                type="date"
                value={rangeFrom}
                onChange={(e) => setRangeFrom(e.target.value)}
                required
              />
            </label>
            <label className="field platform-payment-range-field">
              <span className="label">{t('To')}</span>
              <input
                type="date"
                value={rangeTo}
                onChange={(e) => setRangeTo(e.target.value)}
                required
              />
            </label>
            <button type="submit" className="submit platform-payment-get-btn" disabled={txnLoading}>
              {txnLoading ? t('Loading…') : t('Get')}
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
                {t('Show last 10')}
              </button>
            ) : null}
          </form>
        ) : null}

        <p className="muted platform-payment-txns-lede">
          {rangeActive
            ? `${t('Confirmed payments from')} ${rangeFrom} ${t('to')} ${rangeTo}.`
            : t('Last 10 confirmed pass payments.')}
        </p>

        {loading ? <p className="pass-empty">{t('Loading…')}</p> : null}
        {error ? <p className="error">{t(error)}</p> : null}

        {!loading && payments.length === 0 ? (
          <p className="pass-empty">
            {rangeActive
              ? t('No confirmed payments in this date range.')
              : t('No confirmed payments yet.')}
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
                        label={t(label)}
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
                  <th>{t('Screenshot')}</th>
                </tr>
              </thead>
              <tbody>
                {visiblePayments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="pass-empty">
                      {t('No payments match these filters.')}
                    </td>
                  </tr>
                ) : (
                  visiblePayments.map((txn) => (
                    <tr key={txn.id}>
                      <td className="payment-txn-swimmer" data-label={t('Swimmer')}>
                        <strong>{txn.swimmerName}</strong>
                      </td>
                      <td data-label={t('Mobile')}>{txn.mobile || '—'}</td>
                      <td data-label={t('Payment date')}>{txn.paymentDate || '—'}</td>
                      <td data-label={t('Pass')}>{txn.passType}</td>
                      <td data-label={t('Amount')}>{formatMoney(txn.amount)}</td>
                      <td data-label={t('Mode')}>{txn.paymentMode || '—'}</td>
                      <td data-label={t('Transaction ID')}>{txn.transactionId || '—'}</td>
                      <td data-label={t('Screenshot')} className="payment-screenshot-cell">
                        {isOnlinePayment(txn.paymentMode) && txn.screenshotUrl ? (
                          <button
                            type="button"
                            className="payment-screenshot-open"
                            onClick={() => setPreview(txn)}
                            aria-label={`${t('View screenshot')} — ${txn.swimmerName}`}
                            title={t('View screenshot')}
                          >
                            <img
                              src={txn.screenshotUrl}
                              alt=""
                              className="payment-screenshot-thumb"
                            />
                          </button>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {preview?.screenshotUrl ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-screenshot-title"
          onClick={() => setPreview(null)}
        >
          <div
            className="modal-panel pool-core-image-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="pass-popup-panel-head">
              <h2 id="payment-screenshot-title">{t('Payment screenshot')}</h2>
              <button
                type="button"
                className="pass-popup-close-x"
                onClick={() => setPreview(null)}
                aria-label={t('Close')}
                title={t('Close')}
              >
                ×
              </button>
            </div>
            <p className="modal-intro">
              {preview.swimmerName}
              {preview.transactionId && preview.transactionId !== '—'
                ? ` · ${preview.transactionId}`
                : ''}
            </p>
            <div className="modal-scroll payment-screenshot-modal-preview">
              <FilePreview
                src={preview.screenshotUrl}
                alt={t('Payment screenshot')}
                className="preview payment-screenshot-full"
              />
            </div>
            <div className="modal-footer">
              <button type="button" className="ghost-btn" onClick={() => setPreview(null)}>
                {t('Close')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PlatformPage>
  );
}
