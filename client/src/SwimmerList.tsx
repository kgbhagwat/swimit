import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useT } from './i18n';
import { Link, useNavigate } from 'react-router-dom';
import {
  isApplicationDemo,
  enqueueSamplePassPayment,
  getSamplePassPaymentQueue,
  resetSampleSwimmerPreview,
} from './applicationDemo';
import { DownloadButton } from './DownloadButton';
import { csvPlain, saveCsvFile } from './csvDownload';
import { formatBatchDisplay } from './IdCard';
import { downloadSelectedPassQrPdf } from './printPassQrPdf';
import { InPageSelect } from './InPageSelect';
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
import { indiaDaysAgoIso, indiaTodayIso } from './indiaDate';

type SwimmerStatus = 'active' | 'inactive';

type SortKey = 'swimmer' | 'contact' | 'status' | 'passType' | 'batch' | 'coach';
type PassStatusLabel = 'Pass expired' | 'On hold' | 'Pass' | 'Fail' | '—';

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
  testResult: 'pass' | 'fail' | null;
  testRequired: boolean;
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
  test_result?: string | null;
  test_required?: boolean;
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
  { key: 'status', label: 'Status' },
  { key: 'passType', label: 'Pass type' },
  { key: 'batch', label: 'Batch' },
  { key: 'coach', label: 'Coach' },
];

function todayIso() {
  return indiaTodayIso();
}

function daysAgoIso(days: number) {
  return indiaDaysAgoIso(days);
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

/** Active list: marked active and pass is still valid on today's India date. */
function belongsOnActiveList(row: Pick<SwimmerRow, 'isActive' | 'passType' | 'passValidUntil'>) {
  return row.isActive && hasValidPassToday(row.passValidUntil);
}

/** No valid pass today — activating sends them to Pass Payment first. */
function needsPassPayment(row: Pick<SwimmerRow, 'passType' | 'passValidUntil'>) {
  return !hasValidPassToday(row.passValidUntil);
}

/** Recently sent to Pass Payment (within 3 days). */
function isPaymentWindowOpen(inactiveAt: string | null | undefined) {
  if (!inactiveAt) return false;
  return inactiveAt.slice(0, 10) >= daysAgoIso(3);
}

/** Pass expired and still inside the 3-day renew window. */
function isInExpiryPaymentWindow(passValidUntil: string | null | undefined) {
  if (!passValidUntil) return false;
  const until = passValidUntil.slice(0, 10);
  return until < todayIso() && until >= daysAgoIso(3);
}

/** Waiting on Pass Payment — hide from Active/Inactive lists. */
function isAwaitingPassPayment(
  row: Pick<SwimmerRow, 'id' | 'passType' | 'passValidUntil' | 'inactiveAt'>,
  queuedIds: Set<number>,
) {
  if (queuedIds.has(row.id)) return true;
  if (!row.passValidUntil) return true;
  if (isInExpiryPaymentWindow(row.passValidUntil)) return true;
  return needsPassPayment(row) && isPaymentWindowOpen(row.inactiveAt);
}

function swimmerStatusLabel(
  row: Pick<SwimmerRow, 'isActive' | 'passValidUntil' | 'testResult' | 'testRequired'>,
): PassStatusLabel {
  if (row.testResult === 'fail') return 'Fail';
  const passValid = hasValidPassToday(row.passValidUntil);
  const isTestPass = row.testResult === 'pass' || row.testRequired;
  if (isTestPass && passValid && row.isActive) return 'Pass';
  if (!row.isActive && passValid) return 'On hold';
  if (row.passValidUntil && row.passValidUntil.slice(0, 10) < todayIso()) return 'Pass expired';
  return '—';
}

function swimmerStatusClass(label: PassStatusLabel) {
  if (label === 'Pass expired') return 'is-expired';
  if (label === 'On hold') return 'is-hold';
  if (label === 'Pass') return 'is-pass';
  if (label === 'Fail') return 'is-fail';
  return '';
}

function swimmerCellValue(row: SwimmerRow, key: SortKey) {
  if (key === 'contact') return row.contact || '—';
  if (key === 'status') return swimmerStatusLabel(row);
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

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M7 7l1 13h8l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function downloadCsv(rows: SwimmerRow[], includeStatus: boolean) {
  const header = includeStatus
    ? ['Swimmer', 'Contact', 'Status', 'Email', 'Pass type', 'Batch', 'Coach']
    : ['Swimmer', 'Contact', 'Email', 'Pass type', 'Batch', 'Coach'];
  const lines = [
    header.join(','),
    ...rows.map((row) =>
      [
        row.swimmer,
        row.contact,
        ...(includeStatus ? [swimmerStatusLabel(row)] : []),
        row.email,
        isLongExpired(row.passValidUntil) ? '—' : row.passType,
        row.batch,
        row.coach,
      ]
        .map((cell) => csvEscape(csvPlain(cell)))
        .join(','),
    ),
  ];
  saveCsvFile(`swimmer-list-${todayIso()}.csv`, lines.join('\n'));
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
    testResult: row.test_result === 'fail' ? 'fail' : row.test_result === 'pass' ? 'pass' : null,
    testRequired: row.test_required === true,
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
    testResult: 'pass',
    testRequired: true,
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
    testResult: null,
    testRequired: false,
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
    testResult: null,
    testRequired: false,
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
    hasValidPassToday: true,
    passValidUntil: daysAgoIso(-10),
    inactiveAt: todayIso(),
    testResult: null,
    testRequired: false,
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
    testResult: null,
    testRequired: false,
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
    testResult: null,
    testRequired: false,
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
    passValidUntil: daysAgoIso(1),
    inactiveAt: daysAgoIso(1),
    testResult: 'fail',
    testRequired: true,
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
  const t = useT();
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
  const editBatchOptions = useMemo(() => {
    if (!editing) return [];
    const available = batchesForSwimmerSex(batches, editing.sex);
    const options = available.map((slot) => {
      const label = batchLabel(slot);
      return { value: label, label };
    });
    const keepCurrent =
      Boolean(editForm.batch) &&
      !available.some((slot) => batchLabel(slot) === editForm.batch) &&
      !(/—\s*Ladies\s*—/i.test(editForm.batch) && editing.sex !== 'Female');
    if (keepCurrent) {
      options.push({ value: editForm.batch, label: editForm.batch });
    }
    return options;
  }, [editing, batches, editForm.batch]);
  const [viewing, setViewing] = useState<SwimmerRow | null>(null);
  const [viewProfile, setViewProfile] = useState<SwimmerProfile | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [resendingId, setResendingId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [success, setSuccess] = useState('');
  const [sampleMode, setSampleMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [printing, setPrinting] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);
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
      const swimmerBody = (await swimmerRes.json().catch(() => ({}))) as {
        error?: string;
        detail?: string;
      } & RegistrationApiRow[];
      if (!swimmerRes.ok) {
        const detail = typeof swimmerBody.detail === 'string' ? swimmerBody.detail.trim() : '';
        throw new Error(
          detail
            ? `${swimmerBody.error ?? 'Failed to load swimmers'}: ${detail}`
            : swimmerBody.error ?? 'Failed to load swimmers',
        );
      }
      const data = swimmerBody as RegistrationApiRow[];
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
    setSelectedIds(new Set());
  }, [status]);

  const statusRows = useMemo(() => {
    const queuedIds = new Set(
      sampleMode ? getSamplePassPaymentQueue().map((row) => row.id) : [],
    );
    const visible = rows.filter((row) => !isAwaitingPassPayment(row, queuedIds));
    if (status === 'active') return visible.filter((row) => belongsOnActiveList(row));
    return visible.filter((row) => !belongsOnActiveList(row));
  }, [rows, status, sampleMode]);

  const showStatusCol = status === 'inactive';
  const visibleColumns = useMemo(
    () =>
      showStatusCol ? SWIMMER_COLUMNS : SWIMMER_COLUMNS.filter((col) => col.key !== 'status'),
    [showStatusCol],
  );

  const visibleRows = useMemo(() => {
    const filtered = statusRows.filter((row) =>
      visibleColumns.every(({ key }) => {
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
  }, [statusRows, visibleColumns, columnSelected, sortKey, sortDir]);

  const printableRows = useMemo(
    () => visibleRows.filter((row) => hasCurrentPass(row)),
    [visibleRows],
  );
  const selectableRows = useMemo(
    () => (status === 'inactive' ? visibleRows : printableRows),
    [status, visibleRows, printableRows],
  );
  const selectedPrintable = useMemo(
    () => printableRows.filter((row) => selectedIds.has(row.id)),
    [printableRows, selectedIds],
  );
  const selectedSelectable = useMemo(
    () => selectableRows.filter((row) => selectedIds.has(row.id)),
    [selectableRows, selectedIds],
  );
  const allSelectableSelected =
    selectableRows.length > 0 && selectedSelectable.length === selectableRows.length;
  const someSelectableSelected = selectedSelectable.length > 0 && !allSelectableSelected;

  function toggleSelected(id: number, on: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleSelectAll(on: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const row of selectableRows) {
        if (on) next.add(row.id);
        else next.delete(row.id);
      }
      return next;
    });
  }

  function removeRowsFromState(ids: number[]) {
    const idSet = new Set(ids);
    setRows((prev) => prev.filter((item) => !idSet.has(item.id)));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }

  async function printSelectedPasses() {
    if (printing) return;
    if (selectedPrintable.length === 0) {
      setError('Select swimmers with a pass to print.');
      return;
    }
    setPrinting(true);
    setError('');
    setSuccess('');
    try {
      await downloadSelectedPassQrPdf(
        selectedPrintable.map((row) => ({ id: row.id, name: row.swimmer })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create PDF');
    } finally {
      setPrinting(false);
    }
  }

  const summary =
    status === 'active'
      ? `${visibleRows.length} ${visibleRows.length === 1 ? t('active swimmer') : t('active swimmers')}`
      : `${visibleRows.length} ${visibleRows.length === 1 ? t('inactive swimmer') : t('inactive swimmers')}`;

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

  async function deleteSwimmer(row: SwimmerRow) {
    if (!canToggleActive || deletingId === row.id || deletingSelected) return;
    if (
      !window.confirm(
        `${t('Warning: Deleted swimmer records cannot be recovered.')}\n\n${t('Delete this swimmer?')}\n${row.swimmer}`,
      )
    ) {
      return;
    }
    setError('');
    setSuccess('');
    if (sampleMode || row.id < 0) {
      removeRowsFromState([row.id]);
      return;
    }
    setDeletingId(row.id);
    try {
      const res = await fetch(`/api/registrations/${row.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to delete swimmer');
      }
      removeRowsFromState([row.id]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete swimmer');
    } finally {
      setDeletingId(null);
    }
  }

  async function deleteSelectedSwimmers() {
    if (!canToggleActive || deletingSelected || printing) return;
    const targets = selectedSelectable;
    if (targets.length === 0) {
      setError(t('Select swimmers to delete.'));
      return;
    }
    const confirmMsg =
      targets.length === 1
        ? `${t('Warning: Deleted swimmer records cannot be recovered.')}\n\n${t('Delete this swimmer?')}\n${targets[0].swimmer}`
        : `${t('Warning: Deleted swimmer records cannot be recovered.')}\n\n${t('Delete selected swimmers?')}\n${targets.map((row) => row.swimmer).join('\n')}`;
    if (!window.confirm(confirmMsg)) return;
    setError('');
    setSuccess('');
    const sampleTargets = targets.filter((row) => sampleMode || row.id < 0);
    const apiTargets = targets.filter((row) => !sampleMode && row.id >= 0);
    if (sampleTargets.length) {
      removeRowsFromState(sampleTargets.map((row) => row.id));
    }
    if (apiTargets.length === 0) {
      setSuccess(t('Selected swimmers deleted.'));
      return;
    }
    setDeletingSelected(true);
    const deletedIds: number[] = [];
    const failed: string[] = [];
    try {
      for (const row of apiTargets) {
        try {
          const res = await fetch(`/api/registrations/${row.id}`, { method: 'DELETE' });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error ?? 'Failed to delete swimmer');
          }
          deletedIds.push(row.id);
        } catch (err) {
          failed.push(
            `${row.swimmer}: ${err instanceof Error ? err.message : 'Failed to delete swimmer'}`,
          );
        }
      }
      if (deletedIds.length) removeRowsFromState(deletedIds);
      if (failed.length) {
        setError(failed.join('\n'));
      } else {
        setSuccess(t('Selected swimmers deleted.'));
      }
    } finally {
      setDeletingSelected(false);
    }
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
          <div className="list-head-actions">
            {status === 'inactive' ? (
              canToggleActive ? (
                <button
                  type="button"
                  className="csv-btn delete-selected-btn"
                  onClick={() => void deleteSelectedSwimmers()}
                  disabled={deletingSelected || selectedSelectable.length === 0}
                  title={
                    selectedSelectable.length === 0
                      ? t('Select swimmers to delete.')
                      : t('Delete selected swimmers')
                  }
                >
                  <DeleteIcon />
                  <span>
                    {deletingSelected
                      ? t('Deleting…')
                      : selectedSelectable.length
                        ? `${t('Delete')} (${selectedSelectable.length})`
                        : t('Delete')}
                  </span>
                </button>
              ) : null
            ) : (
              <button
                type="button"
                className="csv-btn print-pass-qr-btn"
                onClick={() => void printSelectedPasses()}
                disabled={printing || selectedPrintable.length === 0}
                title={
                  selectedPrintable.length === 0
                    ? t('Select swimmers with a pass to print.')
                    : t('Print pass')
                }
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M6 9V3h12v6" />
                  <path d="M6 15H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
                  <path d="M6 13h12v8H6z" />
                </svg>
                <span>
                  {printing
                    ? t('Preparing PDF…')
                    : selectedPrintable.length
                      ? `${t('Print pass')} (${selectedPrintable.length})`
                      : t('Print pass')}
                </span>
              </button>
            )}
            <DownloadButton
              onClick={() => downloadCsv(visibleRows, showStatusCol)}
              disabled={visibleRows.length === 0}
            />
          </div>
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
                {t('Sample')}
              </div>
            ) : null}
            <div className="swimmer-edit-head">
              <div>
                <h2 id="swimmer-view-title">{t('Swimmer details')}</h2>
                <p className="pass-count">{viewing.swimmer}</p>
              </div>
              <div className="pass-actions">
                {canEdit ? (
                  <button
                    type="button"
                    className="submit"
                    onClick={() => openProfileEdit(viewing)}
                  >
                    {t('Edit')}
                  </button>
                ) : null}
                <button type="button" className="csv-btn" onClick={closeView}>
                  {t('Back to list')}
                </button>
              </div>
            </div>

            {error ? <p className="error">{t(error)}</p> : null}

            <SwimmerProfileReview
              profile={viewProfile}
              loading={viewLoading}
              title={t('Complete registration form')}
              hint={
                canEdit
                  ? t('Full swimmer registration details. Use Edit to update the registration form.')
                  : t('Full swimmer registration details (view only).')
              }
            />
          </section>
        ) : !editing ? (
          <>
            <div className="swimmer-list-toolbar">
              <div className="staff-role-radios" role="radiogroup" aria-label={t('Swimmer status')}>
                <label className={`staff-role-option ${status === 'active' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="swimmerStatus"
                    checked={status === 'active'}
                    onChange={() => setStatus('active')}
                  />
                  <span>{t('Active Swimmer')}</span>
                </label>
                <label className={`staff-role-option ${status === 'inactive' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="swimmerStatus"
                    checked={status === 'inactive'}
                    onChange={() => setStatus('inactive')}
                  />
                  <span>{t('Inactive Swimmer')}</span>
                </label>
              </div>
            </div>

            {!sampleMode && summary ? (
              <p className="pass-count batch-list-lede swimmer-list-summary">{summary}</p>
            ) : null}
            {success ? <p className="success">{t(success)}</p> : null}
            {error ? <p className="error">{t(error)}</p> : null}

            <section
              className={`pass-form-card pool-core-form pass-table-card swimmer-table-card${
                sampleMode ? ' pass-form-card--sample' : ''
              }${showStatusCol ? ' has-status-col' : ''}`}
            >
              {sampleMode ? (
                <div className="user-mgmt-sample-watermark" aria-hidden="true">
                  {t('Sample')}
                </div>
              ) : null}
              <div className="swimmer-table-head">
                <label className="swimmer-select-cell" title={t('Select all')}>
                  <input
                    type="checkbox"
                    checked={allSelectableSelected}
                    ref={(node) => {
                      if (node) node.indeterminate = someSelectableSelected;
                    }}
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                    disabled={selectableRows.length === 0}
                    aria-label={t('Select all')}
                  />
                </label>
                {visibleColumns.map(({ key, label }) => (
                  <div key={key} className="swimmer-col-head">
                    <TableColumnFilter
                      label={t(label)}
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
                <span>{t('Actions')}</span>
              </div>

              {loading ? (
                <p className="pass-empty">{t('Loading…')}</p>
              ) : statusRows.length === 0 ? (
                <p className="pass-empty swimmer-empty">
                  {status === 'active'
                    ? t('No active swimmers found.')
                    : t('No inactive swimmers found.')}
                </p>
              ) : visibleRows.length === 0 ? (
                <p className="pass-empty swimmer-empty">{t('No swimmers match these filters.')}</p>
              ) : (
                <div className="pass-table-body">
                  {visibleRows.map((row, index) => {
                    const longExpired = isLongExpired(row.passValidUntil);
                    const onActiveList = belongsOnActiveList(row);
                    const awaitPayment = needsPassPayment(row);
                    const displayPassType = longExpired || !row.passType || row.passType === '—'
                      ? '—'
                      : row.passType;
                    const showPassActions = hasValidPassToday(row.passValidUntil);
                    const showToggle = canToggleActive;
                    return (
                    <div
                      className={`swimmer-row${index % 2 === 1 ? ' swimmer-row-alt' : ''}${
                        selectedIds.has(row.id) ? ' is-selected' : ''
                      }`}
                      key={row.id}
                    >
                      <label className="swimmer-select-cell" data-label={t('Select')}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.id)}
                          disabled={status === 'active' ? !showPassActions : false}
                          onChange={(e) => toggleSelected(row.id, e.target.checked)}
                          aria-label={`${t('Select')} ${row.swimmer}`}
                        />
                      </label>
                      <strong data-label={t('Swimmer')}>{row.swimmer}</strong>
                      <span data-label={t('Contact')}>
                        <span className="coach-contact">{row.contact}</span>
                        {row.email !== '—' ? (
                          <span className="coach-email">{row.email}</span>
                        ) : null}
                      </span>
                      {showStatusCol ? (
                        <span data-label={t('Status')} className="swimmer-status-cell">
                          {(() => {
                            const statusLabel = swimmerStatusLabel(row);
                            if (statusLabel === '—') return '—';
                            return (
                              <span className={`swimmer-status-label ${swimmerStatusClass(statusLabel)}`}>
                                {t(statusLabel)}
                              </span>
                            );
                          })()}
                        </span>
                      ) : null}
                      <span data-label={t('Pass type')}>{displayPassType}</span>
                      <span data-label={t('Batch')}>
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
                      <span data-label={t('Coach')}>{row.coach}</span>
                      <span className="pass-actions" data-label={t('Actions')}>
                        <button
                          type="button"
                          className="icon-action"
                          onClick={() => openView(row)}
                          aria-label={`View ${row.swimmer}`}
                          title={t('View')}
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
                                : hasValidPassToday(row.passValidUntil)
                                  ? ' is-paid-inactive'
                                  : ' is-inactive'
                            }`}
                            title={
                              awaitPayment
                                ? t('Activate to collect pass payment')
                                : onActiveList
                                  ? t('Deactivate this swimmer')
                                  : t('Activate this swimmer')
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
                              onClick={() => openPassPopup('pass', row.id)}
                            >
                              {t('Pass')}
                            </button>
                            {!sampleMode ? (
                              <button
                                type="button"
                                className="terms-link"
                                onClick={() => void resendPass(row)}
                                disabled={resendingId === row.id}
                                title={t('Resend pass & QR on WhatsApp')}
                              >
                                {resendingId === row.id ? t('Sending…') : t('Resend')}
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
                            title={t('Edit')}
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
                        {status === 'inactive' && canToggleActive ? (
                          <button
                            type="button"
                            className="icon-action icon-action-danger"
                            onClick={() => void deleteSwimmer(row)}
                            disabled={deletingId === row.id || deletingSelected}
                            aria-label={`${t('Delete')} ${row.swimmer}`}
                            title={t('Delete')}
                          >
                            <DeleteIcon />
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
                <h2 id="swimmer-edit-title">{t('Edit swimmer')}</h2>
                <p className="pass-count">{editing.swimmer}</p>
              </div>
              <button type="button" className="csv-btn" onClick={closeEdit}>
                {t('Back to list')}
              </button>
            </div>

            <form className="swimmer-edit-form" onSubmit={onSaveEdit}>
              <label className="field">
                <span className="label">{t('Batch details')}</span>
                {batchesForSwimmerSex(batches, editing.sex).length === 0 ? (
                  <p className="batch-empty">
                    {t('No batches available.')}{' '}
                    <Link className="terms-link" to={tenantPath('/batches')}>
                      {t('Set up batches')}
                    </Link>
                  </p>
                ) : (
                  <InPageSelect
                    value={editForm.batch}
                    onChange={(batch) => setEditForm({ ...editForm, batch })}
                    options={editBatchOptions}
                    placeholder={t('Select batch')}
                    aria-label={t('Batch details')}
                  />
                )}
              </label>

              <fieldset className="swimmer-status-fieldset">
                <legend className="label">{t('Status')}</legend>
                <div className="staff-role-radios" role="radiogroup" aria-label={t('Active status')}>
                  <label
                    className={`staff-role-option ${editForm.isActive ? 'selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="editSwimmerActive"
                      checked={editForm.isActive}
                      onChange={() => setEditForm({ ...editForm, isActive: true })}
                    />
                    <span>{t('Active')}</span>
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
                    <span>{t('Inactive')}</span>
                  </label>
                </div>
              </fieldset>

              {error ? <p className="error">{t(error)}</p> : null}

              <div className="pass-form-actions">
                <button type="button" className="pass-cancel" onClick={closeEdit}>
                  {t('Cancel')}
                </button>
                <button type="submit" className="submit" disabled={saving}>
                  {saving ? t('Saving…') : t('Save changes')}
                </button>
              </div>
            </form>
          </section>
        )}
      </div>
    </PlatformPage>
  );
}
