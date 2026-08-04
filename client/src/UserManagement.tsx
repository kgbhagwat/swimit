import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CreateUserForm } from './CreateUser';
import { PlatformPage } from './PlatformPage';
import {
  ACCESS_PAGES,
  MENU_SECTIONS,
  editAccessKey,
  INFORMATION_EDITABLE_PAGE_KEYS,
  pageKeysForModules,
  type MenuPageKey,
  pagesBySection,
} from './menuCatalog';
import {
  PLATFORM_ACCESS_PAGES,
  PLATFORM_ACCESS_SECTIONS,
  type PlatformAccessPageKey,
  platformPagesBySection,
} from './platformAccess';
import {
  getActiveAccountCode,
  isPlatformUsersPath,
} from './tenantSession';

type AppUser = {
  id: number;
  userName: string;
  mobile: string;
  email?: string;
  menuAccess: string[];
  createdAt: string;
  isAccountAdmin?: boolean;
};

type AccessKey = MenuPageKey | PlatformAccessPageKey;

function formatCreatedAt(value: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function AccessEditIcon() {
  return (
    <svg
      className="user-access-edit-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
      <path d="M13.5 6.5l3 3" />
    </svg>
  );
}

function toAccessSet(keys: string[], allowed: readonly { key: string }[]) {
  const allowedKeys = new Set(allowed.map((page) => page.key));
  const next = new Set<string>();
  for (const key of keys) {
    if (allowedKeys.has(key)) {
      next.add(key);
      continue;
    }
    if (
      INFORMATION_EDITABLE_PAGE_KEYS.some(
        (page) => editAccessKey(page) === key && allowedKeys.has(page),
      )
    ) {
      next.add(key);
    }
  }
  return next;
}

function UserRow({
  user,
  platformMode,
  packagePageKeys,
  onUpdated,
  onRequestRemove,
  onMessage,
  readOnly = false,
}: {
  user: AppUser;
  platformMode: boolean;
  packagePageKeys: Set<string> | null;
  onUpdated: (user: AppUser) => void;
  onRequestRemove: (user: AppUser) => void;
  onMessage: (type: 'error' | 'info', text: string) => void;
  readOnly?: boolean;
}) {
  const allowedPages = platformMode
    ? PLATFORM_ACCESS_PAGES
    : ACCESS_PAGES.filter((page) => !packagePageKeys || packagePageKeys.has(page.key));
  const [accessDraft, setAccessDraft] = useState(() =>
    toAccessSet(user.menuAccess, allowedPages),
  );
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);

  useEffect(() => {
    setAccessDraft(toAccessSet(user.menuAccess, allowedPages));
  }, [user.id, user.menuAccess.join('|'), platformMode, packagePageKeys?.size]);

  const accessSections = platformMode
    ? PLATFORM_ACCESS_SECTIONS.filter((section) => platformPagesBySection(section).length > 0)
    : MENU_SECTIONS.filter((section) =>
        pagesBySection(section).some((page) => allowedPages.some((p) => p.key === page.key)),
      );

  function pagesForSection(section: string) {
    const pages = platformMode
      ? platformPagesBySection(section as (typeof PLATFORM_ACCESS_SECTIONS)[number])
      : pagesBySection(section as (typeof MENU_SECTIONS)[number]);
    return pages.filter((page) => allowedPages.some((p) => p.key === page.key));
  }

  function togglePage(key: AccessKey) {
    setAccessDraft((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        if (INFORMATION_EDITABLE_PAGE_KEYS.includes(key as MenuPageKey)) {
          next.delete(editAccessKey(key as MenuPageKey));
        }
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function togglePageEdit(pageKey: MenuPageKey) {
    const editKey = editAccessKey(pageKey);
    setAccessDraft((prev) => {
      const next = new Set(prev);
      if (next.has(editKey)) {
        next.delete(editKey);
      } else {
        next.add(pageKey);
        next.add(editKey);
      }
      return next;
    });
  }

  function isEditableInformationPage(pageKey: string): pageKey is MenuPageKey {
    return !platformMode && INFORMATION_EDITABLE_PAGE_KEYS.includes(pageKey as MenuPageKey);
  }

  async function onResetPassword() {
    setSavingPassword(true);
    try {
      const res = await fetch(`/api/users/${user.id}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to reset password');
      onMessage(
        body.whatsappOk === false ? 'error' : 'info',
        body.whatsappOk === false
          ? String(body.whatsappError || body.deliveryNote || 'WhatsApp send failed')
          : 'New Password Sent',
      );
    } catch (err) {
      onMessage('error', err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setSavingPassword(false);
    }
  }

  async function onSaveAccess() {
    setSavingAccess(true);
    try {
      const res = await fetch(`/api/users/${user.id}/access`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menuAccess: [...accessDraft] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to save access');
      onUpdated(body as AppUser);
      onMessage('info', `Access saved for ${user.userName}.`);
    } catch (err) {
      onMessage('error', err instanceof Error ? err.message : 'Failed to save access');
    } finally {
      setSavingAccess(false);
    }
  }

  return (
    <tr className={readOnly ? 'user-mgmt-sample-row' : undefined}>
      <td className="user-col-info">
        {readOnly ? <p className="user-sample-badge">Sample</p> : null}
        <p className="user-info-name">{user.userName}</p>
        <p>
          <strong>Mobile</strong> {user.mobile}
        </p>
        <p>
          <strong>Email</strong> {user.email?.trim() ? user.email : '—'}
        </p>
        <p>
          <strong>Created</strong> {formatCreatedAt(String(user.createdAt ?? ''))}
        </p>
        {!user.isAccountAdmin ? (
          <button
            type="button"
            className="terms-link"
            disabled={readOnly || savingPassword}
            onClick={() => void onResetPassword()}
          >
            {savingPassword ? 'Sending…' : 'Reset Password'}
          </button>
        ) : null}
      </td>

      <td className="user-col-access">
        <table className="user-access-grid">
          <tbody>
            {accessSections.map((section) => {
              const pages = pagesForSection(section);
              const allOn = pages.every((page) => accessDraft.has(page.key));
              const someOn = pages.some((page) => accessDraft.has(page.key));
              return (
                <tr key={section}>
                  <th scope="row">
                    <label className="user-access-page user-access-menu">
                      <input
                        type="checkbox"
                        checked={allOn}
                        disabled={readOnly}
                        ref={(el) => {
                          if (el) el.indeterminate = someOn && !allOn;
                        }}
                        onChange={() => {
                          if (readOnly) return;
                          setAccessDraft((prev) => {
                            const next = new Set(prev);
                            for (const page of pages) {
                              if (allOn) {
                                next.delete(page.key);
                                if (isEditableInformationPage(page.key)) {
                                  next.delete(editAccessKey(page.key));
                                }
                              } else {
                                next.add(page.key);
                              }
                            }
                            return next;
                          });
                        }}
                      />
                      <span>{section}</span>
                    </label>
                  </th>
                  <td>
                    <div className="user-access-pages">
                      {pages.map((page) => {
                        const withEdit = isEditableInformationPage(page.key);
                        return (
                          <span
                            key={page.key}
                            className={
                              withEdit ? 'user-access-page-group' : 'user-access-page-solo'
                            }
                          >
                            <label className="user-access-page">
                              <input
                                type="checkbox"
                                checked={accessDraft.has(page.key)}
                                disabled={readOnly}
                                onChange={() => togglePage(page.key)}
                              />
                              <span>{page.label}</span>
                            </label>
                            {isEditableInformationPage(page.key) ? (
                              <label
                                className={`user-access-page user-access-edit${
                                  accessDraft.has(page.key) ? '' : ' is-disabled'
                                }`}
                                title="Edit"
                                aria-label={`Edit access for ${page.label}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={accessDraft.has(editAccessKey(page.key))}
                                  disabled={readOnly || !accessDraft.has(page.key)}
                                  onChange={() => {
                                    if (isEditableInformationPage(page.key)) {
                                      togglePageEdit(page.key);
                                    }
                                  }}
                                />
                                <AccessEditIcon />
                              </label>
                            ) : null}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="user-reset-actions">
          {!user.isAccountAdmin ? (
            <button
              type="button"
              className="pass-cancel"
              disabled={readOnly || savingAccess}
              onClick={() => onRequestRemove(user)}
            >
              Remove user
            </button>
          ) : null}
          <button
            type="button"
            className="submit"
            disabled={readOnly || savingAccess}
            onClick={() => void onSaveAccess()}
          >
            {savingAccess ? 'Saving…' : 'Save access'}
          </button>
        </div>
      </td>
    </tr>
  );
}

const SAMPLE_TENANT_USER: AppUser = {
  id: -1,
  userName: 'Anita Sharma',
  mobile: '9876543210',
  email: 'anita@example.com',
  menuAccess: [
    'pool-core-info',
    'batches',
    'pass-types',
    'holiday-management',
    'pass-payment',
    'whatsapp',
    'swimmers',
    'swimmers-edit',
    'coaches',
    'coaches-edit',
    'register',
    'staff-register',
  ],
  createdAt: '2026-03-15T10:30:00.000Z',
  isAccountAdmin: false,
};

const SAMPLE_PLATFORM_USER: AppUser = {
  id: -1,
  userName: 'Platform Admin',
  mobile: '9123456780',
  email: 'admin@swimit.example',
  menuAccess: [
    'accounts',
    'create-account',
    'service-packages',
    'payment',
    'platform-users',
    'platform-create-user',
    'whatsapp',
  ],
  createdAt: '2026-02-01T09:00:00.000Z',
  isAccountAdmin: false,
};

export function UserManagement() {
  const { pathname } = useLocation();
  const platformMode = isPlatformUsersPath(pathname);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [packagePageKeys, setPackagePageKeys] = useState<Set<string> | null>(null);
  const [pendingRemove, setPendingRemove] = useState<AppUser | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    setInfo('');
    try {
      const res = await fetch('/api/users');
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to load users');
      const rows = (Array.isArray(body) ? body : []) as AppUser[];
      // Never keep client-only sample rows (id < 0) in live data.
      setUsers(rows.filter((u) => Number(u.id) > 0));
    } catch (err) {
      setUsers([]);
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (platformMode) {
      setPackagePageKeys(null);
      return;
    }
    const code = getActiveAccountCode();
    if (!code) {
      setPackagePageKeys(new Set(pageKeysForModules('core')));
      return;
    }
    let cancelled = false;
    void fetch(`/api/saas-accounts/by-code/${encodeURIComponent(code)}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        setPackagePageKeys(
          new Set(
            pageKeysForModules(
              String(body.modules ?? 'core'),
              String(body.packageName ?? ''),
            ),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setPackagePageKeys(new Set(pageKeysForModules('core')));
      });
    return () => {
      cancelled = true;
    };
  }, [platformMode]);

  function onMessage(type: 'error' | 'info', text: string) {
    if (type === 'error') {
      setError(text);
      setInfo('');
    } else {
      setInfo(text);
      setError('');
    }
  }

  async function confirmRemoveUser() {
    if (!pendingRemove) return;
    const target = pendingRemove;
    setRemovingId(target.id);
    setError('');
    setInfo('');
    try {
      const res = await fetch(`/api/users/${target.id}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to remove user');
      setUsers((prev) => prev.filter((row) => row.id > 0 && row.id !== target.id));
      setPendingRemove(null);
      setInfo(`${target.userName} removed.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove user');
    } finally {
      setRemovingId(null);
    }
  }

  const realUsers = users.filter((u) => u.id > 0);
  const samplePreview = realUsers.length === 0;

  return (
    <PlatformPage title="User Management">
      <CreateUserForm
        onCreated={(created) => {
          setError('');
          setInfo('');
          // Replace sample row immediately with the new user, then refresh from API.
          setUsers((prev) => {
            const real = prev.filter((u) => u.id > 0);
            if (!real.some((u) => u.id === created.id)) {
              return [...real, created];
            }
            return real;
          });
          void load();
        }}
      />

      {loading ? <p className="pass-empty">Loading…</p> : null}

      {!loading ? (
        <section
          className={`pass-form-card pool-core-form user-mgmt-card${
            samplePreview ? ' user-mgmt-card--sample' : ''
          }`}
        >
          {samplePreview ? (
            <div className="user-mgmt-sample-watermark" aria-hidden="true">
              Sample
            </div>
          ) : null}
          <h2>Users &amp; access</h2>
          {error ? <p className="error">{error}</p> : null}
          {info && !/^user created/i.test(info) ? (
            <p className="success">{info}</p>
          ) : null}
          {samplePreview ? (
            <p className="hint user-mgmt-sample-hint">
              Sample layout — create a user above to manage real access.
            </p>
          ) : null}
          <div className="user-mgmt-table-wrap">
            <table className="user-mgmt-table">
              <colgroup>
                <col className="user-col-info-col" />
                <col className="user-col-access-col" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">User information</th>
                  <th scope="col">Access Details</th>
                </tr>
              </thead>
              <tbody>
                {(samplePreview
                  ? [platformMode ? SAMPLE_PLATFORM_USER : SAMPLE_TENANT_USER]
                  : realUsers
                ).map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    platformMode={platformMode}
                    packagePageKeys={packagePageKeys}
                    readOnly={samplePreview}
                    onUpdated={(updated) =>
                      setUsers((prev) =>
                        prev
                          .filter((row) => row.id > 0)
                          .map((row) => (row.id === updated.id ? updated : row)),
                      )
                    }
                    onRequestRemove={(u) => {
                      setError('');
                      setInfo('');
                      setPendingRemove(u);
                    }}
                    onMessage={onMessage}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {pendingRemove ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-user-title"
          onClick={() => {
            if (removingId == null) setPendingRemove(null);
          }}
        >
          <div
            className="modal-panel accounts-delete-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="remove-user-title">Remove user?</h2>
            <p className="modal-intro">
              Remove <strong>{pendingRemove.userName}</strong>
              {pendingRemove.mobile ? ` (${pendingRemove.mobile})` : ''}? This permanently deletes
              their login and cannot be undone.
            </p>
            <div className="modal-footer accounts-delete-modal-footer">
              <button
                type="button"
                className="ghost-btn"
                disabled={removingId != null}
                onClick={() => setPendingRemove(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="submit accounts-delete-confirm"
                disabled={removingId != null}
                onClick={() => void confirmRemoveUser()}
              >
                {removingId != null ? 'Removing…' : 'Remove user'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PlatformPage>
  );
}
