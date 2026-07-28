import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DownloadButton } from './DownloadButton';
import { MenuBackLink } from './MenuBackLink';
import { tenantPath } from './tenantSession';

type StaffRole = 'Coach' | 'Lifeguard' | 'Other';

type CoachRow = {
  id: number;
  fullName: string;
  contact: string;
  email: string;
  batches: string[];
  teachStrokes: string;
};

type SimpleStaffRow = {
  id: number;
  fullName: string;
  contact: string;
  email: string;
  post: string;
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
};

type BatchSlot = {
  id: string;
  name: string;
  type: string;
  startTime: string;
  endTime: string;
};

function formatBatchTime(value: string) {
  return value.slice(0, 5);
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function downloadCsv(filename: string, header: string[], rows: string[][]) {
  const lines = [header.join(','), ...rows.map((row) => row.map(csvEscape).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function CoachList() {
  const [role, setRole] = useState<StaffRole>('Coach');
  const [coaches, setCoaches] = useState<CoachRow[]>([]);
  const [lifeguards, setLifeguards] = useState<SimpleStaffRow[]>([]);
  const [others, setOthers] = useState<SimpleStaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [staffRes, batchesRes] = await Promise.all([
        fetch('/api/staff-registrations'),
        fetch('/api/batches'),
      ]);
      if (!staffRes.ok) throw new Error('Failed to load staff');

      const staffRows = (await staffRes.json()) as StaffApiRow[];
      const batchesData = batchesRes.ok
        ? ((await batchesRes.json()) as { slots?: BatchSlot[] })
        : { slots: [] };
      const slotMap = new Map(
        (batchesData.slots ?? []).map((slot) => [
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
      });

      setCoaches(
        staffRows
          .filter((row) => row.registration_for === 'Coach')
          .map((row) => {
            const batchLabels = (row.suitable_batch_ids ?? [])
              .map((id) => slotMap.get(String(id)) ?? id)
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
            };
          }),
      );
      setLifeguards(staffRows.filter((row) => row.registration_for === 'Lifeguard').map(toSimple));
      setOthers(staffRows.filter((row) => row.registration_for === 'Other').map(toSimple));
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

  const visibleSimple = role === 'Lifeguard' ? lifeguards : others;
  const visibleCount =
    role === 'Coach' ? coaches.length : role === 'Lifeguard' ? lifeguards.length : others.length;

  const countLabel = useMemo(() => {
    if (role === 'Coach') return `${visibleCount} coach${visibleCount === 1 ? '' : 'es'}`;
    if (role === 'Lifeguard') {
      return `${visibleCount} lifeguard${visibleCount === 1 ? '' : 's'}`;
    }
    return `${visibleCount} staff`;
  }, [role, visibleCount]);

  function onDownloadCsv() {
    const stamp = new Date().toISOString().slice(0, 10);
    if (role === 'Coach') {
      downloadCsv(
        `staff-coaches-${stamp}.csv`,
        ['Coach name', 'Contact', 'Email', 'Batches', 'Interested to teach'],
        coaches.map((row) => [
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
      role === 'Lifeguard' ? ['Name', 'Contact', 'Email'] : ['Name', 'Contact', 'Email', 'Post'],
      visibleSimple.map((row) =>
        role === 'Lifeguard'
          ? [row.fullName, row.contact, row.email]
          : [row.fullName, row.contact, row.email, row.post],
      ),
    );
  }

  function EditIconButton({ to, label }: { to: string; label: string }) {
    return (
      <Link className="icon-action" to={to} aria-label={label} title={label}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
          <path d="M13.5 6.5l3 3" />
        </svg>
      </Link>
    );
  }

  return (
    <div className="page">
      <div className="top-row">
        <MenuBackLink />
      </div>

      <div className="pass-head">
        <div>
          <h1>Staff List</h1>
          <p className="pass-count">{countLabel}</p>
        </div>
        <div className="list-head-actions">
          <div className="staff-role-radios" role="radiogroup" aria-label="Staff type">
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
                <span>{label}</span>
              </label>
            ))}
          </div>
          <DownloadButton onClick={onDownloadCsv} disabled={visibleCount === 0} />
        </div>
      </div>

      {role === 'Coach' ? (
        <section className="pass-table-card coach-table-card">
          <div className="coach-table-head">
            <span>Coach name</span>
            <span>Contact</span>
            <span>Batches</span>
            <span>Interested to teach</span>
            <span>Actions</span>
          </div>

          {loading ? (
            <p className="pass-empty">Loading…</p>
          ) : coaches.length === 0 ? (
            <p className="pass-empty">
              No coaches registered yet. Use{' '}
              <Link className="terms-link" to={tenantPath('/staff-register')}>
                Staff registration
              </Link>{' '}
              to add one.
            </p>
          ) : (
            <div className="pass-table-body">
              {coaches.map((coach) => (
                <div className="coach-row" key={coach.id}>
                  <strong>{coach.fullName}</strong>
                  <span className="coach-contact">{coach.contact}</span>
                  <span className="coach-batches">
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
                  <span>{coach.teachStrokes}</span>
                  <span className="pass-actions">
                    <EditIconButton
                      to={tenantPath(`/staff-register/${coach.id}`)}
                      label={`Edit ${coach.fullName}`}
                    />
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="pass-table-card coach-table-card">
          <div className={role === 'Lifeguard' ? 'lifeguard-staff-head' : 'other-staff-head'}>
            <span>Name</span>
            <span>Contact</span>
            {role === 'Other' ? <span>Post</span> : null}
            <span>Actions</span>
          </div>

          {loading ? (
            <p className="pass-empty">Loading…</p>
          ) : visibleSimple.length === 0 ? (
            <p className="pass-empty">
              No {role === 'Lifeguard' ? 'lifeguards' : 'other staff'} registered yet. Use{' '}
              <Link className="terms-link" to={tenantPath('/staff-register')}>
                Staff registration
              </Link>{' '}
              to add one.
            </p>
          ) : (
            <div className="pass-table-body">
              {visibleSimple.map((staff) => (
                <div
                  className={role === 'Lifeguard' ? 'lifeguard-staff-row' : 'other-staff-row'}
                  key={staff.id}
                >
                  <strong>{staff.fullName}</strong>
                  <span className="coach-contact">{staff.contact}</span>
                  {role === 'Other' ? <span>{staff.post}</span> : null}
                  <span className="pass-actions">
                    <EditIconButton
                      to={tenantPath(`/staff-register/${staff.id}`)}
                      label={`Edit ${staff.fullName}`}
                    />
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
