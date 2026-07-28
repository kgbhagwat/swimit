import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MenuBackLink } from './MenuBackLink';
import { PlatformNav } from './PlatformNav';

type Account = {
  id: number;
  accountName: string;
  contactName: string;
  mobile: string;
  email: string;
  city: string;
  poolAddress?: string;
  accountCode?: string;
  createdAt?: string;
};

type ResentCredentials = {
  id: number;
  accountName: string;
  contactName: string;
  mobile: string;
  email: string;
  city: string;
  poolAddress?: string;
  accountCode: string;
  loginUrl: string;
  deliveryNote: string;
  adminUser: {
    userName: string;
    temporaryPassword: string;
  };
};

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

function accountLoginUrl(code: string) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
  return `${origin}/${code}`;
}

function credentialsMailto(created: ResentCredentials) {
  if (!created.email) return '';
  return `mailto:${encodeURIComponent(created.email)}?subject=${encodeURIComponent(
    `SwimIT account ${created.accountCode}`,
  )}&body=${encodeURIComponent(
    [
      `Hello ${created.contactName},`,
      '',
      'Your SwimIT account login details were reset. Please sign in and change the password.',
      '',
      `Account / pool: ${created.accountName}`,
      created.poolAddress ? `Pool address: ${created.poolAddress}` : null,
      created.city ? `City: ${created.city}` : null,
      `Account code: ${created.accountCode}`,
      `Login URL: ${created.loginUrl}`,
      `Admin user: ${created.adminUser.userName}`,
      `Temporary password: ${created.adminUser.temporaryPassword}`,
      '',
      'Please change the admin password on next login.',
    ]
      .filter(Boolean)
      .join('\n'),
  )}`;
}

export function Accounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resendingId, setResendingId] = useState<number | null>(null);
  const [resent, setResent] = useState<ResentCredentials | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/saas-accounts');
        const body = await res.json().catch(() => []);
        if (!res.ok) throw new Error(body.error ?? 'Failed to load accounts');
        if (!cancelled) setAccounts(Array.isArray(body) ? body : []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load accounts');
          setAccounts([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onResend(account: Account) {
    if (
      !window.confirm(
        `Reset admin password for "${account.accountName}" to temporary "admin" and show login details to send again?`,
      )
    ) {
      return;
    }
    setError('');
    setResendingId(account.id);
    try {
      const res = await fetch(`/api/saas-accounts/${account.id}/resend-credentials`, {
        method: 'POST',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to resend credentials');
      setResent({
        id: Number(body.id),
        accountName: String(body.accountName ?? ''),
        contactName: String(body.contactName ?? ''),
        mobile: String(body.mobile ?? ''),
        email: String(body.email ?? ''),
        city: String(body.city ?? ''),
        poolAddress: String(body.poolAddress ?? ''),
        accountCode: String(body.accountCode ?? ''),
        loginUrl: String(body.loginUrl ?? accountLoginUrl(String(body.accountCode ?? ''))),
        deliveryNote: String(body.deliveryNote ?? ''),
        adminUser: {
          userName: String(body.adminUser?.userName ?? 'admin'),
          temporaryPassword: String(body.adminUser?.temporaryPassword ?? 'admin'),
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend credentials');
    } finally {
      setResendingId(null);
    }
  }

  if (resent) {
    const mailto = credentialsMailto(resent);
    return (
      <>
        <PlatformNav />
        <div className="page">
        <div className="top-row">
          <button type="button" className="menu-link" onClick={() => setResent(null)}>
            ← Accounts
          </button>
        </div>

        <h1>Credentials ready to resend</h1>
        <p className="lede">
          Admin password was reset. Send these details to the pool operator again.
        </p>

        <section className="pass-form-card account-credentials-card">
          <p className="success">{resent.deliveryNote}</p>

          <dl className="account-credentials-list">
            <div>
              <dt>Account / pool</dt>
              <dd>{resent.accountName}</dd>
            </div>
            {resent.poolAddress ? (
              <div>
                <dt>Pool address</dt>
                <dd>{resent.poolAddress}</dd>
              </div>
            ) : null}
            {resent.city ? (
              <div>
                <dt>City</dt>
                <dd>{resent.city}</dd>
              </div>
            ) : null}
            <div>
              <dt>Contact</dt>
              <dd>
                {resent.contactName}
                <br />
                {resent.mobile}
                {resent.email ? ` · ${resent.email}` : ''}
              </dd>
            </div>
            <div>
              <dt>Account code</dt>
              <dd>
                <code>{resent.accountCode}</code>
              </dd>
            </div>
            <div>
              <dt>Login URL</dt>
              <dd>
                <a className="terms-link" href={resent.loginUrl} target="_blank" rel="noreferrer">
                  {resent.loginUrl}
                </a>
              </dd>
            </div>
            <div>
              <dt>Admin user</dt>
              <dd>
                <code>{resent.adminUser.userName}</code>
              </dd>
            </div>
            <div>
              <dt>Temporary password</dt>
              <dd>
                <code className="temp-password">{resent.adminUser.temporaryPassword}</code>
              </dd>
            </div>
          </dl>

          <div className="submit-wrap" style={{ marginTop: '1rem' }}>
            {mailto ? (
              <a className="ghost-btn" href={mailto}>
                Email details
              </a>
            ) : null}
            <button type="button" className="submit" onClick={() => setResent(null)}>
              Back to Accounts
            </button>
          </div>
        </section>
      </div>
      </>
    );
  }

  return (
    <>
      <PlatformNav />
      <div className="page">
      <div className="top-row">
        <MenuBackLink />
        <div className="top-row-right">
          <Link className="submit" to="/create-account">
            Create Account
          </Link>
        </div>
      </div>

      <h1>Accounts</h1>
      <p className="lede">All SwimIT SaaS pool operator accounts.</p>

      {error ? <p className="error">{error}</p> : null}

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
          <div className="batch-saved-table-wrap">
            <table className="batch-saved-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Code</th>
                  <th>Contact</th>
                  <th>Login link</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong className="batch-saved-name">{item.accountName}</strong>
                      {item.poolAddress ? (
                        <div className="muted" style={{ fontSize: '0.85rem' }}>
                          {item.poolAddress}
                        </div>
                      ) : null}
                      {item.city ? (
                        <div className="muted" style={{ fontSize: '0.85rem' }}>
                          {item.city}
                        </div>
                      ) : null}
                    </td>
                    <td>{item.accountCode || '—'}</td>
                    <td>
                      {item.contactName}
                      <div className="muted" style={{ fontSize: '0.85rem' }}>
                        {item.mobile}
                        {item.email ? ` · ${item.email}` : ''}
                      </div>
                    </td>
                    <td>
                      {item.accountCode ? (
                        <a className="terms-link" href={accountLoginUrl(item.accountCode)}>
                          /{item.accountCode}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{formatCreated(item.createdAt)}</td>
                    <td>
                      <button
                        type="button"
                        className="ghost-btn"
                        disabled={resendingId === item.id || !item.accountCode}
                        onClick={() => void onResend(item)}
                      >
                        {resendingId === item.id ? 'Resetting…' : 'Resend'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
    </>
  );
}
