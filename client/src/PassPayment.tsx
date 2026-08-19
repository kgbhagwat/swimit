import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FilePreview } from './FilePreview';
import { InPageSelect } from './InPageSelect';
import { useT } from './i18n';
import { canEditPage } from './pageAccess';
import { PlatformPage } from './PlatformPage';
import { QrImage } from './QrImage';
import {
  getSamplePassPaymentQueue,
  isApplicationDemo,
  markSampleSwimmerPaid,
} from './applicationDemo';
import { SAMPLE_STAFF_BATCHES } from './sampleStaff';
import {
  fetchSwimmerProfile,
  SwimmerProfile,
  SwimmerProfileReview,
} from './SwimmerProfileReview';
import { tenantPath } from './tenantSession';
import { buildUpiPayUri, openUpiPay } from './upiPay';

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

const SAMPLE_PENDING_SWIMMERS: PendingSwimmer[] = [
  {
    id: -1,
    fullName: 'Aarav Patil',
    contact: '9876543210',
    email: 'aarav@example.com',
    type: 'New',
    passType: 'Monthly Swim',
    coach: 'Any',
    batch: 'Morning A',
  },
  {
    id: -2,
    fullName: 'Neha Deshmukh',
    contact: '9123456780',
    email: 'neha@example.com',
    type: 'Expired',
    passType: 'Quarterly Swim',
    coach: 'Any',
    batch: 'Evening B',
    awaitingWhatsApp: true,
  },
];

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

const SAMPLE_PASS_TYPES: PassTypeOption[] = [
  {
    id: -101,
    passName: 'Monthly Swim',
    duration: '1 Month',
    passCharges: 2000,
    coachingCharges: 500,
    coach: 'Any',
    maxSwimmersPerCoach: 12,
    exceedingLimitAllowed: true,
  },
  {
    id: -102,
    passName: 'Quarterly Swim',
    duration: '3 Months',
    passCharges: 5000,
    coachingCharges: 500,
    coach: 'Any',
    maxSwimmersPerCoach: 12,
    exceedingLimitAllowed: true,
  },
];

const SAMPLE_BATCHES = SAMPLE_STAFF_BATCHES;

const SAMPLE_COACHES: CoachOption[] = [
  {
    id: -201,
    fullName: 'Riya Kulkarni',
    suitableBatchIds: ['sample-morning-a', 'sample-evening-b'],
    isActive: true,
    isApproved: true,
  },
];

const SAMPLE_UPI_ID = 'swimit.demo@okaxis';

/** Placeholder QR graphic for sample payment collect view. */
const SAMPLE_PAYMENT_QR_URL =
  'data:image/svg+xml,' +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">
  <rect width="180" height="180" fill="#fff"/>
  <rect x="12" y="12" width="52" height="52" fill="#1a3568"/>
  <rect x="20" y="20" width="36" height="36" fill="#fff"/>
  <rect x="28" y="28" width="20" height="20" fill="#1a3568"/>
  <rect x="116" y="12" width="52" height="52" fill="#1a3568"/>
  <rect x="124" y="20" width="36" height="36" fill="#fff"/>
  <rect x="132" y="28" width="20" height="20" fill="#1a3568"/>
  <rect x="12" y="116" width="52" height="52" fill="#1a3568"/>
  <rect x="20" y="124" width="36" height="36" fill="#fff"/>
  <rect x="28" y="132" width="20" height="20" fill="#1a3568"/>
  <rect x="76" y="12" width="12" height="12" fill="#1a3568"/>
  <rect x="100" y="12" width="12" height="12" fill="#1a3568"/>
  <rect x="76" y="36" width="12" height="12" fill="#1a3568"/>
  <rect x="88" y="48" width="12" height="12" fill="#1a3568"/>
  <rect x="76" y="76" width="28" height="28" fill="#1a3568"/>
  <rect x="116" y="76" width="12" height="12" fill="#1a3568"/>
  <rect x="140" y="76" width="12" height="12" fill="#1a3568"/>
  <rect x="116" y="100" width="12" height="12" fill="#1a3568"/>
  <rect x="152" y="100" width="12" height="12" fill="#1a3568"/>
  <rect x="76" y="116" width="12" height="12" fill="#1a3568"/>
  <rect x="100" y="128" width="12" height="12" fill="#1a3568"/>
  <rect x="76" y="152" width="12" height="12" fill="#1a3568"/>
  <rect x="116" y="116" width="20" height="20" fill="#1a3568"/>
  <rect x="148" y="140" width="20" height="20" fill="#1a3568"/>
  <text x="90" y="98" text-anchor="middle" font-size="11" font-family="sans-serif" fill="#64748b">SAMPLE</text>
</svg>`);

function isSamplePendingId(id: number) {
  return id < 0;
}

function sampleProfileFromRow(row: PendingSwimmer): SwimmerProfile {
  return {
    id: row.id,
    fullName: row.fullName,
    fullAddress: '12 Lake View Road, Pune',
    whatsappMobile: row.contact,
    otherMobile: '',
    email: row.email === '—' ? '' : row.email,
    birthdate: '2005-04-12',
    sex: 'Male',
    bloodGroup: 'B+',
    emergencyName: 'Parent Guardian',
    emergencyRelation: 'Parent',
    emergencyMobile: '9988776655',
    parentName: 'Parent Guardian',
    parentRelation: 'Parent',
    parentMobile: '9988776655',
    hasHealthIssue: 'No',
    healthIssueDetails: '',
    doctorName: '',
    doctorNo: '',
    identityDocument: 'Aadhaar',
    identityPhotoUrl: null,
    photoUrl: null,
  };
}

function resolveBatchValue(rowBatch: string, slots: BatchSlot[]) {
  const trimmed = rowBatch.trim();
  if (!trimmed) return '';
  const exact = slots.find((slot) => batchLabel(slot) === trimmed);
  if (exact) return batchLabel(exact);
  const byName = slots.find((slot) => slot.name === trimmed);
  if (byName) return batchLabel(byName);
  return trimmed;
}

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
  const t = useT();
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
  const [issueSuccessMessage, setIssueSuccessMessage] = useState('');
  const [dismissedSampleIds, setDismissedSampleIds] = useState<number[]>([]);
  const issueCloseTimerRef = useRef<number | null>(null);

  function clearIssueCloseTimer() {
    if (issueCloseTimerRef.current != null) {
      window.clearTimeout(issueCloseTimerRef.current);
      issueCloseTimerRef.current = null;
    }
  }

  useEffect(() => () => clearIssueCloseTimer(), []);

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
    const sample = isSamplePendingId(row.id);
    const activePassTypes = sample ? SAMPLE_PASS_TYPES : passTypes;
    const activeBatches = sample ? SAMPLE_BATCHES : batches;
    setPaying(row);
    const matched = activePassTypes.find((pass) => pass.passName === row.passType);
    setPassTypeId(matched ? String(matched.id) : '');
    setBatch(resolveBatchValue(row.batch || '', activeBatches));
    setCoach(sample && (row.coach === 'Any' || !row.coach) ? SAMPLE_COACHES[0].fullName : row.coach || '');
    setPassStartDate(todayIso());
    setPaymentMode(sample ? 'Cash' : '');
    setPaymentReceived(false);
    setTransactionId('');
    setPaymentQrPath(null);
    setUpiDetails('');
    if (sample) setPaymentModes(['Cash', 'Online']);
    setError('');
    setMissingFields([]);
    setSuccessMessage('');
    clearIssueCloseTimer();
    setIssueSuccessMessage('');
    setDetailsConfirmed(false);
    if (sample) {
      setSwimmerProfile(sampleProfileFromRow(row));
      setProfileLoading(false);
      setHolidayRecords([]);
      setHolidaysLoading(false);
      setAssignmentCount(3);
      setAssignmentCountLoading(false);
      setPaymentQrPath(null);
      setUpiDetails(SAMPLE_UPI_ID);
      return;
    }
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
    clearIssueCloseTimer();
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
    setIssueSuccessMessage('');
  }

  function scheduleCloseAfterIssue(afterClose?: () => void) {
    clearIssueCloseTimer();
    issueCloseTimerRef.current = window.setTimeout(() => {
      issueCloseTimerRef.current = null;
      afterClose?.();
      closePay();
    }, 2500);
  }

  const samplePaying = Boolean(paying && isSamplePendingId(paying.id));
  const activePassTypes = samplePaying ? SAMPLE_PASS_TYPES : passTypes;
  const activeBatches = samplePaying ? SAMPLE_BATCHES : batches;
  const activeCoaches = samplePaying ? SAMPLE_COACHES : coaches;

  const selectedPass = activePassTypes.find((pass) => String(pass.id) === passTypeId) ?? null;
  const coachingRequired = Boolean(selectedPass && selectedPass.coach !== 'Not Required');
  const passValidUntil = selectedPass
    ? addPassDuration(selectedPass.duration, passStartDate)
    : '';

  const periodHolidays = useMemo(() => {
    if (!passStartDate || !passValidUntil) return [];
    return holidaysInPassPeriod(passStartDate, passValidUntil, holidayRecords);
  }, [passStartDate, passValidUntil, holidayRecords]);

  useEffect(() => {
    if (!paying || samplePaying || !passStartDate || !passValidUntil) {
      if (!paying || !passStartDate || !passValidUntil) setHolidayRecords([]);
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
  }, [paying, samplePaying, passStartDate, passValidUntil]);

  useEffect(() => {
    if (!paying || samplePaying) return;

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
  }, [paying, samplePaying]);

  useEffect(() => {
    if (!paying || samplePaying || paymentMode !== 'Online') {
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
  }, [paying, samplePaying, paymentMode]);

  const selectedBatchSlot = useMemo(
    () => activeBatches.find((slot) => batchLabel(slot) === batch) ?? null,
    [activeBatches, batch],
  );

  const availableBatches = useMemo(
    () =>
      [...batchesForSwimmerSex(activeBatches, swimmerProfile?.sex)].sort((a, b) => {
        const startDiff = String(a.startTime ?? '').localeCompare(String(b.startTime ?? ''));
        if (startDiff !== 0) return startDiff;
        return String(a.name ?? '').localeCompare(String(b.name ?? ''), undefined, {
          numeric: true,
          sensitivity: 'base',
        });
      }),
    [activeBatches, swimmerProfile?.sex],
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
    return activeCoaches
      .filter(
        (item) =>
          item.isActive &&
          item.suitableBatchIds.some((id) => String(id) === batchId),
      )
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [activeCoaches, selectedBatchSlot]);

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
    if (samplePaying || !coachingRequired || !batch.trim() || !coach.trim()) {
      setAssignmentCount(samplePaying ? 3 : null);
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
  }, [batch, coach, coachingRequired, paying?.id, samplePaying]);

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
        `${t('This batch already has')} ${assignmentCount} ${
          assignmentCount === 1 ? t('swimmer') : t('swimmers')
        } ${t('with coach')} ${coach} (${t('limit')} ${maxSwimmersPerCoach}). ${t(
          'Exceeding this limit is not allowed for this pass type.',
        )}`,
      );
      return false;
    }
    return window.confirm(
      `${t('This batch already has')} ${assignmentCount} ${
        assignmentCount === 1 ? t('swimmer') : t('swimmers')
      } ${t('with coach')} ${coach} (${t('limit')} ${maxSwimmersPerCoach}). ${t(
        'Do you still want to assign?',
      )}\n\n${t('The account admin will be notified on WhatsApp.')}`,
    );
  }

  function collectSharedMissing(): string[] {
    const missing: string[] = [];
    if (profileLoading) missing.push('Wait for swimmer details to finish loading');
    if (!profileLoading && !swimmerProfile) missing.push('Swimmer details could not be loaded');
    if (!detailsConfirmed) missing.push('Confirm swimmer details, documents and photo');
    if (!selectedPass) missing.push('Pass');
    if (selectedPass && !passValidUntil) missing.push('Pass period end date');
    if (availableBatches.length === 0) {
      missing.push('Batch (set up batches first)');
    } else if (!batch.trim()) {
      missing.push('Batch');
    }
    if (coachingRequired) {
      if (coachesForBatch.length === 0) {
                        missing.push('Coach (activate a coach for this batch in Staff List)');
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
      if (!paymentReceived) missing.push('I confirmed amount and upi id of successful payment');
    }
    return missing;
  }

  function showMissing(missing: string[]) {
    setMissingFields(missing);
    setError(missing.length ? 'Please complete the missing items below.' : '');
  }

  async function onRequestWhatsAppPayment() {
    if (samplePaying) return;
    const missing = collectSharedMissing();
    if (missing.length) {
      showMissing(missing);
      return;
    }
    if (!paying || !selectedPass) {
      showMissing(['Pass']);
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
          `${t('Payment request saved, but WhatsApp failed')}: ${
            body.whatsapp.error || t('send failed')
          }. ${t('Swimmer can still send the screenshot to the business number.')}`,
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
    if (issueSuccessMessage) return;
    if (samplePaying) {
      if (!paying) return;
      const paidId = paying.id;
      setError('');
      setMissingFields([]);
      setIssueSuccessMessage('Pass generated successfully and sent on whatsapp');
      scheduleCloseAfterIssue(() => {
        markSampleSwimmerPaid(paidId, selectedPass?.passName || paying.passType || 'Monthly Swim');
        setDismissedSampleIds((ids) => (ids.includes(paidId) ? ids : [...ids, paidId]));
      });
      return;
    }
    const missing = collectSubmitMissing();
    if (missing.length) {
      showMissing(missing);
      return;
    }
    if (!paying || !selectedPass) {
      showMissing(['Pass']);
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
      setIssueSuccessMessage('Pass generated successfully and sent on whatsapp');
      scheduleCloseAfterIssue(() => {
        void load();
      });
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
      ? t('Not Required')
      : coach || (selectedPass.coach === 'Any' ? t('Any') : selectedPass.coach) || t('Any');

  const sampleOnlineQrUrl = samplePaying ? SAMPLE_PAYMENT_QR_URL : null;
  const onlineQrUrl = uploadUrl(paymentQrPath) ?? sampleOnlineQrUrl;
  const onlineUpi = samplePaying ? upiDetails || SAMPLE_UPI_ID : upiDetails;
  const onlinePayAmount = selectedPass
    ? Math.round(
        (Number(selectedPass.passCharges) + Number(selectedPass.coachingCharges ?? 0)) * 100,
      ) / 100
    : 0;
  const amountLockedUpiQr =
    onlineUpi && onlinePayAmount > 0
      ? buildUpiPayUri(
          onlineUpi,
          onlinePayAmount,
          selectedPass ? `Pass ${selectedPass.passName}` : 'Pass payment',
        )
      : '';

  const queuedSamplePayments = isApplicationDemo()
    ? getSamplePassPaymentQueue()
        .filter((row) => !dismissedSampleIds.includes(row.id))
        .map(
          (row): PendingSwimmer => ({
            id: row.id,
            fullName: row.fullName,
            contact: row.contact || '—',
            email: row.email || '—',
            type: 'Expired',
            passType: row.passType,
            coach: row.coach || 'Any',
            batch: row.batch,
          }),
        )
    : [];

  const samplePreview = isApplicationDemo() || (!loading && rows.length === 0 && !paying);
  const displayRows = samplePreview
    ? [
        ...queuedSamplePayments,
        ...SAMPLE_PENDING_SWIMMERS.filter(
          (row) =>
            !dismissedSampleIds.includes(row.id) &&
            !queuedSamplePayments.some((queued) => queued.id === row.id),
        ),
      ]
    : rows;

  const pendingCountLede =
    rows.length === 1
      ? `1 ${t('swimmer pending payment for today')}`
      : `${rows.length} ${t('swimmers pending payment for today')}`;

  const assignmentCountText = assignmentCountLoading
    ? t('Counting swimmers in this batch with this coach…')
    : assignmentCount == null
      ? t('Could not load swimmer count for this batch and coach.')
      : maxSwimmersPerCoach == null
        ? `${t('Swimmers in this batch with this coach')}: ${assignmentCount} (${t('No Limit')})`
        : `${t('Swimmers in this batch with this coach')}: ${assignmentCount} / ${maxSwimmersPerCoach}${
            assignmentOverLimit && !exceedingLimitAllowed
              ? ` — ${t('exceeding not allowed')}`
              : ''
          }`;

  return (
    <PlatformPage title="Pass Payment" className="pass-payment-page">
      {!paying ? (
        <p className="lede batch-list-lede">
          {samplePreview
            ? t('Sample layout — pending pass payments appear here.')
            : pendingCountLede}
        </p>
      ) : null}
      {successMessage && !paying ? <p className="success">{t(successMessage)}</p> : null}

      {!paying ? (
        <section
          className={`pass-table-card payment-pass-table${
            samplePreview ? ' pass-table-card--sample' : ''
          }`}
        >
          {samplePreview ? (
            <div className="user-mgmt-sample-watermark" aria-hidden="true">
              {t('Sample')}
            </div>
          ) : null}
          <div className="pass-table-head">
            <span>{t('Swimmer')}</span>
            <span>{t('Contact')}</span>
            <span>{t('Email')}</span>
            <span>{t('Type')}</span>
            <span>{t('Actions')}</span>
          </div>
          {loading ? (
            <p className="pass-empty">{t('Loading…')}</p>
          ) : (
            <div className="pass-table-body">
              {displayRows.map((row, index) => (
                <div className={`pass-row pass-row-tone-${index % 4}`} key={row.id}>
                  <div className="pass-block-row">
                    <strong data-label={t('Swimmer')}>{row.fullName}</strong>
                    <span data-label={t('Contact')}>{row.contact}</span>
                    <span data-label={t('Email')}>{row.email !== '—' ? row.email : '—'}</span>
                    <span data-label={t('Type')}>
                      {t(row.type)}
                      {row.passType ? ` · ${row.passType}` : ''}
                      {row.awaitingWhatsApp ? (
                        <span className="pass-wa-wait"> · {t('Awaiting WhatsApp payment')}</span>
                      ) : null}
                    </span>
                  </div>
                  <div className="pass-block-row">
                    <span className="pass-actions" data-label={t('Actions')}>
                      <button
                        type="button"
                        className="terms-link"
                        onClick={() => openPay(row)}
                      >
                        {t('Pay')}
                      </button>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section
          className={`pass-form-card pool-core-form payment-collect-card${
            samplePaying ? ' pass-form-card--sample' : ''
          }`}
          aria-labelledby="pay-title"
        >
          {samplePaying ? (
            <div className="user-mgmt-sample-watermark" aria-hidden="true">
              {t('Sample')}
            </div>
          ) : null}
          <div className="swimmer-edit-head">
            <div>
              <h2 id="pay-title">{t('Collect pass payment')}</h2>
              <p className="pass-count">
                {samplePaying
                  ? `${paying.fullName} · ${t(paying.type)} — ${t('sample layout')}`
                  : `${paying.fullName} · ${t(paying.type)}`}
              </p>
            </div>
            <button type="button" className="csv-btn" onClick={closePay}>
              {t('Back to list')}
            </button>
          </div>

          <SwimmerProfileReview
            profile={swimmerProfile}
            loading={profileLoading}
            title={t('Confirm swimmer details')}
            actions={
              canEdit && swimmerProfile && !samplePaying ? (
                <button
                  type="button"
                  className="submit"
                  onClick={() =>
                    navigate(tenantPath(`/register/${paying.id}`), {
                      state: { returnTo: tenantPath('/pass-payment') },
                    })
                  }
                >
                  {t('Edit')}
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
                    {t('I have verified the swimmer details, identity document and photo')}
                  </span>
                </label>
              ) : null
            }
          />

          {detailsConfirmed ? (
          <form
            className="pass-form payment-collect-form"
            onSubmit={onConfirmPay}
            noValidate
          >
              <label className="field payment-pass-type-field">
                <span className="label">
                  {t('Pass')} <span className="req">*</span>
                </span>
                <InPageSelect
                  aria-label={t('Pass')}
                  value={passTypeId}
                  placeholder={t('Select pass')}
                  searchable
                  onChange={(next) => {
                    setPassTypeId(next);
                    setCoach('');
                    setMissingFields([]);
                  }}
                  options={activePassTypes.map((pass) => ({
                    value: String(pass.id),
                    label: `${pass.passName} · ${pass.duration} · ${formatMoney(pass.passCharges)}`,
                    searchText: pass.passName,
                  }))}
                />
              </label>

              {selectedPass ? (
                <div className="payment-summary">
                  <div className="payment-summary-cell">
                    <span className="payment-summary-label">{t('Duration of pass')}</span>
                    <span className="payment-summary-value">{selectedPass.duration}</span>
                  </div>
                  <div className="payment-summary-cell">
                    <span className="payment-summary-label">{t('Pass charges')}</span>
                    <span className="payment-summary-value">
                      {formatMoney(selectedPass.passCharges)}
                    </span>
                  </div>
                  <div className="payment-summary-cell">
                    <span className="payment-summary-label">{t('Coach')}</span>
                    <span className="payment-summary-value">{displayCoach}</span>
                  </div>
                  <div className="payment-summary-cell">
                    <span className="payment-summary-label">{t('Issue date')}</span>
                    <input
                      type="date"
                      value={passStartDate}
                      onChange={(e) => setPassStartDate(e.target.value || todayIso())}
                      aria-label={t('Issue date')}
                    />
                  </div>
                  <div className="payment-summary-cell">
                    <span className="payment-summary-label">{t('Expiry date')}</span>
                    <span className="payment-summary-value">{passValidUntil}</span>
                  </div>
                  <div className="payment-summary-cell payment-summary-holidays">
                    <span className="payment-summary-label">{t('Holidays')}</span>
                    {holidaysLoading ? (
                      <span className="hint">{t('Loading holidays…')}</span>
                    ) : periodHolidays.length === 0 ? (
                      <span className="hint">{t('No holidays in this pass period.')}</span>
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

              <div className="payment-batch-coach-row">
                <label className="field payment-batch-field">
                  <span className="label">
                    {t('Batch')} <span className="req">*</span>
                  </span>
                  {availableBatches.length === 0 ? (
                    <p className="batch-empty">
                      {t('No batches available.')}{' '}
                      <Link className="terms-link" to={tenantPath('/batches')}>
                        {t('Set up batches')}
                      </Link>
                    </p>
                  ) : (
                    <InPageSelect
                      aria-label={t('Batch')}
                      value={batch}
                      placeholder={t('Select batch')}
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
                  <label className="field payment-coach-field">
                    <span className="label">
                      {t('Coach')} <span className="req">*</span>
                    </span>
                    <div className="payment-coach-select-wrap">
                      {coachesForBatch.length === 0 ? (
                        <p className="batch-empty">
                          {t(
                            'No active coaches are available for this batch. Activate coaches in Staff List and assign them to this batch.',
                          )}
                        </p>
                      ) : (
                        <InPageSelect
                          aria-label={t('Coach')}
                          value={coach}
                          placeholder={t('Select coach')}
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
                          className={`assignment-count payment-coach-assignment${
                            assignmentOverLimit ? ' assignment-count-over' : ''
                          }`}
                        >
                          {assignmentCountText}
                        </p>
                      ) : null}
                    </div>
                  </label>
                ) : null}
              </div>

              <div
                className={`payment-mode-row${
                  paymentMode === 'Online' ? ' payment-mode-row--online' : ''
                }`}
              >
                <div className="payment-mode-left">
                  <div className="field payment-mode-field">
                    <span className="label">
                      {t('Payment mode')} <span className="req">*</span>
                    </span>
                    <div className="payment-mode-choices" role="radiogroup" aria-label={t('Payment mode')}>
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
                          {t(mode)}
                        </label>
                      ))}
                    </div>
                  </div>

                  {paymentMode === 'Cash' ? (
                    <label className="payment-received-check payment-received-check--cash">
                      <input
                        type="checkbox"
                        checked={paymentReceived}
                        onChange={(e) => setPaymentReceived(e.target.checked)}
                      />
                      <span>{t('Payment Received')}</span>
                    </label>
                  ) : null}

                  {paymentMode === 'Online' ? (
                    <div className="payment-mode-online-followup">
                      {onlineDetailsLoading && !samplePaying ? (
                        <p className="muted payment-mode-online-muted">{t('Loading payment details…')}</p>
                      ) : onlineUpi ? (
                        <>
                          <span className="online-payment-upi-heading">
                            <span className="label">{t('UPI ID')}</span>
                            <span className="online-payment-upi-sep" aria-hidden="true">
                              -
                            </span>
                          </span>
                          <span className="online-payment-upi-value">{onlineUpi}</span>
                          <button
                            type="button"
                            className="csv-btn payment-wa-request-btn"
                            disabled={waRequesting}
                            onClick={() => void onRequestWhatsAppPayment()}
                          >
                            {waRequesting ? t('Sending…') : t('Send payment request')}
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="online-payment-upi-heading">
                            <span className="label">{t('UPI ID')}</span>
                            <span className="online-payment-upi-sep" aria-hidden="true">
                              -
                            </span>
                          </span>
                          <p className="muted payment-mode-online-muted">
                            {t('No UPI ID set in Pool Core Info.')}
                          </p>
                          <button
                            type="button"
                            className="csv-btn payment-wa-request-btn"
                            disabled={waRequesting}
                            onClick={() => void onRequestWhatsAppPayment()}
                          >
                            {waRequesting ? t('Sending…') : t('Send payment request')}
                          </button>
                        </>
                      )}
                    </div>
                  ) : null}

                  {paymentMode === 'Online' ? (
                    <div className="online-payment-details">
                      <label className="field transaction-id-field">
                        <span className="label">
                          {t('Transaction ID')} <span className="req">*</span>
                        </span>
                        <input
                          type="text"
                          value={transactionId}
                          onChange={(e) => setTransactionId(e.target.value)}
                          placeholder={t('Enter UPI / bank transaction ID')}
                          autoComplete="off"
                          disabled={samplePaying}
                        />
                      </label>
                      <label className="payment-received-check">
                        <input
                          type="checkbox"
                          checked={paymentReceived}
                          onChange={(e) => setPaymentReceived(e.target.checked)}
                        />
                        <span>{t('I confirmed amount and upi id of successful payment')}</span>
                      </label>
                    </div>
                  ) : null}
                </div>

                {paymentMode === 'Online' ? (
                  <div className="online-payment-qr-panel">
                    {onlineDetailsLoading && !samplePaying ? null : amountLockedUpiQr ? (
                      <>
                        <QrImage
                          value={amountLockedUpiQr}
                          alt={t('Payment QR code')}
                          className="online-payment-qr"
                          size={220}
                        />
                        <a
                          className="csv-btn qr-pay-app-btn"
                          href={amountLockedUpiQr}
                          onClick={(event) => {
                            event.preventDefault();
                            openUpiPay(amountLockedUpiQr);
                          }}
                        >
                          {t('Pay with UPI app')}
                        </a>
                      </>
                    ) : onlineQrUrl ? (
                      <FilePreview
                        src={onlineQrUrl}
                        alt={t('Payment QR code')}
                        className="online-payment-qr"
                      />
                    ) : (
                      <p className="muted">{t('No payment QR code set in Pool Core Info.')}</p>
                    )}
                  </div>
                ) : null}
              </div>

              {error ? <p className="error">{t(error)}</p> : null}
              {missingFields.length > 0 ? (
                <div className="payment-missing-box" role="alert">
                  <strong>{t('Missing')}:</strong>
                  <ul>
                    {missingFields.map((item) => (
                      <li key={item}>{t(item)}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="pass-form-actions">
                <button
                  type="button"
                  className="pass-cancel"
                  onClick={closePay}
                  disabled={Boolean(issueSuccessMessage)}
                >
                  {t('Cancel')}
                </button>
                <div className="pass-form-actions-end">
                  {issueSuccessMessage ? (
                    <p className="success payment-issue-success" role="status">
                      {t(issueSuccessMessage)}
                    </p>
                  ) : null}
                  <button
                    type="submit"
                    className="submit"
                    disabled={saving || !paymentReceived || Boolean(issueSuccessMessage)}
                  >
                    {saving ? t('Issuing…') : t('Issue Pass')}
                  </button>
                </div>
              </div>
            </form>
          ) : null}
          </section>
        )}

        {error && !paying ? <p className="error">{t(error)}</p> : null}
    </PlatformPage>
  );
}
