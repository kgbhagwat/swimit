import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { DownloadButton } from './DownloadButton';
import { InPageSelect } from './InPageSelect';
import { useT } from './i18n';
import { PlatformPage } from './PlatformPage';

type AuditRow = {
  id: number;
  actorUserId: number | null;
  actorUserName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  summary: string;
  details: unknown;
  createdAt: string;
};

export type ActivityLogTarget = {
  id: number;
  accountCode: string;
  accountName: string;
};

const ACTION_OPTIONS = [
  { value: '', label: 'All actions' },
  { value: 'create', label: 'Create' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
  { value: 'activate', label: 'Activate' },
  { value: 'deactivate', label: 'Deactivate' },
  { value: 'login', label: 'Login' },
  { value: 'approve', label: 'Approve' },
  { value: 'deny', label: 'Deny' },
] as const;

const ENTITY_OPTIONS = [
  { value: '', label: 'All records' },
  { value: 'saas_account', label: 'SaaS account' },
  { value: 'swimmer', label: 'Swimmer' },
  { value: 'staff', label: 'Staff' },
  { value: 'pass_type', label: 'Pass type' },
  { value: 'pass_verification', label: 'Pass verification' },
  { value: 'pool_expense', label: 'Pool expense' },
  { value: 'water_quality', label: 'Water quality' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'batches', label: 'Batches' },
  { value: 'pool_core_info', label: 'Core info' },
  { value: 'whatsapp_settings', label: 'WhatsApp settings' },
  { value: 'app_user', label: 'App user' },
  { value: 'remote_login', label: 'Remote login' },
] as const;

function todayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysAgoIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function actionLabel(action: string) {
  switch (action) {
    case 'create':
      return 'Create';
    case 'update':
      return 'Update';
    case 'delete':
      return 'Delete';
    case 'activate':
      return 'Activate';
    case 'deactivate':
      return 'Deactivate';
    case 'login':
      return 'Login';
    case 'approve':
      return 'Approve';
    case 'deny':
      return 'Deny';
    default:
      return action;
  }
}

function remoteRequestId(details: unknown): number | null {
  if (!details || typeof details !== 'object') return null;
  const id = Number((details as { requestId?: unknown }).requestId);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function remoteCanDecide(details: unknown): boolean {
  if (!details || typeof details !== 'object') return false;
  const d = details as { canDecide?: unknown; status?: unknown };
  return d.canDecide === true && String(d.status ?? '') === 'pending';
}

function entityLabel(type: string) {
  const found = ENTITY_OPTIONS.find((o) => o.value === type);
  return found?.label ?? type;
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function ActivityLogBody({
  targetAccount,
  showIntro,
}: {
  targetAccount?: ActivityLogTarget | null;
  showIntro?: boolean;
}) {
  const t = useT();
  const [from, setFrom] = useState(() => daysAgoIso(30));
  const [to, setTo] = useState(() => todayIso());
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [decidingId, setDecidingId] = useState<number | null>(null);

  const actionSelectOptions = useMemo(
    () => ACTION_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) })),
    [t],
  );
  const entitySelectOptions = useMemo(
    () => ENTITY_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) })),
    [t],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (action) params.set('action', action);
      if (entityType) params.set('entityType', entityType);
      if (q.trim()) params.set('q', q.trim());
      params.set('limit', '300');

      const url = targetAccount
        ? `/api/activity-log/platform?targetAccountId=${targetAccount.id}&${params.toString()}`
        : `/api/activity-log?${params.toString()}`;
      const res = await fetch(url);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String(body.error || 'Failed to load activity log'));
      }
      if (targetAccount) {
        setRows(Array.isArray(body.rows) ? body.rows : []);
      } else {
        setRows(Array.isArray(body) ? body : []);
      }
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : 'Failed to load activity log');
    } finally {
      setLoading(false);
    }
  }, [from, to, action, entityType, q, targetAccount]);

  useEffect(() => {
    void load();
  }, [load]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void load();
  }

  async function decideRemote(requestId: number, decision: 'approve' | 'deny') {
    setDecidingId(requestId);
    setError('');
    try {
      const res = await fetch(`/api/remote-login/requests/${requestId}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(body.error || 'Failed to update remote access'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update remote access');
    } finally {
      setDecidingId(null);
    }
  }

  function downloadCsv() {
    const code = targetAccount?.accountCode || 'account';
    const header = ['Time', 'User', 'Action', 'Record type', 'Record', 'Summary'];
    const lines = [
      header.join(','),
      ...rows.map((row) =>
        [
          formatDateTime(row.createdAt),
          row.actorUserName || 'Unknown',
          actionLabel(row.action),
          entityLabel(row.entityType),
          row.entityLabel || row.entityId || '',
          row.summary,
        ]
          .map((cell) => csvEscape(String(cell)))
          .join(','),
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-log-${code}-${from || 'from'}-to-${to || 'to'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      {showIntro ? (
        <p className="lede">
          {targetAccount
            ? t('Platform view of create, edit, and delete activity for this account.')
            : t('Track who created, edited, or deleted records in this account.')}
        </p>
      ) : null}

      <form className="activity-log-filters" onSubmit={onSubmit}>
        <div className="activity-log-filter-row">
          <label className="activity-log-field activity-log-field--date">
            <span>{t('From')}</span>
            <input
              type="date"
              value={from}
              max={to || todayIso()}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="activity-log-field activity-log-field--date">
            <span>{t('To')}</span>
            <input
              type="date"
              value={to}
              min={from || undefined}
              max={todayIso()}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <label className="activity-log-field activity-log-field--select">
            <span>{t('Action')}</span>
            <InPageSelect
              value={action}
              options={actionSelectOptions}
              onChange={setAction}
              aria-label={t('Action')}
            />
          </label>
          <label className="activity-log-field activity-log-field--select activity-log-field--select-wide">
            <span>{t('Record type')}</span>
            <InPageSelect
              value={entityType}
              options={entitySelectOptions}
              onChange={setEntityType}
              aria-label={t('Record type')}
            />
          </label>
        </div>

        <div className="activity-log-filter-row activity-log-filter-row--search">
          <label className="activity-log-field activity-log-field--search">
            <span>{t('Search')}</span>
            <input
              type="search"
              value={q}
              placeholder={t('User, summary, or record…')}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <div className="activity-log-actions">
            <button type="submit" className="submit activity-log-get-btn">
              {t('Get')}
            </button>
            <DownloadButton onClick={downloadCsv} disabled={rows.length === 0} />
          </div>
        </div>
      </form>

      {error ? <p className="form-error">{t(error)}</p> : null}
      {loading ? <p className="muted">{t('Loading…')}</p> : null}

      {!loading && !error && rows.length === 0 ? (
        <p className="muted">{t('No activity recorded for this period.')}</p>
      ) : null}

      {!loading && rows.length > 0 ? (
        <div className="table-wrap">
          <table className="data-table activity-log-table">
            <thead>
              <tr>
                <th>{t('Time')}</th>
                <th>{t('User')}</th>
                <th>{t('Action')}</th>
                <th>{t('Record')}</th>
                <th>{t('Summary')}</th>
                <th>{t('Details')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const open = expandedId === row.id;
                const hasDetails = row.details != null;
                const requestId =
                  row.entityType === 'remote_login' ? remoteRequestId(row.details) : null;
                const showDecide =
                  row.entityType === 'remote_login' &&
                  remoteCanDecide(row.details) &&
                  requestId != null;
                return (
                  <tr key={row.id}>
                    <td className="nowrap">{formatDateTime(row.createdAt)}</td>
                    <td>{row.actorUserName || t('Unknown')}</td>
                    <td>
                      <span className={`activity-action activity-action-${row.action}`}>
                        {t(actionLabel(row.action))}
                      </span>
                    </td>
                    <td>
                      <div className="activity-record">
                        <span className="muted">{t(entityLabel(row.entityType))}</span>
                        {row.entityLabel || row.entityId ? (
                          <strong>{row.entityLabel || `#${row.entityId}`}</strong>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <div>{row.summary}</div>
                      {showDecide ? (
                        <div className="activity-remote-actions">
                          <button
                            type="button"
                            className="submit activity-remote-approve"
                            disabled={decidingId === requestId}
                            onClick={() => void decideRemote(requestId, 'approve')}
                          >
                            {t('Approve remote')}
                          </button>
                          <button
                            type="button"
                            className="ghost-btn activity-remote-deny"
                            disabled={decidingId === requestId}
                            onClick={() => void decideRemote(requestId, 'deny')}
                          >
                            {t('Deny')}
                          </button>
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {hasDetails ? (
                        <button
                          type="button"
                          className="linkish"
                          onClick={() => setExpandedId(open ? null : row.id)}
                        >
                          {open ? t('Hide') : t('View')}
                        </button>
                      ) : (
                        <span className="muted">—</span>
                      )}
                      {open && hasDetails ? (
                        <pre className="activity-details">
                          {JSON.stringify(row.details, null, 2)}
                        </pre>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

/** Tenant account page. */
export function ActivityLog() {
  return (
    <PlatformPage title="Activity Log">
      <ActivityLogBody showIntro />
    </PlatformPage>
  );
}

/** Platform Accounts: drawer to inspect one pool account’s activity log. */
export function PlatformActivityLogPanel({
  open,
  onClose,
  targetAccount,
}: {
  open: boolean;
  onClose: () => void;
  targetAccount: ActivityLogTarget;
}) {
  const t = useT();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const title = t('Activity Log');
  const subtitle = `${targetAccount.accountName} (${targetAccount.accountCode})`;

  const panel = (
    <div
      className="wa-chat-overlay activity-log-overlay"
      role="presentation"
      style={{ ['--wa-chat-top' as string]: '3.75rem' }}
      onClick={onClose}
    >
      <div
        className="wa-chat-panel activity-log-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="wa-chat-thread-header">
          <div className="wa-chat-thread-meta">
            <strong>{title}</strong>
            <span>{subtitle}</span>
          </div>
          <button
            type="button"
            className="wa-chat-icon-btn"
            onClick={onClose}
            aria-label={t('Close')}
            title={t('Close')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>
        <div className="activity-log-panel-body">
          <ActivityLogBody targetAccount={targetAccount} />
        </div>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
