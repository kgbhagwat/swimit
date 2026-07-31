import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { InPageSelect } from './InPageSelect';
import { MenuBackLink } from './MenuBackLink';
import { canEditPage } from './pageAccess';
import {
  fetchSwimmerProfile,
  SwimmerProfile,
  SwimmerProfileReview,
} from './SwimmerProfileReview';
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
  awaitingWhatsApp?: boolean;
};

type PassTypeOption = {
  id: number;
  passName: string;
  duration: string;
  passCharges: number;
  coachingCharges: number;
  coach: string;
  maxSwimmersPerCoach: number | null;
  exceedingLimitAllowed: boolean;
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
  isApproved: boolean;
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

/** Ladies batches are only for Female swimmers (same rule as coaches). */
function batchesForSwimmerSex(slots: BatchSlot[], sex: string | null | undefined) {
  const normalized = String(sex ?? '').trim();
  if (normalized === 'Female') return slots;
  return slots.filter((slot) => slot.type !== 'Ladies');
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
  const navigate = useNavigate();
  const canEdit = canEditPage('swimmers');
  const [rows, setRows] = useState<PendingSwimmer[]>([]);
  const [passTypes, setPassTypes] = useState<PassTypeOption[]>([]);
  const [batches, setBatches] = useState<BatchSlot[]>([]);
  const [coaches, setCoaches] = useState<CoachOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [successMessage, setSuccessMessage] = useState('');
  const [paying, setPaying] = useState<PendingSwimmer | null>(null);
  const [passTypeId, setPassTypeId] = useState('');
  const [batch, setBatch] = useState('');
  const [coach, setCoach] = useState('');
  const [passStartDate, setPassStartDate] = useState(todayIso());
  const [paymentMode, setPaymentMode] = useState('');
  const [paymentReceived, setPaymentReceived] = useState(false);
  const [transactionId, setTransactionId] = useState('');
  const [paymentModes, setPaymentModes] = useState<Array<'Cash' | 'Online'>>(['Cash', 'Online']);
  const [paymentQrPath, setPaymentQrPath] = useState<string | null>(null);
  const [upiDetails, setUpiDetails] = useState('');
  const [onlineDetailsLoading, setOnlineDetailsLoading] = useState(false);
  const [holidayRecords, setHolidayRecords] = useState<HolidayRecord[]>([]);
  const [holidaysLoading, setHolidaysLoading] = useState(false);
  const [waRequesting, setWaRequesting] = useState(false);
  const [assignmentCount, setAssignmentCount] = useState<number | null>(null);
  const [assignmentCountLoading, setAssignmentCountLoading] = useState(false);
  const [swimmerProfile, setSwimmerProfile] = useState<SwimmerProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [detailsConfirmed, setDetailsConfirmed] = useState(false);

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
        awaitingWhatsApp?: boolean;
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
          awaitingWhatsApp: Boolean(row.awaitingWhatsApp),
        })),
      );

      if (passRes.ok) {
        const passes = (await passRes.json()) as Array<
          PassTypeOption & {
            maxSwimmersPerCoach?: number | null;
            exceedingLimitAllowed?: boolean;
          }
        >;
        setPassTypes(
          passes.map((pass) => ({
            ...pass,
            maxSwimmersPerCoach:
              pass.maxSwimmersPerCoach == null || Number(pass.maxSwimmersPerCoach) <= 0
                ? null
                : Number(pass.maxSwimmersPerCoach),
            exceedingLimitAllowed: pass.exceedingLimitAllowed !== false,
          })),
        );
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
          is_approved?: boolean;
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
              isApproved: row.is_approved === true,
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
    setMissingFields([]);
    setSuccessMessage('');
    setDetailsConfirmed(false);
    setSwimmerProfile(null);
    setProfileLoading(true);
    void fetchSwimmerProfile(row.id)
      .then((profile) => setSwimmerProfile(profile))
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Failed to load swimmer details'),
      )
      .finally(() => setProfileLoading(false));
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
    setAssignmentCount(null);
    setAssignmentCountLoading(false);
    setSwimmerProfile(null);
    setProfileLoading(false);
    setDetailsConfirmed(false);
    setError('');
    setMissingFields([]);
    setSuccessMessage('');
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
    if (!paying) return;

    let cancelled = false;
    fetch('/api/pool-core-info')
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? 'Failed to load payment options');
        return body as {
          paymentAcceptCash?: boolean;
          paymentAcceptOnline?: boolean;
          paymentQrPath?: string | null;
          upiDetails?: string;
        };
      })
      .then((body) => {
        if (cancelled) return;
        const modes: Array<'Cash' | 'Online'> = [];
        if (body.paymentAcceptCash !== false) modes.push('Cash');
        if (body.paymentAcceptOnline !== false) modes.push('Online');
        const allowed: Array<'Cash' | 'Online'> =
          modes.length > 0 ? modes : ['Cash', 'Online'];
        setPaymentModes(allowed);
        setPaymentMode((prev) => (allowed.includes(prev as 'Cash' | 'Online') ? prev : ''));
        setPaymentQrPath(body.paymentQrPath ?? null);
        setUpiDetails(String(body.upiDetails ?? '').trim());
      })
      .catch(() => {
        if (cancelled) return;
        setPaymentModes(['Cash', 'Online']);
      });

    return () => {
      cancelled = true;
    };
  }, [paying]);

  useEffect(() => {
    if (!paying || paymentMode !== 'Online') {
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

  const availableBatches = useMemo(
    () =>
      [...batchesForSwimmerSex(batches, swimmerProfile?.sex)].sort((a, b) => {
        const startDiff = String(a.startTime ?? '').localeCompare(String(b.startTime ?? ''));
        if (startDiff !== 0) return startDiff;
        return String(a.name ?? '').localeCompare(String(b.name ?? ''), undefined, {
          numeric: true,
          sensitivity: 'base',
        });
      }),
    [batches, swimmerProfile?.sex],
  );

  useEffect(() => {
    if (!batch) return;
    const stillAllowed = availableBatches.some((slot) => batchLabel(slot) === batch);
    if (!stillAllowed) {
      setBatch('');
      setCoach('');
    }
  }, [availableBatches, batch]);

  const coachesForBatch = useMemo(() => {
    if (!selectedBatchSlot) return [];
    const batchId = String(selectedBatchSlot.id);
    return coaches
      .filter(
        (item) =>
          item.isActive &&
          item.isApproved &&
          item.suitableBatchIds.some((id) => String(id) === batchId),
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

  useEffect(() => {
    if (!coachingRequired || !batch.trim() || !coach.trim()) {
      setAssignmentCount(null);
      setAssignmentCountLoading(false);
      return;
    }

    let cancelled = false;
    setAssignmentCountLoading(true);
    const params = new URLSearchParams({
      batch: batch.trim(),
      coach: coach.trim(),
    });
    if (paying?.id) params.set('excludeId', String(paying.id));

    fetch(`/api/registrations/assignment-count?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load assignment count');
        return res.json() as Promise<{ count?: number }>;
      })
      .then((data) => {
        if (!cancelled) setAssignmentCount(Number(data.count ?? 0));
      })
      .catch(() => {
        if (!cancelled) setAssignmentCount(null);
      })
      .finally(() => {
        if (!cancelled) setAssignmentCountLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [batch, coach, coachingRequired, paying?.id]);

  const maxSwimmersPerCoach = selectedPass?.maxSwimmersPerCoach ?? null;
  const exceedingLimitAllowed = selectedPass?.exceedingLimitAllowed !== false;
  const assignmentOverLimit =
    assignmentCount != null &&
    maxSwimmersPerCoach != null &&
    assignmentCount >= maxSwimmersPerCoach;

  function confirmAssignmentIfOverLimit() {
    if (!assignmentOverLimit || assignmentCount == null || maxSwimmersPerCoach == null) {
      return true;
    }
    if (!exceedingLimitAllowed) {
      setMissingFields([]);
      setError(
        `This batch already has ${assignmentCount} swimmer${assignmentCount === 1 ? '' : 's'} with coach ${coach} (limit ${maxSwimmersPerCoach}). Exceeding this limit is not allowed for this pass type.`,
      );
      return false;
    }
    return window.confirm(
      `This batch already has ${assignmentCount} swimmer${assignmentCount === 1 ? '' : 's'} with coach ${coach} (limit ${maxSwimmersPerCoach}). Do you still want to assign?\n\nThe account admin will be notified on WhatsApp.`,
    );
  }

  function collectSharedMissing(): string[] {
    const missing: string[] = [];
    if (profileLoading) missing.push('Wait for swimmer details to finish loading');
    if (!profileLoading && !swimmerProfile) missing.push('Swimmer details could not be loaded');
    if (!detailsConfirmed) missing.push('Confirm swimmer details, documents and photo');
    if (!selectedPass) missing.push('Pass type');
    if (selectedPass && !passValidUntil) missing.push('Pass period end date');
    if (availableBatches.length === 0) {
      missing.push('Batch (set up batches first)');
    } else if (!batch.trim()) {
      missing.push('Batch');
    }
    if (coachingRequired) {
      if (coachesForBatch.length === 0) {
        missing.push('Coach (approve a coach for this batch in Staff List)');
      } else if (!coach.trim()) {
        missing.push('Coach');
      }
    }
    return missing;
  }

  function collectSubmitMissing(): string[] {
    const missing = collectSharedMissing();
    if (paymentMode !== 'Cash' && paymentMode !== 'Online') {
      missing.push('Payment mode');
    }
    if (paymentMode === 'Cash' && !paymentReceived) {
      missing.push('Payment Received checkbox');
    }
    if (paymentMode === 'Online') {
      if (!transactionId.trim()) missing.push('Transaction ID');
      if (!paymentReceived) missing.push('Yes, I saw payment completed successfully');
    }
    return missing;
  }

  function showMissing(missing: string[]) {
    setMissingFields(missing);
    setError(missing.length ? 'Please complete the missing items below.' : '');
  }

  async function onRequestWhatsAppPayment() {
    const missing = collectSharedMissing();
    if (missing.length) {
      showMissing(missing);
      return;
    }
    if (!paying || !selectedPass) {
      showMissing(['Pass type']);
      return;
    }
    if (!confirmAssignmentIfOverLimit()) return;

    setWaRequesting(true);
    setError('');
    setMissingFields([]);
    try {
      const assignedCoach = !coachingRequired
        ? null
        : coach || (selectedPass.coach !== 'Any' ? selectedPass.coach : null);
      const res = await fetch(`/api/registrations/${paying.id}/pass-payment-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passType: selectedPass.passName,
          coach: assignedCoach,
          batch: batch.trim(),
          passValidUntil,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to send payment request');

      if (body.whatsapp?.ok === false) {
        setError(
          `Payment request saved, but WhatsApp failed: ${body.whatsapp.error || 'send failed'}. Swimmer can still send the screenshot to the business number.`,
        );
      }
      await load();
    } catch (err) {
      setMissingFields([]);
      setError(err instanceof Error ? err.message : 'Failed to send payment request');
    } finally {
      setWaRequesting(false);
    }
  }

  async function onConfirmPay(e: FormEvent) {
    e.preventDefault();
    const missing = collectSubmitMissing();
    if (missing.length) {
      showMissing(missing);
      return;
    }
    if (!paying || !selectedPass) {
      showMissing(['Pass type']);
      return;
    }
    if (!confirmAssignmentIfOverLimit()) return;
    setSaving(true);
    setError('');
    setMissingFields([]);
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
      const paidName = paying.fullName;
      const paidContact = paying.contact;
      const wa = body.whatsapp as
        | { skipped?: boolean; error?: string; result?: string }
        | undefined;
      closePay();
      if (wa?.skipped) {
        setSuccessMessage(
          `Pass generated for ${paidName}, but WhatsApp was not sent${
            wa.error ? `: ${wa.error}` : ''
          }. Use Resend on Swimmer List to send the full pass and QR.`,
        );
      } else if (wa?.result === 'pass_only') {
        setSuccessMessage(
          `Full pass image sent on WhatsApp to ${paidName}${
            paidContact && paidContact !== '—' ? ` (${paidContact})` : ''
          }, but the QR failed${wa.error ? `: ${wa.error}` : ''}. Use Resend if needed.`,
        );
      } else if (wa?.result === 'qr_only') {
        setSuccessMessage(
          `Pass QR sent on WhatsApp to ${paidName}${
            paidContact && paidContact !== '—' ? ` (${paidContact})` : ''
          }, but the full pass image failed${wa.error ? `: ${wa.error}` : ''}. Use Resend if needed.`,
        );
      } else {
        setSuccessMessage(
          `Full pass image and Pass QR sent on WhatsApp to ${paidName}${
            paidContact && paidContact !== '—' ? ` (${paidContact})` : ''
          }.`,
        );
      }
      await load();
    } catch (err) {
      setMissingFields([]);
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
        {successMessage && !paying ? <p className="success">{successMessage}</p> : null}

        {!paying ? (
          <section className="pass-table-card payment-table-card">
            {loading ? (
              <p className="pass-empty">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="pass-empty">No swimmers pending payment for today.</p>
            ) : (
              <div className="payment-table-wrap">
                <table className="payment-info-table">
                  <thead>
                    <tr>
                      <th scope="col">Swimmer</th>
                      <th scope="col">Contact</th>
                      <th scope="col">Email</th>
                      <th scope="col">Type</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td className="payment-swimmer-name">{row.fullName}</td>
                        <td>{row.contact}</td>
                        <td>{row.email !== '—' ? row.email : '—'}</td>
                        <td>
                          {row.type}
                          {row.passType ? ` · ${row.passType}` : ''}
                          {row.awaitingWhatsApp ? (
                            <span className="pass-wa-wait"> · Awaiting WhatsApp payment</span>
                          ) : null}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="terms-link"
                            onClick={() => openPay(row)}
                          >
                            Pay
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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

            <SwimmerProfileReview
              profile={swimmerProfile}
              loading={profileLoading}
              title="Confirm swimmer details"
              hint="Review documents, photo and registration information before collecting payment."
              actions={
                canEdit && swimmerProfile ? (
                  <button
                    type="button"
                    className="submit"
                    onClick={() =>
                      navigate(tenantPath(`/register/${paying.id}`), {
                        state: { returnTo: tenantPath('/pass-payment') },
                      })
                    }
                  >
                    Edit
                  </button>
                ) : null
              }
              footer={
                swimmerProfile ? (
                  <label className="payment-received-check swimmer-review-confirm">
                    <input
                      type="checkbox"
                      checked={detailsConfirmed}
                      onChange={(e) => {
                        setDetailsConfirmed(e.target.checked);
                        setMissingFields([]);
                      }}
                    />
                    <span>
                      I have verified the swimmer details, identity document and photo
                    </span>
                  </label>
                ) : null
              }
            />

            <form
              className="swimmer-edit-form payment-collect-form"
              onSubmit={onConfirmPay}
              noValidate
            >
              <label className="field">
                <span className="label">
                  Pass type <span className="req">*</span>
                </span>
                <InPageSelect
                  aria-label="Pass type"
                  value={passTypeId}
                  placeholder="Select pass type"
                  onChange={(next) => {
                    setPassTypeId(next);
                    setCoach('');
                    setMissingFields([]);
                  }}
                  options={passTypes.map((pass) => ({
                    value: String(pass.id),
                    label: `${pass.passName} · ${pass.duration} · ${formatMoney(pass.passCharges)}`,
                  }))}
                />
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
                {availableBatches.length === 0 ? (
                  <p className="batch-empty">
                    No batches available.{' '}
                    <Link className="terms-link" to={tenantPath('/batches')}>
                      Set up batches
                    </Link>
                  </p>
                ) : (
                  <InPageSelect
                    aria-label="Batch details"
                    value={batch}
                    placeholder="Select batch"
                    onChange={(next) => {
                      setBatch(next);
                      setCoach('');
                      setMissingFields([]);
                    }}
                    options={availableBatches.map((slot) => {
                      const label = batchLabel(slot);
                      return { value: label, label };
                    })}
                  />
                )}
              </label>

              {coachingRequired && batch ? (
                <label className="field">
                  <span className="label">
                    Coach <span className="req">*</span>
                  </span>
                  {coachesForBatch.length === 0 ? (
                    <p className="batch-empty">
                      No approved coaches are available for this batch. Approve coaches in Staff
                      List first.
                    </p>
                  ) : (
                    <InPageSelect
                      aria-label="Coach"
                      value={coach}
                      placeholder="Select coach"
                      onChange={(next) => {
                        setCoach(next);
                        setMissingFields([]);
                      }}
                      options={coachesForBatch.map((item) => ({
                        value: item.fullName,
                        label: item.fullName,
                      }))}
                    />
                  )}
                  {coach ? (
                    <p
                      className={`assignment-count${assignmentOverLimit ? ' assignment-count-over' : ''}`}
                    >
                      {assignmentCountLoading
                        ? 'Counting swimmers in this batch with this coach…'
                        : assignmentCount == null
                          ? 'Could not load swimmer count for this batch and coach.'
                          : maxSwimmersPerCoach == null
                            ? `Swimmers in this batch with this coach: ${assignmentCount} (No Limit)`
                            : `Swimmers in this batch with this coach: ${assignmentCount} / ${maxSwimmersPerCoach}${
                                assignmentOverLimit && !exceedingLimitAllowed
                                  ? ' — exceeding not allowed'
                                  : ''
                              }`}
                    </p>
                  ) : null}
                </label>
              ) : null}

              <label className="field">
                <span className="label">
                  Payment mode <span className="req">*</span>
                </span>
                <div className="payment-mode-choices" role="radiogroup" aria-label="Payment mode">
                  {paymentModes.map((mode) => (
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

                  <p className="hint">
                    Preferred: send a WhatsApp payment request. The swimmer pays this pool UPI /
                    QR and sends the screenshot — amount and UPI are verified automatically.
                  </p>
                  <button
                    type="button"
                    className="csv-btn"
                    disabled={waRequesting}
                    onClick={() => void onRequestWhatsAppPayment()}
                  >
                    {waRequesting ? 'Sending…' : 'Send WhatsApp payment request'}
                  </button>

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
              {missingFields.length > 0 ? (
                <div className="payment-missing-box" role="alert">
                  <strong>Missing:</strong>
                  <ul>
                    {missingFields.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="pass-form-actions">
                <button type="button" className="pass-cancel" onClick={closePay}>
                  Cancel
                </button>
                <button type="submit" className="submit" disabled={saving}>
                  {saving ? 'Issuing…' : 'Issue Pass'}
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
