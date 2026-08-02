import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PlatformPage } from './PlatformPage';
import { PlatformShell } from './PlatformShell';
import { hasPlatformAccess } from './platformAccess';
import { getPlatformSession } from './platformSession';

type Account = {
  id: number;
  accountName: string;
  contactName: string;
  mobile: string;
  email: string;
  city: string;
  poolAddress?: string;
  accountCode?: string;
  servicePackageId?: number | null;
  packageName?: string;
  status?: string;
  createdAt?: string;
  activeSwimmers?: number;
  subscriptionExpiresAt?: string | null;
};

type PackageOption = {
  id: number;
  packageName: string;
  isActive: boolean;
};

type EditDraft = {
  servicePackageId: string;
  status: string;
  subscriptionExpiresAt: string;
};

const STATUSES = ['Trial', 'Active', 'Suspended'] as const;

function formatCreated(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatExpiry(value?: string | null) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function toDateInput(value?: string | null) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function accountLoginUrl(code: string) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
  return `${origin}/${code}`;
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M7 7l1 13h8l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function ResetPasswordIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="8" cy="8" r="3.5" />
      <path d="M10.5 10.5 20 20" />
      <path d="M16 16l2 2" />
      <path d="M18.5 13.5l2.5 2.5" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function CancelIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

export function Accounts() {
  const session = getPlatformSession();
  const canManage = Boolean(
    session && hasPlatformAccess(session.menuAccess, 'accounts', session.isAccountAdmin),
  );
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Account | null>(null);
  const [pendingReset, setPendingReset] = useState<Account | null>(null);
  const [resettingId, setResettingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [info, setInfo] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [accountsRes, packagesRes] = await Promise.all([
        fetch('/api/saas-accounts'),
        fetch('/api/service-packages'),
      ]);
      const accountsBody = await accountsRes.json().catch(() => []);
      const packagesBody = await packagesRes.json().catch(() => []);
      if (!accountsRes.ok) throw new Error(accountsBody.error ?? 'Failed to load accounts');
      setAccounts(Array.isArray(accountsBody) ? accountsBody : []);
      if (packagesRes.ok && Array.isArray(packagesBody)) {
        setPackages(
          packagesBody.map((row: Record<string, unknown>) => ({
            id: Number(row.id),
            packageName: String(row.packageName ?? ''),
            isActive: row.isActive !== false,
          })),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load accounts');
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function startEdit(account: Account) {
    setError('');
    setInfo('');
    setEditingId(account.id);
    setEditDraft({
      servicePackageId:
        account.servicePackageId != null && account.servicePackageId > 0
          ? String(account.servicePackageId)
          : '',
      status: account.status?.trim() || 'Active',
      subscriptionExpiresAt: toDateInput(account.subscriptionExpiresAt),
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(null);
  }

  async function saveEdit(account: Account) {
    if (!editDraft) return;
    if (!editDraft.servicePackageId) {
      setError('Select a package');
      return;
    }
    if (!(STATUSES as readonly string[]).includes(editDraft.status)) {
      setError('Status must be Trial, Active, or Suspended');
      return;
    }
    if (!editDraft.subscriptionExpiresAt) {
      setError('Enter an expiry date');
      return;
    }

    setSavingId(account.id);
    setError('');
    try {
      const currentRes = await fetch(`/api/saas-accounts/${account.id}`);
      const current = await currentRes.json().catch(() => ({}));
      if (!currentRes.ok) throw new Error(current.error ?? 'Failed to load account');

      const res = await fetch(`/api/saas-accounts/${account.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountName: current.accountName,
          accountCode: current.accountCode,
          poolAddress: current.poolAddress ?? '',
          contactName: current.contactName,
          mobile: current.mobile,
          email: current.email,
          city: current.city ?? '',
          notes: current.notes ?? '',
          servicePackageId: Number(editDraft.servicePackageId),
          status: editDraft.status,
          subscriptionExpiresAt: editDraft.subscriptionExpiresAt,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to update account');

      setAccounts((prev) =>
        prev.map((row) =>
          row.id === account.id
            ? {
                ...row,
                servicePackageId:
                  body.servicePackageId == null ? null : Number(body.servicePackageId),
                packageName: String(body.packageName ?? row.packageName ?? ''),
                status: String(body.status ?? editDraft.status),
                subscriptionExpiresAt: body.subscriptionExpiresAt ?? editDraft.subscriptionExpiresAt,
              }
            : row,
        ),
      );
      cancelEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update account');
    } finally {
      setSavingId(null);
    }
  }

  function requestDelete(account: Account) {
    const code = String(account.accountCode ?? '').toLowerCase();
    if (code === 'swimit') {
      setError('The SwimIT platform account cannot be deleted');
      return;
    }
    setError('');
    setInfo('');
    setPendingDelete(account);
  }

  function requestResetPassword(account: Account) {
    if (String(account.status ?? '').trim() === 'Suspended') {
      setError('Cannot reset password for a suspended account');
      return;
    }
    setError('');
    setInfo('');
    setPendingReset(account);
  }

  async function confirmResetPassword() {
    if (!pendingReset) return;
    const account = pendingReset;
    setResettingId(account.id);
    setError('');
    setInfo('');
    try {
      const res = await fetch(`/api/saas-accounts/${account.id}/resend-credentials`, {
        method: 'POST',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to reset admin password');
      const userName = String(body.adminUser?.userName ?? 'admin');
      const mobile = String(body.adminUser?.mobile ?? account.mobile ?? '');
      setInfo(
        `Admin password reset for ${account.accountName}. New temporary password sent to ${mobile || 'the account admin'} (user: ${userName}).`,
      );
      setPendingReset(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset admin password');
      setPendingReset(null);
    } finally {
      setResettingId(null);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const account = pendingDelete;
    setDeletingId(account.id);
    setError('');
    try {
      const res = await fetch(`/api/saas-accounts/${account.id}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to delete account');
      setAccounts((prev) => prev.filter((row) => row.id !== account.id));
      if (editingId === account.id) cancelEdit();
      setPendingDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete account');
      setPendingDelete(null);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <PlatformShell>
      <PlatformPage
        title="Accounts"
        className="accounts-page"
        actions={
          <Link className="submit" to="/create-account">
            Create Account
          </Link>
        }
      >
        {error ? <p className="error">{error}</p> : null}
        {info ? <p className="success">{info}</p> : null}

        <section className="pass-table-card">
          {loading ? (
            <p className="muted">Loading…</p>
          ) : accounts.length === 0 ? (
            <p className="pass-empty">
              No SaaS accounts yet.{' '}
              <Link className="terms-link" to="/create-account">
                Create the first account
              </Link>
              .
            </p>
          ) : (
            <>
              <div className="batch-saved-table-wrap accounts-table-wrap accounts-desktop-only">
                <table className="batch-saved-table accounts-table">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Code</th>
                      <th>Contact</th>
                      <th>Opened</th>
                      <th>Package</th>
                      <th>Status</th>
                      <th>Active swimmers</th>
                      <th>Expires</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((item) => {
                      const isPlatform = String(item.accountCode ?? '').toLowerCase() === 'swimit';
                      const isEditing = editingId === item.id && editDraft != null;
                      const busy =
                        savingId === item.id || deletingId === item.id || resettingId === item.id;
                      return (
                        <tr key={item.id} className={isEditing ? 'accounts-row-editing' : undefined}>
                          <td className="accounts-col-account">
                            <strong className="batch-saved-name">{item.accountName}</strong>
                            {item.poolAddress ? (
                              <div className="muted accounts-sub">{item.poolAddress}</div>
                            ) : null}
                            {item.city ? (
                              <div className="muted accounts-sub">{item.city}</div>
                            ) : null}
                          </td>
                          <td className="accounts-col-code">
                            {item.accountCode ? (
                              <a className="terms-link" href={accountLoginUrl(item.accountCode)}>
                                {item.accountCode}
                              </a>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="accounts-col-contact">
                            {item.contactName}
                            <div className="muted accounts-sub">
                              {item.mobile}
                              {item.email ? (
                                <>
                                  <br />
                                  {item.email}
                                </>
                              ) : null}
                            </div>
                          </td>
                          <td>{formatCreated(item.createdAt)}</td>
                          <td>
                            {isEditing ? (
                              <select
                                className="accounts-inline-control"
                                value={editDraft.servicePackageId}
                                disabled={busy}
                                onChange={(e) =>
                                  setEditDraft((prev) =>
                                    prev ? { ...prev, servicePackageId: e.target.value } : prev,
                                  )
                                }
                                aria-label="Package"
                              >
                                <option value="">Select package</option>
                                {packages
                                  .filter(
                                    (p) =>
                                      p.isActive ||
                                      String(p.id) === editDraft.servicePackageId,
                                  )
                                  .map((pkg) => (
                                    <option key={pkg.id} value={pkg.id}>
                                      {pkg.packageName}
                                      {!pkg.isActive ? ' (inactive)' : ''}
                                    </option>
                                  ))}
                              </select>
                            ) : (
                              item.packageName?.trim() || '—'
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <select
                                className="accounts-inline-control"
                                value={editDraft.status}
                                disabled={busy}
                                onChange={(e) =>
                                  setEditDraft((prev) =>
                                    prev ? { ...prev, status: e.target.value } : prev,
                                  )
                                }
                                aria-label="Status"
                              >
                                {STATUSES.map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              item.status?.trim() || '—'
                            )}
                          </td>
                          <td className="accounts-col-num">{item.activeSwimmers ?? 0}</td>
                          <td>
                            {isEditing ? (
                              <input
                                type="date"
                                className="accounts-inline-control accounts-inline-date"
                                value={editDraft.subscriptionExpiresAt}
                                disabled={busy}
                                onChange={(e) =>
                                  setEditDraft((prev) =>
                                    prev
                                      ? { ...prev, subscriptionExpiresAt: e.target.value }
                                      : prev,
                                  )
                                }
                                aria-label="Expires"
                              />
                            ) : (
                              formatExpiry(item.subscriptionExpiresAt)
                            )}
                          </td>
                          <td className="accounts-col-actions">
                            {canManage ? (
                              <div className="accounts-action-icons">
                                {isEditing ? (
                                  <>
                                    <button
                                      type="button"
                                      className="accounts-icon-btn accounts-icon-save"
                                      disabled={busy}
                                      onClick={() => void saveEdit(item)}
                                      aria-label={`Save ${item.accountName}`}
                                      title={savingId === item.id ? 'Saving…' : 'Save'}
                                    >
                                      <SaveIcon />
                                    </button>
                                    <button
                                      type="button"
                                      className="accounts-icon-btn accounts-icon-cancel"
                                      disabled={busy}
                                      onClick={cancelEdit}
                                      aria-label="Cancel edit"
                                      title="Cancel"
                                    >
                                      <CancelIcon />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      className="accounts-icon-btn accounts-icon-edit"
                                      disabled={editingId != null || busy}
                                      onClick={() => startEdit(item)}
                                      aria-label={`Edit ${item.accountName}`}
                                      title="Edit"
                                    >
                                      <EditIcon />
                                    </button>
                                    <button
                                      type="button"
                                      className="accounts-icon-btn accounts-icon-delete"
                                      disabled={
                                        deletingId === item.id || isPlatform || editingId != null
                                      }
                                      onClick={() => requestDelete(item)}
                                      aria-label={`Delete ${item.accountName}`}
                                      title={
                                        isPlatform
                                          ? 'Platform account cannot be deleted'
                                          : deletingId === item.id
                                            ? 'Deleting…'
                                            : 'Delete'
                                      }
                                    >
                                      <DeleteIcon />
                                    </button>
                                    <button
                                      type="button"
                                      className="accounts-icon-btn accounts-icon-reset"
                                      disabled={editingId != null || busy}
                                      onClick={() => requestResetPassword(item)}
                                      aria-label={`Reset admin password for ${item.accountName}`}
                                      title={
                                        resettingId === item.id
                                          ? 'Resetting…'
                                          : 'Reset admin password'
                                      }
                                    >
                                      <ResetPasswordIcon />
                                    </button>
                                  </>
                                )}
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="accounts-mobile-list" aria-label="Accounts">
                {accounts.map((item, index) => {
                  const isPlatform = String(item.accountCode ?? '').toLowerCase() === 'swimit';
                  const isEditing = editingId === item.id && editDraft != null;
                  const busy =
                    savingId === item.id || deletingId === item.id || resettingId === item.id;
                  const tone = index % 4;
                  return (
                    <article
                      key={item.id}
                      className={`accounts-block accounts-block-tone-${tone}${
                        isEditing ? ' accounts-block-editing' : ''
                      }`}
                    >
                      <div className="accounts-block-row">
                        <div className="accounts-block-field" data-label="Account">
                          <strong className="batch-saved-name">{item.accountName}</strong>
                          {item.poolAddress ? (
                            <div className="muted accounts-sub">{item.poolAddress}</div>
                          ) : null}
                          {item.city ? (
                            <div className="muted accounts-sub">{item.city}</div>
                          ) : null}
                        </div>
                        <div className="accounts-block-field" data-label="Code">
                          {item.accountCode ? (
                            <a className="terms-link" href={accountLoginUrl(item.accountCode)}>
                              {item.accountCode}
                            </a>
                          ) : (
                            '—'
                          )}
                        </div>
                        <div className="accounts-block-field" data-label="Contact">
                          {item.contactName}
                          <div className="muted accounts-sub">
                            {item.mobile}
                            {item.email ? (
                              <>
                                <br />
                                {item.email}
                              </>
                            ) : null}
                          </div>
                        </div>
                        <div className="accounts-block-field" data-label="Opened">
                          {formatCreated(item.createdAt)}
                        </div>
                        <div className="accounts-block-actions-cell" aria-hidden="true" />
                      </div>
                      <div className="accounts-block-row">
                        <div className="accounts-block-field" data-label="Package">
                          {isEditing ? (
                            <select
                              className="accounts-inline-control"
                              value={editDraft.servicePackageId}
                              disabled={busy}
                              onChange={(e) =>
                                setEditDraft((prev) =>
                                  prev ? { ...prev, servicePackageId: e.target.value } : prev,
                                )
                              }
                              aria-label="Package"
                            >
                              <option value="">Select package</option>
                              {packages
                                .filter(
                                  (p) =>
                                    p.isActive || String(p.id) === editDraft.servicePackageId,
                                )
                                .map((pkg) => (
                                  <option key={pkg.id} value={pkg.id}>
                                    {pkg.packageName}
                                    {!pkg.isActive ? ' (inactive)' : ''}
                                  </option>
                                ))}
                            </select>
                          ) : (
                            item.packageName?.trim() || '—'
                          )}
                        </div>
                        <div className="accounts-block-field" data-label="Status">
                          {isEditing ? (
                            <select
                              className="accounts-inline-control"
                              value={editDraft.status}
                              disabled={busy}
                              onChange={(e) =>
                                setEditDraft((prev) =>
                                  prev ? { ...prev, status: e.target.value } : prev,
                                )
                              }
                              aria-label="Status"
                            >
                              {STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          ) : (
                            item.status?.trim() || '—'
                          )}
                        </div>
                        <div className="accounts-block-field" data-label="Active swimmers">
                          {item.activeSwimmers ?? 0}
                        </div>
                        <div className="accounts-block-field" data-label="Expires">
                          {isEditing ? (
                            <input
                              type="date"
                              className="accounts-inline-control accounts-inline-date"
                              value={editDraft.subscriptionExpiresAt}
                              disabled={busy}
                              onChange={(e) =>
                                setEditDraft((prev) =>
                                  prev
                                    ? { ...prev, subscriptionExpiresAt: e.target.value }
                                    : prev,
                                )
                              }
                              aria-label="Expires"
                            />
                          ) : (
                            formatExpiry(item.subscriptionExpiresAt)
                          )}
                        </div>
                        <div className="accounts-block-actions-cell">
                          {canManage ? (
                            <div className="accounts-action-icons accounts-block-actions">
                              {isEditing ? (
                                <>
                                  <button
                                    type="button"
                                    className="accounts-icon-btn accounts-icon-save"
                                    disabled={busy}
                                    onClick={() => void saveEdit(item)}
                                    aria-label={`Save ${item.accountName}`}
                                    title={savingId === item.id ? 'Saving…' : 'Save'}
                                  >
                                    <SaveIcon />
                                  </button>
                                  <button
                                    type="button"
                                    className="accounts-icon-btn accounts-icon-cancel"
                                    disabled={busy}
                                    onClick={cancelEdit}
                                    aria-label="Cancel edit"
                                    title="Cancel"
                                  >
                                    <CancelIcon />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="accounts-icon-btn accounts-icon-edit"
                                    disabled={editingId != null || busy}
                                    onClick={() => startEdit(item)}
                                    aria-label={`Edit ${item.accountName}`}
                                    title="Edit"
                                  >
                                    <EditIcon />
                                  </button>
                                  <button
                                    type="button"
                                    className="accounts-icon-btn accounts-icon-delete"
                                    disabled={
                                      deletingId === item.id || isPlatform || editingId != null
                                    }
                                    onClick={() => requestDelete(item)}
                                    aria-label={`Delete ${item.accountName}`}
                                    title={
                                      isPlatform
                                        ? 'Platform account cannot be deleted'
                                        : deletingId === item.id
                                          ? 'Deleting…'
                                          : 'Delete'
                                    }
                                  >
                                    <DeleteIcon />
                                  </button>
                                  <button
                                    type="button"
                                    className="accounts-icon-btn accounts-icon-reset"
                                    disabled={editingId != null || busy}
                                    onClick={() => requestResetPassword(item)}
                                    aria-label={`Reset admin password for ${item.accountName}`}
                                    title={
                                      resettingId === item.id
                                        ? 'Resetting…'
                                        : 'Reset admin password'
                                    }
                                  >
                                    <ResetPasswordIcon />
                                  </button>
                                </>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </PlatformPage>

      {pendingDelete ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
          onClick={() => {
            if (deletingId == null) setPendingDelete(null);
          }}
        >
          <div
            className="modal-panel accounts-delete-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-account-title">Delete account?</h2>
            <p className="modal-intro">
              Delete <strong>{pendingDelete.accountName}</strong>
              {pendingDelete.accountCode ? ` (${pendingDelete.accountCode})` : ''}?
              This permanently removes the pool account and its data.
            </p>
            <div className="modal-footer accounts-delete-modal-footer">
              <button
                type="button"
                className="ghost-btn"
                disabled={deletingId != null}
                onClick={() => setPendingDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="submit accounts-delete-confirm"
                disabled={deletingId != null}
                onClick={() => void confirmDelete()}
              >
                {deletingId != null ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingReset ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-admin-password-title"
          onClick={() => {
            if (resettingId == null) setPendingReset(null);
          }}
        >
          <div
            className="modal-panel accounts-delete-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="reset-admin-password-title">Reset admin password?</h2>
            <p className="modal-intro">
              Reset the account admin password for{' '}
              <strong>{pendingReset.accountName}</strong>
              {pendingReset.accountCode ? ` (${pendingReset.accountCode})` : ''}?
              A new temporary password will be sent on WhatsApp to{' '}
              <strong>{pendingReset.mobile || 'the account contact'}</strong>.
            </p>
            <div className="modal-footer accounts-delete-modal-footer">
              <button
                type="button"
                className="ghost-btn"
                disabled={resettingId != null}
                onClick={() => setPendingReset(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="submit"
                disabled={resettingId != null}
                onClick={() => void confirmResetPassword()}
              >
                {resettingId != null ? 'Resetting…' : 'Reset password'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PlatformShell>
  );
}
