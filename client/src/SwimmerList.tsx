import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  isApplicationDemo,
  enqueueSamplePassPayment,
  getSamplePassPaymentQueue,
  resetSampleSwimmerPreview,
} from './applicationDemo';
import { DownloadButton } from './DownloadButton';
import { formatBatchDisplay } from './IdCard';
import { canEditPage } from './pageAccess';
import { PlatformPage } from './PlatformPage';
import { openPassPopup } from './swimmerPass';
import {
  fetchSwimmerProfile,
  SwimmerProfile,
  SwimmerProfileReview,
} from './SwimmerProfileReview';
import { ColumnSortDir, TableColumnFilter } from './TableColumnFilter';
import { tenantPath } from './tenantSession';

type SwimmerStatus = 'active' | 'inactive';

type SortKey = 'swimmer' | 'contact' | 'passType' | 'batch' | 'coach';

type SwimmerRow = {
  id: number;
  swimmer: string;
  contact: string;
  email: string;
  passType: string;
  batch: string;
  coach: string;
  sex: string;
  isActive: boolean;
  hasValidPassToday: boolean;
  passValidUntil: string | null;
  inactiveAt: string | null;
};

type RegistrationApiRow = {
  id: number;
  full_name: string;
  email: string;
  whatsapp_mobile: string;
  sex?: string | null;
  is_active?: boolean;
  pass_type?: string | null;
  batch?: string | null;
  coach?: string | null;
  pass_valid_until?: string | null;
  inactive_at?: string | null;
};

type BatchSlot = {
  id: string;
  name: string;
  type: string;
  startTime: string;
  endTime: string;
};

type EditForm = {
  batch: string;
  isActive: boolean;
};

const SWIMMER_COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: 'swimmer', label: 'Swimmer' },
  { key: 'contact', label: 'Contact' },
  { key: 'passType', label: 'Pass type' },
  { key: 'batch', label: 'Batch' },
  { key: 'coach', label: 'Coach' },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function hasValidPassToday(passValidUntil: string | null | undefined) {
  if (!passValidUntil) return false;
  return passValidUntil.slice(0, 10) >= todayIso();
}

/** Pass expired more than 3 days ago — no pass / QR until reopened for payment. */
function isLongExpired(passValidUntil: string | null | undefined) {
  if (!passValidUntil) return false;
  return passValidUntil.slice(0, 10) < daysAgoIso(3);
}

/** Has a paid pass that still counts (not expired more than 3 days). */
function hasCurrentPass(row: Pick<SwimmerRow, 'passType' | 'passValidUntil'>) {
  return Boolean(row.passType) && row.passType !== '—' && !isLongExpired(row.passValidUntil);
}

/** Active list: marked active and has a current paid pass. */
function belongsOnActiveList(row: Pick<SwimmerRow, 'isActive' | 'passType' | 'passValidUntil'>) {
  return row.isActive && hasCurrentPass(row);
}

/** No current pass — activating sends them to Pass Payment first. */
function needsPassPayment(row: Pick<SwimmerRow, 'passType' | 'passValidUntil'>) {
  return !hasCurrentPass(row);
}

/** Recently sent to Pass Payment (within 3 days). */
function isPaymentWindowOpen(inactiveAt: string | null | undefined) {
  if (!inactiveAt) return false;
  return inactiveAt.slice(0, 10) >= daysAgoIso(3);
}

/** Waiting on Pass Payment — hide from Active/Inactive lists. */
function isAwaitingPassPayment(
  row: Pick<SwimmerRow, 'id' | 'passType' | 'passValidUntil' | 'inactiveAt'>,
  queuedIds: Set<number>,
) {
  if (queuedIds.has(row.id)) return true;
  return needsPassPayment(row) && isPaymentWindowOpen(row.inactiveAt);
}

function hasPaidPass(row: Pick<SwimmerRow, 'passType' | 'passValidUntil'>) {
  return Boolean(row.passValidUntil) || (Boolean(row.passType) && row.passType !== '—');
}

function swimmerCellValue(row: SwimmerRow, key: SortKey) {
  if (key === 'contact') return row.contact || '—';
  if (key === 'passType') {
    if (isLongExpired(row.passValidUntil) || !row.passType || row.passType === '—') return '—';
    return row.passType;
  }
  if (key === 'batch') return row.batch || '—';
  if (key === 'coach') return row.coach || '—';
  return row.swimmer || '—';
}

function formatBatchTime(value: string) {
  return value.slice(0, 5);
}

function batchLabel(slot: BatchSlot) {
  return `${slot.name} — ${slot.type} — ${formatBatchTime(slot.startTime)} to ${formatBatchTime(slot.endTime)}`;
}

function batchesForSwimmerSex(slots: BatchSlot[], sex: string | null | undefined) {
  const normalized = String(sex ?? '').trim();
  if (normalized === 'Female') return slots;
  return slots.filter((slot) => slot.type !== 'Ladies');
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function downloadCsv(rows: SwimmerRow[]) {
  const header = ['Swimmer', 'Contact', 'Email', 'Pass type', 'Batch', 'Coach', 'Status'];
  const lines = [
    header.join(','),
    ...rows.map((row) =>
      [
        row.swimmer,
        row.contact,
        row.email,
        isLongExpired(row.passValidUntil) ? '—' : row.passType,
        row.batch,
        row.coach,
        belongsOnActiveList(row) ? 'Active' : 'Inactive',
      ]
        .map(csvEscape)
        .join(','),
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `swimmer-list-${todayIso()}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function mapRow(row: RegistrationApiRow): SwimmerRow {
  const passValidUntil = row.pass_valid_until?.trim().slice(0, 10) || null;
  const inactiveAt = row.inactive_at?.trim().slice(0, 10) || null;
  return {
    id: row.id,
    swimmer: row.full_name,
    contact: row.whatsapp_mobile || '—',
    email: row.email || '—',
    passType: row.pass_type?.trim() || '—',
    batch: row.batch?.trim() || '—',
    coach: row.coach?.trim() || '—',
    sex: row.sex?.trim() || '',
    isActive: row.is_active !== false,
    hasValidPassToday: hasValidPassToday(passValidUntil),
    passValidUntil,
    inactiveAt,
  };
}

const SAMPLE_SWIMMERS: SwimmerRow[] = [
  {
    id: -101,
    swimmer: 'Aarav Patil',
    contact: '9876543210',
    email: 'aarav@example.com',
    passType: 'Monthly Swim',
    batch: 'Morning A — Mixed — 06:00 to 07:00',
    coach: 'Riya Kulkarni',
    sex: 'Male',
    isActive: true,
    hasValidPassToday: true,
    passValidUntil: daysAgoIso(-25),
    inactiveAt: null,
  },
  {
    id: -102,
    swimmer: 'Sana Joshi',
    contact: '9123456780',
    email: 'sana@example.com',
    passType: 'Quarterly Swim',
    batch: 'Evening B — Mixed — 18:00 to 19:00',
    coach: 'Amit Sharma',
    sex: 'Female',
    isActive: true,
    hasValidPassToday: true,
    passValidUntil: daysAgoIso(-60),
    inactiveAt: null,
  },
  {
    id: -103,
    swimmer: 'Vihaan Kulkarni',
    contact: '9988776655',
    email: 'vihaan@example.com',
    passType: 'Monthly Swim',
    batch: 'Morning A — Mixed — 06:00 to 07:00',
    coach: 'Riya Kulkarni',
    sex: 'Male',
    isActive: true,
    hasValidPassToday: true,
    passValidUntil: daysAgoIso(-15),
    inactiveAt: null,
  },
  {
    id: -104,
    swimmer: 'Neha Deshmukh',
    contact: '9090909090',
    email: 'neha@example.com',
    passType: 'Monthly Swim',
    batch: 'Evening B — Mixed — 18:00 to 19:00',
    coach: 'Amit Sharma',
    sex: 'Female',
    isActive: false,
    hasValidPassToday: false,
    passValidUntil: daysAgoIso(10),
    inactiveAt: daysAgoIso(10),
  },
  {
    id: -105,
    swimmer: 'Rohan Mehta',
    contact: '9012345678',
    email: 'rohan@example.com',
    passType: 'Monthly Swim',
    batch: 'Morning A — Mixed — 06:00 to 07:00',
    coach: 'Riya Kulkarni',
    sex: 'Male',
    isActive: false,
    hasValidPassToday: false,
    passValidUntil: daysAgoIso(18),
    inactiveAt: daysAgoIso(18),
  },
  {
    id: -106,
    swimmer: 'Isha Nair',
    contact: '9090909091',
    email: 'isha@example.com',
    passType: 'Quarterly Swim',
    batch: 'Evening B — Mixed — 18:00 to 19:00',
    coach: 'Amit Sharma',
    sex: 'Female',
    isActive: false,
    hasValidPassToday: false,
    passValidUntil: daysAgoIso(45),
    inactiveAt: daysAgoIso(45),
  },
  {
    id: -107,
    swimmer: 'Kabir Shah',
    contact: '9123456781',
    email: 'kabir@example.com',
    passType: 'Monthly Swim',
    batch: 'Morning A — Mixed — 06:00 to 07:00',
    coach: 'Neha Deshmukh',
    sex: 'Male',
    isActive: false,
    hasValidPassToday: false,
    passValidUntil: daysAgoIso(7),
    inactiveAt: daysAgoIso(7),
  },
];

const SAMPLE_BATCHES: BatchSlot[] = [
  {
    id: 'sample-morning-a',
    name: 'Morning A',
    type: 'Mixed',
    startTime: '06:00',
    endTime: '07:00',
  },
  {
    id: 'sample-evening-b',
    name: 'Evening B',
    type: 'Mixed',
    startTime: '18:00',
    endTime: '19:00',
  },
];

export function SwimmerList() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<SwimmerStatus>('active');
  const [rows, setRows] = useState<SwimmerRow[]>([]);
  const [batches, setBatches] = useState<BatchSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [openFilter, setOpenFilter] = useState<SortKey | null>(null);
  const [columnSelected, setColumnSelected] = useState<
    Partial<Record<SortKey, Set<string> | null>>
  >({});
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<ColumnSortDir>(null);
  const [editing, setEditing] = useState<SwimmerRow | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ batch: '', isActive: true });
  const [viewing, setViewing] = useState<SwimmerRow | null>(null);
  const [viewProfile, setViewProfile] = useState<SwimmerProfile | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [resendingId, setResendingId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [success, setSuccess] = useState('');
  const [sampleMode, setSampleMode] = useState(false);
  const canEdit = canEditPage('swimmers') && !sampleMode;
  const canToggleActive = sampleMode || canEditPage('swimmers');

  async function toggleActive(row: SwimmerRow, nextActive: boolean) {
    if (!canToggleActive || togglingId === row.id) return;
    const sendToPassPayment = nextActive && needsPassPayment(row);
    const onActiveList = belongsOnActiveList(row);
    if (!sendToPassPayment && onActiveList === nextActive) return;
    // Already active with a pass — ignore "activate" again
    if (nextActive && onActiveList) return;
    // Deactivate only from active list
    if (!nextActive && !onActiveList && !row.isActive) return;

    setError('');
    setSuccess('');

    function enqueueForPayment() {
      const batch = formatBatchDisplay(row.batch);
      enqueueSamplePassPayment({
        id: row.id,
        fullName: row.swimmer,
        contact: row.contact === '—' ? '' : row.contact,
        email: row.email === '—' ? '' : row.email,
        passType: row.passType === '—' ? '' : row.passType,
        coach: row.coach === '—' ? 'Any' : row.coach,
        batch: batch.title === '—' ? '' : batch.title,
      });
    }

    if (sampleMode || row.id < 0) {
      if (sendToPassPayment) {
        enqueueForPayment();
        setRows((prev) => prev.filter((item) => item.id !== row.id));
        setSuccess(`${row.swimmer} added to Pass Payment.`);
        return;
      }
      setRows((prev) =>
        prev.map((item) =>
          item.id === row.id
            ? {
                ...item,
                isActive: nextActive,
                inactiveAt: nextActive ? null : todayIso(),
              }
            : item,
        ),
      );
      return;
    }

    setTogglingId(row.id);
    const previous = { isActive: row.isActive, inactiveAt: row.inactiveAt };

    if (sendToPassPayment) {
      setRows((prev) => prev.filter((item) => item.id !== row.id));
      try {
        const res = await fetch(`/api/registrations/${row.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: false }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? 'Failed to activate for payment');
        setSuccess(`${row.swimmer} added to Pass Payment.`);
      } catch (err) {
        setRows((prev) => [...prev, { ...row, isActive: previous.isActive, inactiveAt: previous.inactiveAt }]);
        setError(err instanceof Error ? err.message : 'Failed to activate for payment');
      } finally {
        setTogglingId(null);
      }
      return;
    }

    setRows((prev) =>
      prev.map((item) =>
        item.id === row.id
          ? {
              ...item,
              isActive: nextActive,
              inactiveAt: nextActive ? null : todayIso(),
            }
          : item,
      ),
    );
    try {
      const res = await fetch(`/api/registrations/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: nextActive }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to update status');
    } catch (err) {
      setRows((prev) =>
        prev.map((item) =>
          item.id === row.id
            ? { ...item, isActive: previous.isActive, inactiveAt: previous.inactiveAt }
            : item,
        ),
      );
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setTogglingId(null);
    }
  }

  async function resendPass(row: SwimmerRow) {
    if (sampleMode || row.id < 0) return;
    if (!row.passType || row.passType === '—') {
      setError('This swimmer does not have a pass to resend');
      setSuccess('');
      return;
    }
    setResendingId(row.id);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/registrations/${row.id}/resend-pass`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to resend pass on WhatsApp');
      setSuccess(`Pass and QR resent on WhatsApp to ${row.swimmer} (${row.contact}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend pass on WhatsApp');
    } finally {
      setResendingId(null);
    }
  }

  function openProfileEdit(row: SwimmerRow) {
    if (sampleMode || row.id < 0) return;
    if (!canEditPage('swimmers')) {
      setError('You do not have permission to edit swimmers');
      return;
    }
    navigate(tenantPath(`/register/${row.id}`), {
      state: { returnTo: tenantPath('/swimmers') },
    });
  }

  async function load() {
    setLoading(true);
    setError('');
    try {
      if (isApplicationDemo()) {
        // Each visit shows the full sample lists again (ephemeral Application preview).
        resetSampleSwimmerPreview();
        setRows(SAMPLE_SWIMMERS.map((row) => ({ ...row })));
        setBatches(SAMPLE_BATCHES);
        setSampleMode(true);
        setSuccess('');
        return;
      }
      const [swimmerRes, batchesRes] = await Promise.all([
        fetch('/api/registrations'),
        fetch('/api/batches'),
      ]);
      if (!swimmerRes.ok) throw new Error('Failed to load swimmers');
      const data = (await swimmerRes.json()) as RegistrationApiRow[];
      setRows(data.map(mapRow));
      setSampleMode(false);

      if (batchesRes.ok) {
        const batchesData = (await batchesRes.json()) as { slots?: BatchSlot[] };
        const slots = [...(batchesData.slots ?? [])].sort((a, b) => {
          const startDiff = String(a.startTime ?? '').localeCompare(String(b.startTime ?? ''));
          if (startDiff !== 0) return startDiff;
          return String(a.name ?? '').localeCompare(String(b.name ?? ''), undefined, {
            numeric: true,
            sensitivity: 'base',
          });
        });
        setBatches(slots);
      } else {
        setBatches([]);
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

  useEffect(() => {
    setOpenFilter(null);
    setColumnSelected({});
    setSortKey(null);
    setSortDir(null);
  }, [status]);

  const statusRows = useMemo(() => {
    const queuedIds = new Set(
      sampleMode ? getSamplePassPaymentQueue().map((row) => row.id) : [],
    );
    const visible = rows.filter((row) => !isAwaitingPassPayment(row, queuedIds));
    if (status === 'active') return visible.filter((row) => belongsOnActiveList(row));
    return visible.filter((row) => !belongsOnActiveList(row));
  }, [rows, status, sampleMode]);

  const visibleRows = useMemo(() => {
    const filtered = statusRows.filter((row) =>
      SWIMMER_COLUMNS.every(({ key }) => {
        const selected = columnSelected[key];
        if (!selected) return true;
        return selected.has(swimmerCellValue(row, key));
      }),
    );

    if (!sortKey || !sortDir) return filtered;
    return [...filtered].sort((a, b) => {
      const cmp = swimmerCellValue(a, sortKey).localeCompare(
        swimmerCellValue(b, sortKey),
        undefined,
        { numeric: true, sensitivity: 'base' },
      );
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [statusRows, columnSelected, sortKey, sortDir]);

  const summary =
    status === 'active'
      ? `${visibleRows.length} active swimmer${visibleRows.length === 1 ? '' : 's'}`
      : `${visibleRows.length} inactive swimmer${visibleRows.length === 1 ? '' : 's'}`;

  function sampleProfileFor(row: SwimmerRow): SwimmerProfile {
    return {
      id: row.id,
      fullName: row.swimmer,
      fullAddress: '12 Sample Lane, Pune',
      whatsappMobile: row.contact === '—' ? '' : row.contact,
      otherMobile: '',
      email: row.email === '—' ? '' : row.email,
      birthdate: '2005-06-15',
      sex: row.sex || '—',
      bloodGroup: 'B+',
      emergencyName: 'Parent / Guardian',
      emergencyRelation: 'Parent',
      emergencyMobile: row.contact === '—' ? '' : row.contact,
      parentName: 'Parent / Guardian',
      parentRelation: 'Parent',
      parentMobile: row.contact === '—' ? '' : row.contact,
      hasHealthIssue: 'No',
      healthIssueDetails: '',
      doctorName: '',
      doctorNo: '',
      identityDocument: 'Aadhaar',
      identityPhotoUrl: null,
      photoUrl: null,
    };
  }

  function openView(row: SwimmerRow) {
    setViewing(row);
    setEditing(null);
    setViewProfile(null);
    setViewLoading(true);
    setError('');
    if (sampleMode || row.id < 0) {
      setViewProfile(sampleProfileFor(row));
      setViewLoading(false);
      return;
    }
    void fetchSwimmerProfile(row.id)
      .then((profile) => setViewProfile(profile))
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Failed to load swimmer details'),
      )
      .finally(() => setViewLoading(false));
  }

  function closeView() {
    setViewing(null);
    setViewProfile(null);
    setViewLoading(false);
  }

  function openEdit(row: SwimmerRow) {
    if (sampleMode || row.id < 0) return;
    if (!canEditPage('swimmers')) {
      setError('You do not have permission to edit swimmers');
      return;
    }
    setViewing(null);
    setViewProfile(null);
    setViewLoading(false);
    setEditing(row);
    setEditForm({
      batch: row.batch === '—' ? '' : row.batch,
      isActive: row.isActive,
    });
    setError('');
  }

  function closeEdit() {
    setEditing(null);
    setEditForm({ batch: '', isActive: true });
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing || sampleMode || editing.id < 0) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/registrations/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batch: editForm.batch,
          isActive: editForm.isActive,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to update swimmer');
      closeEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PlatformPage
      title="Swimmer's List"
      actions={
        !editing && !viewing ? (
          <DownloadButton
            onClick={() => downloadCsv(visibleRows)}
            disabled={visibleRows.length === 0}
          />
        ) : undefined
      }
    >
      <div className="swimmer-list-card">
        {viewing ? (
          <section
            className={`pass-form-card pool-core-form swimmer-edit-card${sampleMode ? ' pass-form-card--sample' : ''}`}
            aria-labelledby="swimmer-view-title"
          >
            {sampleMode ? (
              <div className="user-mgmt-sample-watermark" aria-hidden="true">
                Sample
              </div>
            ) : null}
            <div className="swimmer-edit-head">
              <div>
                <h2 id="swimmer-view-title">Swimmer details</h2>
                <p className="pass-count">{viewing.swimmer}</p>
              </div>
              <div className="pass-actions">
                {canEdit ? (
                  <button
                    type="button"
                    className="submit"
                    onClick={() => openProfileEdit(viewing)}
                  >
                    Edit
                  </button>
                ) : null}
                <button type="button" className="csv-btn" onClick={closeView}>
                  Back to list
                </button>
              </div>
            </div>

            {error ? <p className="error">{error}</p> : null}

            <SwimmerProfileReview
              profile={viewProfile}
              loading={viewLoading}
              title="Complete registration form"
              hint={
                canEdit
                  ? 'Full swimmer registration details. Use Edit to update the registration form.'
                  : 'Full swimmer registration details (view only).'
              }
            />
          </section>
        ) : !editing ? (
          <>
            <div className="swimmer-list-toolbar">
              <div className="staff-role-radios" role="radiogroup" aria-label="Swimmer status">
                <label className={`staff-role-option ${status === 'active' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="swimmerStatus"
                    checked={status === 'active'}
                    onChange={() => setStatus('active')}
                  />
                  <span>Active Swimmer</span>
                </label>
                <label className={`staff-role-option ${status === 'inactive' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="swimmerStatus"
                    checked={status === 'inactive'}
                    onChange={() => setStatus('inactive')}
                  />
                  <span>Inactive Swimmer</span>
                </label>
              </div>
            </div>

            {!sampleMode && summary ? (
              <p className="pass-count batch-list-lede swimmer-list-summary">{summary}</p>
            ) : null}
            {success ? <p className="success">{success}</p> : null}

            <section
              className={`pass-form-card pool-core-form pass-table-card swimmer-table-card${sampleMode ? ' pass-form-card--sample' : ''}`}
            >
              {sampleMode ? (
                <div className="user-mgmt-sample-watermark" aria-hidden="true">
                  Sample
                </div>
              ) : null}
              <div className="swimmer-table-head">
                {SWIMMER_COLUMNS.map(({ key, label }) => (
                  <div key={key} className="swimmer-col-head">
                    <TableColumnFilter
                      label={label}
                      values={statusRows.map((row) => swimmerCellValue(row, key))}
                      selected={columnSelected[key] ?? null}
                      sortDir={sortKey === key ? sortDir : null}
                      open={openFilter === key}
                      onToggleOpen={() => setOpenFilter((prev) => (prev === key ? null : key))}
                      onClose={() => setOpenFilter(null)}
                      onSelectedChange={(next) =>
                        setColumnSelected((prev) => ({ ...prev, [key]: next }))
                      }
                      onSort={(dir) => {
                        setSortKey(dir ? key : null);
                        setSortDir(dir);
                      }}
                    />
                  </div>
                ))}
                <span>Actions</span>
              </div>

              {loading ? (
                <p className="pass-empty">Loading…</p>
              ) : statusRows.length === 0 ? (
                <p className="pass-empty swimmer-empty">
                  {status === 'active'
                    ? 'No active swimmers found.'
                    : 'No inactive swimmers found.'}
                </p>
              ) : visibleRows.length === 0 ? (
                <p className="pass-empty swimmer-empty">No swimmers match these filters.</p>
              ) : (
                <div className="pass-table-body">
                  {visibleRows.map((row, index) => {
                    const longExpired = isLongExpired(row.passValidUntil);
                    const onActiveList = belongsOnActiveList(row);
                    const awaitPayment = needsPassPayment(row);
                    const displayPassType = longExpired || !row.passType || row.passType === '—'
                      ? '—'
                      : row.passType;
                    const showPassActions = hasCurrentPass(row);
                    const showToggle = canToggleActive;
                    return (
                    <div
                      className={`swimmer-row${index % 2 === 1 ? ' swimmer-row-alt' : ''}`}
                      key={row.id}
                    >
                      <strong data-label="Swimmer">{row.swimmer}</strong>
                      <span data-label="Contact">
                        <span className="coach-contact">{row.contact}</span>
                        {row.email !== '—' ? (
                          <span className="coach-email">{row.email}</span>
                        ) : null}
                      </span>
                      <span data-label="Pass type">{displayPassType}</span>
                      <span data-label="Batch">
                        {(() => {
                          const batch = formatBatchDisplay(row.batch);
                          return (
                            <>
                              <span className="swimmer-batch-title">{batch.title}</span>
                              {batch.time ? (
                                <span className="swimmer-batch-time">{batch.time}</span>
                              ) : null}
                            </>
                          );
                        })()}
                      </span>
                      <span data-label="Coach">{row.coach}</span>
                      <span className="pass-actions" data-label="Actions -">
                        <button
                          type="button"
                          className="icon-action"
                          onClick={() => openView(row)}
                          aria-label={`View ${row.swimmer}`}
                          title="View"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            aria-hidden
                          >
                            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </button>
                        {showToggle ? (
                          <label
                            className={`status-switch swimmer-active-switch${
                              onActiveList
                                ? ' is-active'
                                : hasPaidPass(row)
                                  ? ' is-paid-inactive'
                                  : ' is-inactive'
                            }`}
                            title={
                              awaitPayment
                                ? 'Activate to collect pass payment'
                                : onActiveList
                                  ? 'Deactivate this swimmer'
                                  : 'Activate this swimmer'
                            }
                          >
                            <input
                              type="checkbox"
                              checked={onActiveList}
                              disabled={togglingId === row.id}
                              onChange={(e) => void toggleActive(row, e.target.checked)}
                              aria-label={
                                awaitPayment
                                  ? `Activate ${row.swimmer} for pass payment`
                                  : onActiveList
                                    ? `Deactivate ${row.swimmer}`
                                    : `Activate ${row.swimmer}`
                              }
                            />
                          </label>
                        ) : null}
                        {showPassActions ? (
                          <>
                            <button
                              type="button"
                              className="terms-link"
                              onClick={() => openPassPopup('qr', row.id)}
                            >
                              Pass QR
                            </button>
                            <button
                              type="button"
                              className="terms-link"
                              onClick={() => openPassPopup('pass', row.id)}
                            >
                              Pass
                            </button>
                            {!sampleMode ? (
                              <button
                                type="button"
                                className="terms-link"
                                onClick={() => void resendPass(row)}
                                disabled={resendingId === row.id}
                                title="Resend pass & QR on WhatsApp"
                              >
                                {resendingId === row.id ? 'Sending…' : 'Resend'}
                              </button>
                            ) : null}
                          </>
                        ) : null}
                        {canEdit ? (
                          <button
                            type="button"
                            className="icon-action"
                            onClick={() => openEdit(row)}
                            aria-label={`Edit ${row.swimmer}`}
                            title="Edit"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              aria-hidden
                            >
                              <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
                              <path d="M13.5 6.5l3 3" />
                            </svg>
                          </button>
                        ) : null}
                      </span>
                    </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        ) : (
          <section className="pass-form-card pool-core-form swimmer-edit-card" aria-labelledby="swimmer-edit-title">
            <div className="swimmer-edit-head">
              <div>
                <h2 id="swimmer-edit-title">Edit swimmer</h2>
                <p className="pass-count">{editing.swimmer}</p>
              </div>
              <button type="button" className="csv-btn" onClick={closeEdit}>
                Back to list
              </button>
            </div>

            <form className="swimmer-edit-form" onSubmit={onSaveEdit}>
              <label className="field">
                <span className="label">Batch details</span>
                {batchesForSwimmerSex(batches, editing.sex).length === 0 ? (
                  <p className="batch-empty">
                    No batches available.{' '}
                    <Link className="terms-link" to={tenantPath('/batches')}>
                      Set up batches
                    </Link>
                  </p>
                ) : (
                  <select
                    value={editForm.batch}
                    onChange={(e) => setEditForm({ ...editForm, batch: e.target.value })}
                  >
                    <option value="">Select batch</option>
                    {batchesForSwimmerSex(batches, editing.sex).map((slot) => {
                      const label = batchLabel(slot);
                      return (
                        <option key={slot.id} value={label}>
                          {label}
                        </option>
                      );
                    })}
                    {editForm.batch &&
                    !batchesForSwimmerSex(batches, editing.sex).some(
                      (slot) => batchLabel(slot) === editForm.batch,
                    ) &&
                    !(
                      /—\s*Ladies\s*—/i.test(editForm.batch) &&
                      editing.sex !== 'Female'
                    ) ? (
                      <option value={editForm.batch}>{editForm.batch}</option>
                    ) : null}
                  </select>
                )}
              </label>

              <fieldset className="swimmer-status-fieldset">
                <legend className="label">Status</legend>
                <div className="staff-role-radios" role="radiogroup" aria-label="Active status">
                  <label
                    className={`staff-role-option ${editForm.isActive ? 'selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="editSwimmerActive"
                      checked={editForm.isActive}
                      onChange={() => setEditForm({ ...editForm, isActive: true })}
                    />
                    <span>Active</span>
                  </label>
                  <label
                    className={`staff-role-option ${!editForm.isActive ? 'selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="editSwimmerActive"
                      checked={!editForm.isActive}
                      onChange={() => setEditForm({ ...editForm, isActive: false })}
                    />
                    <span>Inactive</span>
                  </label>
                </div>
              </fieldset>

              {error ? <p className="error">{error}</p> : null}

              <div className="pass-form-actions">
                <button type="button" className="pass-cancel" onClick={closeEdit}>
                  Cancel
                </button>
                <button type="submit" className="submit" disabled={saving}>
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </section>
        )}

        {error && !editing && !viewing ? <p className="error">{error}</p> : null}
      </div>
    </PlatformPage>
  );
}
