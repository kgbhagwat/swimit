import { useEffect, useMemo, useState } from 'react';
import { useT } from './i18n';
import { Link } from 'react-router-dom';
import { isApplicationDemo } from './applicationDemo';
import { DownloadButton } from './DownloadButton';
import { saveCsvFile } from './csvDownload';
import { canEditPage } from './pageAccess';
import { PlatformPage } from './PlatformPage';
import { sampleCoachListRows, sampleSimpleStaffRows } from './sampleStaff';
import { ColumnSortDir, TableColumnFilter } from './TableColumnFilter';
import { tenantPath } from './tenantSession';

type StaffRole = 'Coach' | 'Lifeguard' | 'Other';

type CoachRow = {
  id: number;
  fullName: string;
  contact: string;
  email: string;
  batches: string[];
  teachStrokes: string;
  isActive: boolean;
};

type SimpleStaffRow = {
  id: number;
  fullName: string;
  contact: string;
  email: string;
  post: string;
  certificateStatus: string;
};

type StaffApiRow = {
  id: number;
  registration_for: string;
  full_name: string;
  email: string;
  whatsapp_mobile: string;
  teach_strokes: string[] | null;
  suitable_batch_ids: string[] | null;
  post_name?: string | null;
  salary?: string | number | null;
  is_active?: boolean;
  has_lifeguard_cert?: string | null;
  lifeguard_expiry?: string | null;
  lifeguard_photo_path?: string | null;
};

type BatchSlot = {
  id: string;
  name: string;
  type: string;
  startTime: string;
  endTime: string;
};

type CoachColKey = 'fullName' | 'contact' | 'batches' | 'teachStrokes';
type SimpleColKey = 'fullName' | 'contact' | 'post' | 'certificateStatus';

const COACH_COLUMNS: Array<{ key: CoachColKey; label: string }> = [
  { key: 'fullName', label: 'Coach name' },
  { key: 'contact', label: 'Contact' },
  { key: 'batches', label: 'Batches' },
  { key: 'teachStrokes', label: 'Interested to teach' },
];

function coachCellValue(row: CoachRow, key: CoachColKey) {
  if (key === 'batches') return row.batches.length > 0 ? row.batches.join('; ') : '—';
  if (key === 'teachStrokes') return row.teachStrokes || '—';
  if (key === 'contact') return row.contact || '—';
  return row.fullName || '—';
}

function simpleCellValue(row: SimpleStaffRow, key: SimpleColKey) {
  if (key === 'contact') return row.contact || '—';
  if (key === 'post') return row.post || '—';
  if (key === 'certificateStatus') return row.certificateStatus || '—';
  return row.fullName || '—';
}

function formatBatchTime(value: string) {
  return value.slice(0, 5);
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

function ViewIconLink({ id, name }: { id: number; name: string }) {
  return (
    <Link
      className="icon-action"
      to={`${tenantPath(`/staff-register/${id}`)}?view=1`}
      aria-label={`View ${name}`}
      title="View complete form"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
        <circle cx="12" cy="12" r="2.75" />
      </svg>
    </Link>
  );
}

function downloadCsv(filename: string, header: string[], rows: string[][]) {
  const lines = [header.join(','), ...rows.map((row) => row.map(csvEscape).join(','))];
  saveCsvFile(filename, lines.join('\n'));
}

export function CoachList() {
  const t = useT();
  const [role, setRole] = useState<StaffRole>('Coach');
  const [coaches, setCoaches] = useState<CoachRow[]>([]);
  const [lifeguards, setLifeguards] = useState<SimpleStaffRow[]>([]);
  const [others, setOthers] = useState<SimpleStaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [sampleMode, setSampleMode] = useState(false);
  const [openCoachFilter, setOpenCoachFilter] = useState<CoachColKey | null>(null);
  const [coachSelected, setCoachSelected] = useState<
    Partial<Record<CoachColKey, Set<string> | null>>
  >({});
  const [coachSortKey, setCoachSortKey] = useState<CoachColKey | null>(null);
  const [coachSortDir, setCoachSortDir] = useState<ColumnSortDir>(null);
  const [openSimpleFilter, setOpenSimpleFilter] = useState<SimpleColKey | null>(null);
  const [simpleSelected, setSimpleSelected] = useState<
    Partial<Record<SimpleColKey, Set<string> | null>>
  >({});
  const [simpleSortKey, setSimpleSortKey] = useState<SimpleColKey | null>(null);
  const [simpleSortDir, setSimpleSortDir] = useState<ColumnSortDir>(null);
  const canEdit = canEditPage('coaches') || sampleMode;

  async function load() {
    setLoading(true);
    setError('');
    try {
      if (isApplicationDemo()) {
        setCoaches(sampleCoachListRows());
        setLifeguards(
          sampleSimpleStaffRows('Lifeguard').map((row) => ({
            ...row,
            certificateStatus: 'Valid until 2027-12-31',
          })),
        );
        setOthers(
          sampleSimpleStaffRows('Other').map((row) => ({
            ...row,
            certificateStatus: '—',
          })),
        );
        setSampleMode(true);
        return;
      }
      const [staffRes, batchesRes] = await Promise.all([
        fetch('/api/staff-registrations'),
        fetch('/api/batches'),
      ]);
      if (!staffRes.ok) throw new Error('Failed to load staff');

      const staffRows = (await staffRes.json()) as StaffApiRow[];
      const batchesData = batchesRes.ok
        ? ((await batchesRes.json()) as { slots?: BatchSlot[] })
        : { slots: [] };
      const slotsSorted = [...(batchesData.slots ?? [])].sort((a, b) => {
        const startDiff = String(a.startTime ?? '').localeCompare(String(b.startTime ?? ''));
        if (startDiff !== 0) return startDiff;
        return String(a.name ?? '').localeCompare(String(b.name ?? ''), undefined, {
          numeric: true,
          sensitivity: 'base',
        });
      });
      const slotMap = new Map(
        slotsSorted.map((slot) => [
          slot.id,
          `${slot.name} — ${slot.type} — ${formatBatchTime(slot.startTime)} to ${formatBatchTime(slot.endTime)}`,
        ]),
      );

      const toSimple = (row: StaffApiRow): SimpleStaffRow => ({
        id: row.id,
        fullName: row.full_name,
        contact: row.whatsapp_mobile || '—',
        email: row.email || '—',
        post: row.post_name?.trim() || row.registration_for || '—',
        certificateStatus:
          row.registration_for !== 'Lifeguard' || row.has_lifeguard_cert !== 'Yes'
            ? 'Not provided'
            : row.lifeguard_expiry &&
                String(row.lifeguard_expiry).slice(0, 10) < new Date().toISOString().slice(0, 10)
              ? `Expired ${String(row.lifeguard_expiry).slice(0, 10)}`
              : row.lifeguard_expiry
                ? `Valid until ${String(row.lifeguard_expiry).slice(0, 10)}`
                : row.lifeguard_photo_path
                  ? 'Uploaded'
                  : 'Details missing',
      });

      setCoaches(
        staffRows
          .filter((row) => row.registration_for === 'Coach')
          .map((row) => {
            const selectedIds = new Set((row.suitable_batch_ids ?? []).map(String));
            const batchLabels = slotsSorted
              .filter((slot) => selectedIds.has(String(slot.id)))
              .map((slot) => slotMap.get(slot.id)!)
              .filter(Boolean);
            return {
              id: row.id,
              fullName: row.full_name,
              contact: row.whatsapp_mobile || '—',
              email: row.email || '—',
              batches: batchLabels,
              teachStrokes:
                Array.isArray(row.teach_strokes) && row.teach_strokes.length > 0
                  ? row.teach_strokes.join(', ')
                  : '—',
              isActive: row.is_active !== false,
            };
          }),
      );
      setLifeguards(staffRows.filter((row) => row.registration_for === 'Lifeguard').map(toSimple));
      setOthers(staffRows.filter((row) => row.registration_for === 'Other').map(toSimple));
      setSampleMode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setCoaches([]);
      setLifeguards([]);
      setOthers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setOpenCoachFilter(null);
    setCoachSelected({});
    setCoachSortKey(null);
    setCoachSortDir(null);
    setOpenSimpleFilter(null);
    setSimpleSelected({});
    setSimpleSortKey(null);
    setSimpleSortDir(null);
  }, [role]);

  const visibleCoaches = useMemo(() => {
    const filtered = coaches.filter((row) =>
      COACH_COLUMNS.every(({ key }) => {
        const selected = coachSelected[key];
        if (!selected) return true;
        return selected.has(coachCellValue(row, key));
      }),
    );
    if (!coachSortKey || !coachSortDir) return filtered;
    return [...filtered].sort((a, b) => {
      const cmp = coachCellValue(a, coachSortKey).localeCompare(
        coachCellValue(b, coachSortKey),
        undefined,
        { numeric: true, sensitivity: 'base' },
      );
      return coachSortDir === 'asc' ? cmp : -cmp;
    });
  }, [coaches, coachSelected, coachSortKey, coachSortDir]);

  const simpleSource = role === 'Lifeguard' ? lifeguards : others;
  const simpleColumns = useMemo(() => {
    const cols: Array<{ key: SimpleColKey; label: string }> = [
      { key: 'fullName', label: 'Name' },
      { key: 'contact', label: 'Contact' },
    ];
    if (role === 'Lifeguard') {
      cols.push({ key: 'certificateStatus', label: 'Life saving certificate' });
    }
    if (role === 'Other') cols.push({ key: 'post', label: 'Post' });
    return cols;
  }, [role]);

  const visibleSimple = useMemo(() => {
    const filtered = simpleSource.filter((row) =>
      simpleColumns.every(({ key }) => {
        const selected = simpleSelected[key];
        if (!selected) return true;
        return selected.has(simpleCellValue(row, key));
      }),
    );
    if (!simpleSortKey || !simpleSortDir) return filtered;
    return [...filtered].sort((a, b) => {
      const cmp = simpleCellValue(a, simpleSortKey).localeCompare(
        simpleCellValue(b, simpleSortKey),
        undefined,
        { numeric: true, sensitivity: 'base' },
      );
      return simpleSortDir === 'asc' ? cmp : -cmp;
    });
  }, [simpleSource, simpleColumns, simpleSelected, simpleSortKey, simpleSortDir]);

  const visibleCount =
    role === 'Coach'
      ? visibleCoaches.length
      : visibleSimple.length;

  const countLabel = useMemo(() => {
    if (sampleMode) return '';
    if (role === 'Coach') {
      return `${visibleCount} ${visibleCount === 1 ? t('coach') : t('coaches')}`;
    }
    if (role === 'Lifeguard') {
      return `${visibleCount} ${visibleCount === 1 ? t('lifeguard') : t('lifeguards')}`;
    }
    return `${visibleCount} ${t('staff')}`;
  }, [role, visibleCount, sampleMode, t]);

  function onDownloadCsv() {
    const stamp = new Date().toISOString().slice(0, 10);
    if (role === 'Coach') {
      downloadCsv(
        `staff-coaches-${stamp}.csv`,
        ['Coach name', 'Contact', 'Email', 'Batches', 'Interested to teach'],
        visibleCoaches.map((row) => [
          row.fullName,
          row.contact,
          row.email,
          row.batches.join('; '),
          row.teachStrokes,
        ]),
      );
      return;
    }
    downloadCsv(
      `staff-${role.toLowerCase()}-${stamp}.csv`,
      role === 'Lifeguard'
        ? ['Name', 'Contact', 'Email', 'Life saving certificate']
        : ['Name', 'Contact', 'Email', 'Post'],
      visibleSimple.map((row) =>
        role === 'Lifeguard'
          ? [row.fullName, row.contact, row.email, row.certificateStatus]
          : [row.fullName, row.contact, row.email, row.post],
      ),
    );
  }

  function EditIconButton({ to, label }: { to: string; label: string }) {
    return (
      <Link className="icon-action" to={to} aria-label={t(label)} title={label}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
          <path d="M13.5 6.5l3 3" />
        </svg>
      </Link>
    );
  }

  async function toggleCoachActive(coach: CoachRow, nextActive: boolean) {
    if (sampleMode || coach.id < 0) {
      setCoaches((prev) =>
        prev.map((row) => (row.id === coach.id ? { ...row, isActive: nextActive } : row)),
      );
      return;
    }
    if (!canEditPage('coaches')) return;
    setApprovingId(coach.id);
    setError('');
    try {
      const res = await fetch(`/api/staff-registrations/${coach.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: nextActive }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to update status');
      setCoaches((prev) =>
        prev.map((row) =>
          row.id === coach.id ? { ...row, isActive: Boolean(body.isActive) } : row,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setApprovingId(null);
    }
  }

  async function deleteStaff(id: number, name: string) {
    if (!canEdit || deletingId === id) return;
    if (!window.confirm(`${t('Delete this staff member?')}\n${name}`)) return;
    setError('');
    if (sampleMode || id < 0) {
      setCoaches((prev) => prev.filter((row) => row.id !== id));
      setLifeguards((prev) => prev.filter((row) => row.id !== id));
      setOthers((prev) => prev.filter((row) => row.id !== id));
      return;
    }
    setDeletingId(id);
    try {
      const res = await fetch(`/api/staff-registrations/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to delete staff');
      }
      setCoaches((prev) => prev.filter((row) => row.id !== id));
      setLifeguards((prev) => prev.filter((row) => row.id !== id));
      setOthers((prev) => prev.filter((row) => row.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete staff');
    } finally {
      setDeletingId(null);
    }
  }

  function CoachActiveToggle({ coach }: { coach: CoachRow }) {
    const busy = approvingId === coach.id;
    const canToggle = sampleMode || canEditPage('coaches');
    return (
      <label
        className={`status-switch swimmer-active-switch${
          coach.isActive ? ' is-active' : ' is-paid-inactive'
        }`}
        title={
          coach.isActive
            ? t('Deactivate coach — will not be available for swimmer allocation')
            : t('Activate coach — available for swimmer allocation')
        }
      >
        <input
          type="checkbox"
          checked={coach.isActive}
          disabled={busy || !canToggle}
          onChange={(e) => void toggleCoachActive(coach, e.target.checked)}
          aria-label={
            coach.isActive ? `Deactivate ${coach.fullName}` : `Activate ${coach.fullName}`
          }
        />
      </label>
    );
  }

  const tableClass = `pass-form-card pool-core-form pass-table-card coach-table-card${
    sampleMode ? ' pass-form-card--sample' : ''
  }`;

  return (
    <PlatformPage
      title="Staff List"
      actions={
        <div className="list-head-actions">
          <div className="staff-role-radios" role="radiogroup" aria-label={t('Staff type')}>
            {(
              [
                ['Coach', 'Coach'],
                ['Lifeguard', 'Lifeguard'],
                ['Other', 'Other'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className={`staff-role-option ${role === value ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="staffRole"
                  value={value}
                  checked={role === value}
                  onChange={() => setRole(value)}
                />
                <span>{t(label)}</span>
              </label>
            ))}
          </div>
          <DownloadButton onClick={onDownloadCsv} disabled={visibleCount === 0} />
        </div>
      }
    >
      {countLabel ? (
        <div className="pass-head">
          <p className="pass-count batch-list-lede">{countLabel}</p>
        </div>
      ) : null}

      {role === 'Coach' ? (
        <section className={tableClass}>
          {sampleMode ? (
            <div className="user-mgmt-sample-watermark" aria-hidden="true">
              {t('Sample')}
            </div>
          ) : null}
          <div className="coach-table-head">
            {COACH_COLUMNS.map(({ key, label }) => (
              <div key={key} className="staff-col-head">
                <TableColumnFilter
                  label={t(label)}
                  values={coaches.map((row) => coachCellValue(row, key))}
                  selected={coachSelected[key] ?? null}
                  sortDir={coachSortKey === key ? coachSortDir : null}
                  open={openCoachFilter === key}
                  onToggleOpen={() =>
                    setOpenCoachFilter((prev) => (prev === key ? null : key))
                  }
                  onClose={() => setOpenCoachFilter(null)}
                  onSelectedChange={(next) =>
                    setCoachSelected((prev) => ({ ...prev, [key]: next }))
                  }
                  onSort={(dir) => {
                    setCoachSortKey(dir ? key : null);
                    setCoachSortDir(dir);
                  }}
                />
              </div>
            ))}
            <span>{t('Actions')}</span>
          </div>

          {loading ? (
            <p className="pass-empty">{t('Loading…')}</p>
          ) : coaches.length === 0 ? (
            <p className="pass-empty">
              {t('No coaches registered yet. Use')}{' '}
              <Link className="terms-link" to={tenantPath('/staff-register')}>
                {t('Staff registration')}
              </Link>{' '}
              {t('to add one.')}
            </p>
          ) : visibleCoaches.length === 0 ? (
            <p className="pass-empty">{t('No coaches match these filters.')}</p>
          ) : (
            <div className="pass-table-body">
              {visibleCoaches.map((coach, index) => (
                <div
                  className={`coach-row${index % 2 === 1 ? ' coach-row-alt' : ''}`}
                  key={coach.id}
                >
                  <strong data-label={t('Coach name')}>{coach.fullName}</strong>
                  <span className="coach-contact" data-label={t('Contact')}>
                    {coach.contact}
                  </span>
                  <span className="coach-batches" data-label={t('Batches')}>
                    {coach.batches.length > 0 ? (
                      coach.batches.map((batch) => (
                        <span className="coach-batch-line" key={batch}>
                          {batch}
                        </span>
                      ))
                    ) : (
                      <span>—</span>
                    )}
                  </span>
                  <span data-label={t('Interested to teach')}>{coach.teachStrokes}</span>
                  <span className="pass-actions" data-label={t('Actions')}>
                    <ViewIconLink id={coach.id} name={coach.fullName} />
                    {canEdit ? (
                      <EditIconButton
                        to={tenantPath(`/staff-register/${coach.id}`)}
                        label={`Edit ${coach.fullName}`}
                      />
                    ) : null}
                    <CoachActiveToggle coach={coach} />
                    {canEdit ? (
                      <button
                        type="button"
                        className="icon-action icon-action-danger"
                        onClick={() => void deleteStaff(coach.id, coach.fullName)}
                        disabled={deletingId === coach.id}
                        aria-label={`${t('Delete')} ${coach.fullName}`}
                        title={t('Delete')}
                      >
                        <DeleteIcon />
                      </button>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className={tableClass}>
          {sampleMode ? (
            <div className="user-mgmt-sample-watermark" aria-hidden="true">
              {t('Sample')}
            </div>
          ) : null}
          <div className={role === 'Lifeguard' ? 'lifeguard-staff-head' : 'other-staff-head'}>
            {simpleColumns.map(({ key, label }) => (
              <div key={key} className="staff-col-head">
                <TableColumnFilter
                  label={t(label)}
                  values={simpleSource.map((row) => simpleCellValue(row, key))}
                  selected={simpleSelected[key] ?? null}
                  sortDir={simpleSortKey === key ? simpleSortDir : null}
                  open={openSimpleFilter === key}
                  onToggleOpen={() =>
                    setOpenSimpleFilter((prev) => (prev === key ? null : key))
                  }
                  onClose={() => setOpenSimpleFilter(null)}
                  onSelectedChange={(next) =>
                    setSimpleSelected((prev) => ({ ...prev, [key]: next }))
                  }
                  onSort={(dir) => {
                    setSimpleSortKey(dir ? key : null);
                    setSimpleSortDir(dir);
                  }}
                />
              </div>
            ))}
            <span>{t('Actions')}</span>
          </div>

          {loading ? (
            <p className="pass-empty">{t('Loading…')}</p>
          ) : simpleSource.length === 0 ? (
            <p className="pass-empty">
              {role === 'Lifeguard'
                ? t('No lifeguards registered yet. Use')
                : t('No other staff registered yet. Use')}{' '}
              <Link className="terms-link" to={tenantPath('/staff-register')}>
                {t('Staff registration')}
              </Link>{' '}
              {t('to add one.')}
            </p>
          ) : visibleSimple.length === 0 ? (
            <p className="pass-empty">
              {role === 'Lifeguard'
                ? t('No lifeguards match these filters.')
                : t('No staff match these filters.')}
            </p>
          ) : (
            <div className="pass-table-body">
              {visibleSimple.map((staff) => (
                <div
                  className={role === 'Lifeguard' ? 'lifeguard-staff-row' : 'other-staff-row'}
                  key={staff.id}
                >
                  <strong data-label={t('Name')}>{staff.fullName}</strong>
                  <span className="coach-contact" data-label={t('Contact')}>{staff.contact}</span>
                  {role === 'Lifeguard' ? (
                    <span
                      className={`staff-certificate-status${
                        staff.certificateStatus.startsWith('Expired') ||
                        staff.certificateStatus === 'Not provided'
                          ? ' is-warning'
                          : ' is-valid'
                      }`}
                      data-label={t('Life saving certificate')}
                    >
                      {staff.certificateStatus}
                    </span>
                  ) : null}
                  {role === 'Other' ? <span data-label={t('Post')}>{staff.post}</span> : null}
                  <span className="pass-actions" data-label={t('Actions')}>
                    <ViewIconLink id={staff.id} name={staff.fullName} />
                    {canEdit ? (
                      <EditIconButton
                        to={tenantPath(`/staff-register/${staff.id}`)}
                        label={`Edit ${staff.fullName}`}
                      />
                    ) : null}
                    {canEdit ? (
                      <button
                        type="button"
                        className="icon-action icon-action-danger"
                        onClick={() => void deleteStaff(staff.id, staff.fullName)}
                        disabled={deletingId === staff.id}
                        aria-label={`${t('Delete')} ${staff.fullName}`}
                        title={t('Delete')}
                      >
                        <DeleteIcon />
                      </button>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {error ? <p className="error">{t(error)}</p> : null}
    </PlatformPage>
  );
}
