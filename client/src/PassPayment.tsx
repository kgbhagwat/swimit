import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MenuBackLink } from './MenuBackLink';
import { openPassPopup } from './swimmerPass';
import { tenantPath } from './tenantSession';

type PendingSwimmer = {
  id: number;
  fullName: string;
  contact: string;
  email: string;
  type: 'New' | 'Expired';
  passType: string;
  coach: string;
  batch: string;
};

type PassTypeOption = {
  id: number;
  passName: string;
  duration: string;
  passCharges: number;
  coachingCharges: number;
  coach: string;
};

type BatchSlot = {
  id: string;
  name: string;
  type: string;
  startTime: string;
  endTime: string;
};

type CoachOption = {
  id: number;
  fullName: string;
  suitableBatchIds: string[];
  isActive: boolean;
};

type HolidayRecord = {
  id: number;
  holidayType: string;
  name: string;
  startDate: string;
  endDate: string;
};

type PeriodHoliday = {
  name: string;
  date: string;
};

function uploadUrl(filename: string | null | undefined) {
  if (!filename) return null;
  return `/uploads/${filename}`;
}

function formatBatchTime(value: string) {
  return value.slice(0, 5);
}

function batchLabel(slot: BatchSlot) {
  return `${slot.name} — ${slot.type} — ${formatBatchTime(slot.startTime)} to ${formatBatchTime(slot.endTime)}`;
}

function formatMoney(value: number) {
  return `₹${value.toLocaleString('en-IN')}`;
}

function todayIso() {
  return toIsoDate(new Date());
}

function toIsoDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addPassDuration(duration: string, startDate = todayIso()) {
  const match = duration.trim().match(/^(\d+)\s*(Day|Week|Month|Year)s?$/i);
  const end = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(end.getTime())) {
    return addPassDuration(duration, todayIso());
  }
  if (!match) {
    end.setDate(end.getDate() + 30);
    return toIsoDate(end);
  }
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith('day')) end.setDate(end.getDate() + amount);
  else if (unit.startsWith('week')) end.setDate(end.getDate() + amount * 7);
  else if (unit.startsWith('month')) end.setMonth(end.getMonth() + amount);
  else end.setFullYear(end.getFullYear() + amount);
  return toIsoDate(end);
}

function datesInRange(startDate: string, endDate: string) {
  const dates: string[] = [];
  const cur = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(end.getTime()) || end < cur) return dates;
  while (cur <= end) {
    dates.push(toIsoDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function holidaysInPassPeriod(
  startDate: string,
  endDate: string,
  holidays: HolidayRecord[],
): PeriodHoliday[] {
  const periodDates = datesInRange(startDate, endDate);
  if (periodDates.length === 0) return [];

  const periodSet = new Set(periodDates);
  const items: PeriodHoliday[] = [];
  const seen = new Set<string>();

  function push(name: string, date: string) {
    const key = `${date}|${name.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ name, date });
  }

  for (const holiday of holidays) {
    const overlap = datesInRange(holiday.startDate, holiday.endDate).filter((date) =>
      periodSet.has(date),
    );
    for (const date of overlap) {
      push(holiday.name, date);
    }
  }

  return items.sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    return a.name.localeCompare(b.name);
  });
}

export function PassPayment() {
  const [rows, setRows] = useState<PendingSwimmer[]>([]);
  const [passTypes, setPassTypes] = useState<PassTypeOption[]>([]);
  const [batches, setBatches] = useState<BatchSlot[]>([]);
  const [coaches, setCoaches] = useState<CoachOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState<PendingSwimmer | null>(null);
  const [passTypeId, setPassTypeId] = useState('');
  const [batch, setBatch] = useState('');
  const [coach, setCoach] = useState('');
  const [passStartDate, setPassStartDate] = useState(todayIso());
  const [paymentMode, setPaymentMode] = useState('');
  const [paymentReceived, setPaymentReceived] = useState(false);
  const [transactionId, setTransactionId] = useState('');
  const [paymentQrPath, setPaymentQrPath] = useState<string | null>(null);
  const [upiDetails, setUpiDetails] = useState('');
  const [onlineDetailsLoading, setOnlineDetailsLoading] = useState(false);
  const [holidayRecords, setHolidayRecords] = useState<HolidayRecord[]>([]);
  const [holidaysLoading, setHolidaysLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [pendingRes, passRes, batchRes, staffRes] = await Promise.all([
        fetch('/api/registrations/pending-payment'),
        fetch('/api/pass-types'),
        fetch('/api/batches'),
        fetch('/api/staff-registrations'),
      ]);
      if (!pendingRes.ok) throw new Error('Failed to load pending payments');

      const pending = (await pendingRes.json()) as Array<{
        id: number;
        full_name: string;
        whatsapp_mobile: string;
        email: string;
        pending_type: 'New' | 'Expired';
        pass_type?: string | null;
        coach?: string | null;
        batch?: string | null;
      }>;

      setRows(
        pending.map((row) => ({
          id: row.id,
          fullName: row.full_name,
          contact: row.whatsapp_mobile || '—',
          email: row.email || '—',
          type: row.pending_type === 'Expired' ? 'Expired' : 'New',
          passType: row.pass_type?.trim() || '',
          coach: row.coach?.trim() || '',
          batch: row.batch?.trim() || '',
        })),
      );

      if (passRes.ok) {
        const passes = (await passRes.json()) as PassTypeOption[];
        setPassTypes(passes);
      }
      if (batchRes.ok) {
        const data = (await batchRes.json()) as { slots?: BatchSlot[] };
        setBatches(data.slots ?? []);
      }
      if (staffRes.ok) {
        const staff = (await staffRes.json()) as Array<{
          id: number;
          registration_for: string;
          full_name: string;
          suitable_batch_ids: string[] | null;
          is_active?: boolean;
        }>;
        setCoaches(
          staff
            .filter((row) => row.registration_for === 'Coach')
            .map((row) => ({
              id: row.id,
              fullName: row.full_name,
              suitableBatchIds: Array.isArray(row.suitable_batch_ids)
                ? row.suitable_batch_ids.map(String)
                : [],
              isActive: row.is_active !== false,
            })),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function openPay(row: PendingSwimmer) {
    setPaying(row);
    const matched = passTypes.find((pass) => pass.passName === row.passType);
    setPassTypeId(matched ? String(matched.id) : '');
    setBatch(row.batch || '');
    setCoach(row.coach || '');
    setPassStartDate(todayIso());
    setPaymentMode('');
    setPaymentReceived(false);
    setTransactionId('');
    setPaymentQrPath(null);
    setUpiDetails('');
    setError('');
  }

  function closePay() {
    setPaying(null);
    setPassTypeId('');
    setBatch('');
    setCoach('');
    setPassStartDate(todayIso());
    setPaymentMode('');
    setPaymentReceived(false);
    setTransactionId('');
    setPaymentQrPath(null);
    setUpiDetails('');
  }

  const selectedPass = passTypes.find((pass) => String(pass.id) === passTypeId) ?? null;
  const coachingRequired = Boolean(selectedPass && selectedPass.coach !== 'Not Required');
  const passValidUntil = selectedPass
    ? addPassDuration(selectedPass.duration, passStartDate)
    : '';

  const periodHolidays = useMemo(() => {
    if (!passStartDate || !passValidUntil) return [];
    return holidaysInPassPeriod(passStartDate, passValidUntil, holidayRecords);
  }, [passStartDate, passValidUntil, holidayRecords]);

  useEffect(() => {
    if (!paying || !passStartDate || !passValidUntil) {
      setHolidayRecords([]);
      return;
    }

    const startYear = Number(passStartDate.slice(0, 4));
    const endYear = Number(passValidUntil.slice(0, 4));
    const years = startYear === endYear ? [startYear] : [startYear, endYear];

    let cancelled = false;
    setHolidaysLoading(true);
    Promise.all(years.map((year) => fetch(`/api/holidays?year=${year}`).then(async (res) => {
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to load holidays');
      return body as {
        holidays?: HolidayRecord[];
      };
    })))
      .then((results) => {
        if (cancelled) return;
        const merged = new Map<number, HolidayRecord>();
        for (const result of results) {
          for (const holiday of result.holidays ?? []) {
            merged.set(holiday.id, holiday);
          }
        }
        setHolidayRecords([...merged.values()]);
      })
      .catch(() => {
        if (cancelled) return;
        setHolidayRecords([]);
      })
      .finally(() => {
        if (!cancelled) setHolidaysLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [paying, passStartDate, passValidUntil]);

  useEffect(() => {
    if (!paying || paymentMode !== 'Online') {
      setPaymentQrPath(null);
      setUpiDetails('');
      setOnlineDetailsLoading(false);
      return;
    }

    let cancelled = false;
    setOnlineDetailsLoading(true);
    fetch('/api/pool-core-info')
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? 'Failed to load payment details');
        return body as { paymentQrPath?: string | null; upiDetails?: string };
      })
      .then((body) => {
        if (cancelled) return;
        setPaymentQrPath(body.paymentQrPath ?? null);
        setUpiDetails(String(body.upiDetails ?? '').trim());
      })
      .catch(() => {
        if (cancelled) return;
        setPaymentQrPath(null);
        setUpiDetails('');
      })
      .finally(() => {
        if (!cancelled) setOnlineDetailsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [paying, paymentMode]);

  const selectedBatchSlot = useMemo(
    () => batches.find((slot) => batchLabel(slot) === batch) ?? null,
    [batches, batch],
  );

  const coachesForBatch = useMemo(() => {
    if (!selectedBatchSlot) return [];
    const batchId = String(selectedBatchSlot.id);
    return coaches
      .filter(
        (item) =>
          item.isActive && item.suitableBatchIds.some((id) => String(id) === batchId),
      )
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [coaches, selectedBatchSlot]);

  useEffect(() => {
    if (!coach) return;
    if (!coachingRequired) {
      setCoach('');
      return;
    }
    if (!batch) return;
    const stillAvailable = coachesForBatch.some((item) => item.fullName === coach);
    if (!stillAvailable) setCoach('');
  }, [batch, coach, coachesForBatch, coachingRequired]);

  async function onConfirmPay(e: FormEvent) {
    e.preventDefault();
    if (!paying || !selectedPass) {
      setError('Select a pass type');
      return;
    }
    if (!batch.trim()) {
      setError('Select a batch');
      return;
    }
    if (coachingRequired && !coach) {
      setError('Select a coach for the chosen batch');
      return;
    }
    if (paymentMode !== 'Cash' && paymentMode !== 'Online') {
      setError('Select payment mode');
      return;
    }
    if (paymentMode === 'Cash' && !paymentReceived) {
      setError('Confirm Payment Received for cash');
      return;
    }
    if (paymentMode === 'Online' && !transactionId.trim()) {
      setError('Enter transaction ID');
      return;
    }
    if (paymentMode === 'Online' && !paymentReceived) {
      setError('Confirm that you saw payment completed successfully');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const assignedCoach = !coachingRequired
        ? null
        : coach || (selectedPass.coach !== 'Any' ? selectedPass.coach : null);
      const res = await fetch(`/api/registrations/${paying.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passType: selectedPass.passName,
          coach: assignedCoach,
          batch: batch.trim(),
          passValidUntil,
          paymentMode,
          transactionId: paymentMode === 'Online' ? transactionId.trim() : null,
          isActive: true,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Payment update failed');
      const paidId = paying.id;
      closePay();
      openPassPopup('qr', paidId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment update failed');
    } finally {
      setSaving(false);
    }
  }

  const displayCoach = !selectedPass
    ? ''
    : selectedPass.coach === 'Not Required'
      ? 'Not Required'
      : coach || selectedPass.coach || 'Any';

  return (
    <div className="page">
      <div className="top-row">
        <MenuBackLink />
      </div>

      <div className="swimmer-list-card">
        <h1>Pass Payment</h1>
        <p className="pass-count">
          {rows.length} swimmer{rows.length === 1 ? '' : 's'} pending payment for today
        </p>

        {!paying ? (
          <section className="pass-table-card payment-table-card">
            <div className="payment-table-head">
              <span>Swimmer</span>
              <span>Contact</span>
              <span>Type</span>
              <span>Actions</span>
            </div>

            {loading ? (
              <p className="pass-empty">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="pass-empty">No swimmers pending payment for today.</p>
            ) : (
              <div className="pass-table-body">
                {rows.map((row) => (
                  <div className="payment-row" key={row.id}>
                    <strong>{row.fullName}</strong>
                    <span>
                      <span className="coach-contact">{row.contact}</span>
                      {row.email !== '—' ? (
                        <span className="coach-email">{row.email}</span>
                      ) : null}
                    </span>
                    <span>
                      {row.type}
                      {row.passType ? ` · ${row.passType}` : ''}
                    </span>
                    <span className="pass-actions">
                      <button type="button" className="terms-link" onClick={() => openPay(row)}>
                        Pay
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="swimmer-edit-card" aria-labelledby="pay-title">
            <div className="swimmer-edit-head">
              <div>
                <h2 id="pay-title">Collect pass payment</h2>
                <p className="pass-count">
                  {paying.fullName} · {paying.type}
                </p>
              </div>
              <button type="button" className="csv-btn" onClick={closePay}>
                Back to list
              </button>
            </div>

            <form className="swimmer-edit-form payment-collect-form" onSubmit={onConfirmPay}>
              <label className="field">
                <span className="label">
                  Pass type <span className="req">*</span>
                </span>
                <select
                  value={passTypeId}
                  onChange={(e) => {
                    setPassTypeId(e.target.value);
                    setCoach('');
                  }}
                  required
                >
                  <option value="">Select pass type</option>
                  {passTypes.map((pass) => (
                    <option key={pass.id} value={pass.id}>
                      {pass.passName} · {pass.duration} · {formatMoney(pass.passCharges)}
                    </option>
                  ))}
                </select>
              </label>

              {selectedPass ? (
                <div className="payment-summary">
                  <p>
                    <strong>Duration:</strong> {selectedPass.duration}
                  </p>
                  <p>
                    <strong>Pass charges:</strong> {formatMoney(selectedPass.passCharges)}
                  </p>
                  <p>
                    <strong>Coach:</strong> {displayCoach}
                  </p>
                  <div className="pass-period-row">
                    <strong>Pass Period:</strong>
                    <input
                      type="date"
                      value={passStartDate}
                      onChange={(e) => setPassStartDate(e.target.value || todayIso())}
                      aria-label="Pass start date"
                    />
                    <span className="pass-period-to">to</span>
                    <span className="pass-period-end">{passValidUntil}</span>
                  </div>
                  <div className="pass-period-holidays">
                    <strong>Holidays in period:</strong>
                    {holidaysLoading ? (
                      <p className="hint">Loading holidays…</p>
                    ) : periodHolidays.length === 0 ? (
                      <p className="hint">No holidays in this pass period.</p>
                    ) : (
                      <ul className="pass-period-holiday-list">
                        {periodHolidays.map((item) => (
                          <li key={`${item.date}-${item.name}`}>
                            <span className="pass-period-holiday-name">{item.name}</span>
                            <span className="pass-period-holiday-date">{item.date}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : null}

              <label className="field">
                <span className="label">
                  Batch details <span className="req">*</span>
                </span>
                {batches.length === 0 ? (
                  <p className="batch-empty">
                    No batches available.{' '}
                    <Link className="terms-link" to={tenantPath('/batches')}>
                      Set up batches
                    </Link>
                  </p>
                ) : (
                  <select
                    value={batch}
                    onChange={(e) => {
                      setBatch(e.target.value);
                      setCoach('');
                    }}
                    required
                  >
                    <option value="">Select batch</option>
                    {batches.map((slot) => {
                      const label = batchLabel(slot);
                      return (
                        <option key={slot.id} value={label}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                )}
              </label>

              {coachingRequired && batch ? (
                <label className="field">
                  <span className="label">
                    Coach <span className="req">*</span>
                  </span>
                  {coachesForBatch.length === 0 ? (
                    <p className="batch-empty">No coaches are available for this batch.</p>
                  ) : (
                    <select value={coach} onChange={(e) => setCoach(e.target.value)} required>
                      <option value="">Select coach</option>
                      {coachesForBatch.map((item) => (
                        <option key={item.id} value={item.fullName}>
                          {item.fullName}
                        </option>
                      ))}
                    </select>
                  )}
                </label>
              ) : null}

              <label className="field">
                <span className="label">
                  Payment mode <span className="req">*</span>
                </span>
                <div className="payment-mode-choices" role="radiogroup" aria-label="Payment mode">
                  {(['Cash', 'Online'] as const).map((mode) => (
                    <label
                      key={mode}
                      className={`choice-chip${paymentMode === mode ? ' selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name="paymentMode"
                        value={mode}
                        checked={paymentMode === mode}
                        onChange={() => {
                          setPaymentMode(mode);
                          setPaymentReceived(false);
                          setTransactionId('');
                        }}
                        required
                      />
                      {mode}
                    </label>
                  ))}
                </div>
              </label>

              {paymentMode === 'Cash' ? (
                <label className="payment-received-check">
                  <input
                    type="checkbox"
                    checked={paymentReceived}
                    onChange={(e) => setPaymentReceived(e.target.checked)}
                  />
                  <span>Payment Received</span>
                </label>
              ) : null}

              {paymentMode === 'Online' ? (
                <div className="online-payment-details">
                  {onlineDetailsLoading ? (
                    <p className="muted">Loading payment details…</p>
                  ) : (
                    <>
                      {uploadUrl(paymentQrPath) ? (
                        <img
                          src={uploadUrl(paymentQrPath)!}
                          alt="Payment QR code"
                          className="online-payment-qr"
                        />
                      ) : (
                        <p className="muted">No payment QR code set in Pool Core Info.</p>
                      )}
                      {upiDetails ? (
                        <p className="online-payment-upi">
                          <span className="label">UPI ID</span>
                          <span className="online-payment-upi-value">{upiDetails}</span>
                        </p>
                      ) : (
                        <p className="muted">No UPI ID set in Pool Core Info.</p>
                      )}
                    </>
                  )}
                  <label className="field transaction-id-field">
                    <span className="label">
                      Transaction ID <span className="req">*</span>
                    </span>
                    <input
                      type="text"
                      value={transactionId}
                      onChange={(e) => setTransactionId(e.target.value)}
                      placeholder="Enter UPI / bank transaction ID"
                      autoComplete="off"
                      required
                    />
                  </label>
                  <label className="payment-received-check">
                    <input
                      type="checkbox"
                      checked={paymentReceived}
                      onChange={(e) => setPaymentReceived(e.target.checked)}
                    />
                    <span>Yes, I saw payment completed successfully</span>
                  </label>
                </div>
              ) : null}

              {error ? <p className="error">{error}</p> : null}

              <div className="pass-form-actions">
                <button type="button" className="pass-cancel" onClick={closePay}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="submit"
                  disabled={
                    saving ||
                    !selectedPass ||
                    !batch ||
                    batches.length === 0 ||
                    !paymentMode ||
                    (paymentMode === 'Cash' && !paymentReceived) ||
                    (paymentMode === 'Online' &&
                      (!transactionId.trim() || !paymentReceived)) ||
                    (coachingRequired && (!coach || coachesForBatch.length === 0))
                  }
                >
                  {saving ? 'Saving…' : 'Submit'}
                </button>
              </div>
            </form>
          </section>
        )}

        {error && !paying ? <p className="error">{error}</p> : null}
      </div>
    </div>
  );
}
