import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
};

type BatchSlot = {
  id: string;
  name: string;
  type: string;
  startTime: string;
  endTime: string;
};

type Filters = {
  swimmer: string;
  contact: string;
  passType: string;
  batch: string;
  coach: string;
};

type EditForm = {
  batch: string;
  isActive: boolean;
};

const emptyFilters: Filters = {
  swimmer: '',
  contact: '',
  passType: '',
  batch: '',
  coach: '',
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function hasValidPassToday(passValidUntil: string | null | undefined) {
  if (!passValidUntil) return false;
  return passValidUntil.slice(0, 10) >= todayIso();
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
        row.passType,
        row.batch,
        row.coach,
        row.isActive ? 'Active' : 'Inactive',
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

function SortIcon() {
  return (
    <svg className="sort-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 3l3 3.5H5L8 3zm0 10L5 9.5h6L8 13z" />
    </svg>
  );
}

function mapRow(row: RegistrationApiRow): SwimmerRow {
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
    hasValidPassToday: hasValidPassToday(row.pass_valid_until),
  };
}

export function SwimmerList() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<SwimmerStatus>('active');
  const [rows, setRows] = useState<SwimmerRow[]>([]);
  const [batches, setBatches] = useState<BatchSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [sortKey, setSortKey] = useState<SortKey>('swimmer');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [editing, setEditing] = useState<SwimmerRow | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ batch: '', isActive: true });
  const [viewing, setViewing] = useState<SwimmerRow | null>(null);
  const [viewProfile, setViewProfile] = useState<SwimmerProfile | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [resendingId, setResendingId] = useState<number | null>(null);
  const [success, setSuccess] = useState('');
  const canEdit = canEditPage('swimmers');

  async function resendPass(row: SwimmerRow) {
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
      const [swimmerRes, batchesRes] = await Promise.all([
        fetch('/api/registrations'),
        fetch('/api/batches'),
      ]);
      if (!swimmerRes.ok) throw new Error('Failed to load swimmers');
      const data = (await swimmerRes.json()) as RegistrationApiRow[];
      setRows(data.map(mapRow));

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

  const statusRows = useMemo(() => {
    if (status === 'active') return rows.filter((row) => row.isActive);
    return rows.filter((row) => !row.isActive);
  }, [rows, status]);

  const visibleRows = useMemo(() => {
    const filtered = statusRows.filter((row) => {
      const match = (value: string, query: string) =>
        !query.trim() || value.toLowerCase().includes(query.trim().toLowerCase());
      return (
        match(row.swimmer, filters.swimmer) &&
        match(`${row.contact} ${row.email}`, filters.contact) &&
        match(row.passType, filters.passType) &&
        match(row.batch, filters.batch) &&
        match(row.coach, filters.coach)
      );
    });

    const sorted = [...filtered].sort((a, b) => {
      const left = a[sortKey].toLowerCase();
      const right = b[sortKey].toLowerCase();
      if (left < right) return sortDir === 'asc' ? -1 : 1;
      if (left > right) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [statusRows, filters, sortKey, sortDir]);

  const summary =
    status === 'active'
      ? `${visibleRows.length} active swimmer${visibleRows.length === 1 ? '' : 's'}`
      : `${visibleRows.length} inactive swimmer${visibleRows.length === 1 ? '' : 's'}`;

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('asc');
  }

  function setFilter(key: keyof Filters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function openView(row: SwimmerRow) {
    setViewing(row);
    setEditing(null);
    setViewProfile(null);
    setViewLoading(true);
    setError('');
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
    if (!editing) return;
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
    <PlatformPage title="Swimmer's List">
      <div className="swimmer-list-card">
        {viewing ? (
          <section className="swimmer-edit-card" aria-labelledby="swimmer-view-title">
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

            <div className="swimmer-list-meta">
              <p className="pass-count">{summary}</p>
              <DownloadButton
                onClick={() => downloadCsv(visibleRows)}
                disabled={visibleRows.length === 0}
              />
            </div>
            {success ? <p className="success">{success}</p> : null}

            <section className="pass-table-card swimmer-table-card">
              <div className="swimmer-table-head">
                {(
                  [
                    ['swimmer', 'Swimmer'],
                    ['contact', 'Contact'],
                    ['passType', 'Pass type'],
                    ['batch', 'Batch'],
                    ['coach', 'Coach'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className="swimmer-sort-btn"
                    onClick={() => toggleSort(key)}
                  >
                    <span>{label}</span>
                    <SortIcon />
                  </button>
                ))}
                <span>Actions</span>
              </div>

              <div className="swimmer-filter-row">
                <input
                  value={filters.swimmer}
                  onChange={(e) => setFilter('swimmer', e.target.value)}
                  placeholder="Filter..."
                  aria-label="Filter swimmer"
                />
                <input
                  value={filters.contact}
                  onChange={(e) => setFilter('contact', e.target.value)}
                  placeholder="Filter..."
                  aria-label="Filter contact"
                />
                <input
                  value={filters.passType}
                  onChange={(e) => setFilter('passType', e.target.value)}
                  placeholder="Filter..."
                  aria-label="Filter pass type"
                />
                <input
                  value={filters.batch}
                  onChange={(e) => setFilter('batch', e.target.value)}
                  placeholder="Filter..."
                  aria-label="Filter batch"
                />
                <input
                  value={filters.coach}
                  onChange={(e) => setFilter('coach', e.target.value)}
                  placeholder="Filter..."
                  aria-label="Filter coach"
                />
                <span />
              </div>

              {loading ? (
                <p className="pass-empty">Loading…</p>
              ) : visibleRows.length === 0 ? (
                <p className="pass-empty swimmer-empty">
                  {status === 'active'
                    ? 'No active swimmers found.'
                    : 'No inactive swimmers found.'}
                </p>
              ) : (
                <div className="pass-table-body">
                  {visibleRows.map((row, index) => (
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
                      <span data-label="Pass type">{row.passType}</span>
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
                        {row.passType && row.passType !== '—' ? (
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
                            <button
                              type="button"
                              className="terms-link"
                              onClick={() => void resendPass(row)}
                              disabled={resendingId === row.id}
                              title="Resend pass & QR on WhatsApp"
                            >
                              {resendingId === row.id ? 'Sending…' : 'Resend'}
                            </button>
                          </>
                        ) : null}
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
                  ))}
                </div>
              )}
            </section>
          </>
        ) : (
          <section className="swimmer-edit-card" aria-labelledby="swimmer-edit-title">
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
