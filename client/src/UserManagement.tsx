import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MenuBackLink } from './MenuBackLink';
import {
  ACCESS_PAGES,
  MENU_SECTIONS,
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
  isPlatformUsersPath,
  platformUsersPath,
  tenantPath,
} from './tenantSession';

type AppUser = {
  id: number;
  userName: string;
  mobile: string;
  email?: string;
  menuAccess: string[];
  createdAt: string;
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

function toAccessSet(keys: string[], allowed: readonly { key: string }[]) {
  return new Set(keys.filter((key) => allowed.some((page) => page.key === key)));
}

function UserRow({
  user,
  platformMode,
  onUpdated,
  onMessage,
}: {
  user: AppUser;
  platformMode: boolean;
  onUpdated: (user: AppUser) => void;
  onMessage: (type: 'error' | 'info', text: string) => void;
}) {
  const allowedPages = platformMode ? PLATFORM_ACCESS_PAGES : ACCESS_PAGES;
  const [accessDraft, setAccessDraft] = useState(() =>
    toAccessSet(user.menuAccess, allowedPages),
  );
  const [showReset, setShowReset] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);

  useEffect(() => {
    setAccessDraft(toAccessSet(user.menuAccess, allowedPages));
  }, [user.id, user.menuAccess.join('|'), platformMode]);

  const accessSections = platformMode
    ? PLATFORM_ACCESS_SECTIONS.filter((section) => platformPagesBySection(section).length > 0)
    : MENU_SECTIONS.filter((section) => pagesBySection(section).length > 0);

  function pagesForSection(section: string) {
    return platformMode
      ? platformPagesBySection(section as (typeof PLATFORM_ACCESS_SECTIONS)[number])
      : pagesBySection(section as (typeof MENU_SECTIONS)[number]);
  }

  function togglePage(key: AccessKey) {
    setAccessDraft((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function onResetPassword() {
    if (!confirm(`Generate a new random password for ${user.userName} and send it on WhatsApp?`)) {
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch(`/api/users/${user.id}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to reset password');
      setShowReset(false);
      const temp =
        typeof body.temporaryPassword === 'string' && body.temporaryPassword
          ? ` Temporary password: ${body.temporaryPassword}.`
          : '';
      const note =
        typeof body.deliveryNote === 'string' && body.deliveryNote ? ` ${body.deliveryNote}` : '';
      onMessage('info', `Password reset for ${user.userName}.${temp}${note}`);
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
    <tr>
      <td className="user-col-info">
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
        {!showReset ? (
          <button type="button" className="terms-link" onClick={() => setShowReset(true)}>
            Reset Password
          </button>
        ) : (
          <div className="user-reset-actions">
            <button
              type="button"
              className="csv-btn"
              disabled={savingPassword}
              onClick={() => void onResetPassword()}
            >
              {savingPassword ? 'Resetting…' : 'Generate & send'}
            </button>
            <button
              type="button"
              className="terms-link"
              onClick={() => setShowReset(false)}
              disabled={savingPassword}
            >
              Cancel
            </button>
          </div>
        )}
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
                        ref={(el) => {
                          if (el) el.indeterminate = someOn && !allOn;
                        }}
                        onChange={() => {
                          setAccessDraft((prev) => {
                            const next = new Set(prev);
                            for (const page of pages) {
                              if (allOn) next.delete(page.key);
                              else next.add(page.key);
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
                      {pages.map((page) => (
                        <label key={page.key} className="user-access-page">
                          <input
                            type="checkbox"
                            checked={accessDraft.has(page.key)}
                            onChange={() => togglePage(page.key)}
                          />
                          <span>{page.label}</span>
                        </label>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="user-reset-actions">
          <button
            type="button"
            className="submit"
            disabled={savingAccess}
            onClick={() => void onSaveAccess()}
          >
            {savingAccess ? 'Saving…' : 'Save access'}
          </button>
        </div>
      </td>
    </tr>
  );
}

export function UserManagement() {
  const { pathname } = useLocation();
  const platformMode = isPlatformUsersPath(pathname);
  const createUserTo = platformMode
    ? platformUsersPath('/create-user')
    : tenantPath('/create-user');
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/users');
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to load users');
      setUsers((Array.isArray(body) ? body : []) as AppUser[]);
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

  function onMessage(type: 'error' | 'info', text: string) {
    if (type === 'error') {
      setError(text);
      setInfo('');
    } else {
      setInfo(text);
      setError('');
    }
  }

  return (
    <div className="page">
      <div className="top-row">
        <MenuBackLink />
        <div className="top-row-right">
          <Link className="submit" to={createUserTo}>
            Create User
          </Link>
        </div>
      </div>

      <h1>User Management</h1>
      {platformMode ? (
        <p className="lede">Manage SwimIT SaaS platform login users and platform menu access.</p>
      ) : null}

      {loading ? <p className="pass-empty">Loading…</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {info ? <p className="success">{info}</p> : null}

      {!loading && users.length === 0 ? (
        <section className="pass-form-card">
          <p className="pass-empty">No users created yet.</p>
          <div className="pass-form-actions">
            <Link className="submit" to={createUserTo}>
              Create User
            </Link>
          </div>
        </section>
      ) : null}

      {!loading && users.length > 0 ? (
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
              {users.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  platformMode={platformMode}
                  onUpdated={(updated) =>
                    setUsers((prev) => prev.map((row) => (row.id === updated.id ? updated : row)))
                  }
                  onMessage={onMessage}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
