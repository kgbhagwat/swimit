import { FormEvent, useEffect, useState } from 'react';
import { MenuBackLink } from './MenuBackLink';

type InboxItem = {
  id: number;
  registrationId: number | null;
  fromMobile: string;
  kind: string;
  caption: string;
  mimeType: string;
  filePath: string | null;
  status: string;
  createdAt: string;
};

type WaStatus = {
  enabled: boolean;
  phoneNumberIdSet: boolean;
  publicAppUrl: string | null;
};

export function WhatsAppMessaging() {
  const [status, setStatus] = useState<WaStatus | null>(null);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState('active_swimmers');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [expirySending, setExpirySending] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [statusRes, inboxRes] = await Promise.all([
        fetch('/api/whatsapp/status'),
        fetch('/api/whatsapp/inbox'),
      ]);
      const statusBody = await statusRes.json().catch(() => ({}));
      const inboxBody = await inboxRes.json().catch(() => ({}));
      if (!statusRes.ok) throw new Error(statusBody.error ?? 'Failed to load WhatsApp status');
      if (!inboxRes.ok) throw new Error(inboxBody.error ?? 'Failed to load inbox');
      setStatus(statusBody as WaStatus);
      setInbox(Array.isArray(inboxBody) ? (inboxBody as InboxItem[]) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load WhatsApp');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onBroadcast(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setError('');
    setInfo('');
    try {
      const res = await fetch('/api/whatsapp/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, audience }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Broadcast failed');
      setInfo(`Broadcast done: ${body.sent} sent, ${body.failed} failed (of ${body.total}).`);
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Broadcast failed');
    } finally {
      setSending(false);
    }
  }

  async function onExpiry() {
    setExpirySending(true);
    setError('');
    setInfo('');
    try {
      const res = await fetch('/api/whatsapp/notify-expiring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 7 }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Expiry notify failed');
      setInfo(`Pass expiry notices queued for ${body.count} swimmer(s).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Expiry notify failed');
    } finally {
      setExpirySending(false);
    }
  }

  return (
    <div className="page">
      <div className="top-row">
        <MenuBackLink />
      </div>

      <h1>WhatsApp</h1>
      <p className="lede">
        Send pool messages on WhatsApp and review inbound payment screenshots / certificates.
      </p>

      {loading ? <p className="pass-empty">Loading…</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {info ? <p className="success">{info}</p> : null}

      {status ? (
        <section className="pass-form-card" style={{ marginBottom: '1rem' }}>
          <p>
            <strong>Status:</strong>{' '}
            {status.enabled ? 'Connected' : 'Not configured (messages are logged / skipped)'}
          </p>
          {!status.enabled ? (
            <p className="muted">
              Set <code>WHATSAPP_TOKEN</code>, <code>WHATSAPP_PHONE_NUMBER_ID</code>, and{' '}
              <code>PUBLIC_APP_URL</code> on the server, then restart.
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="pass-form-card" style={{ marginBottom: '1rem' }}>
        <h2>Broadcast</h2>
        <form onSubmit={onBroadcast}>
          <label className="field">
            <span className="label">Audience</span>
            <select value={audience} onChange={(e) => setAudience(e.target.value)}>
              <option value="active_swimmers">Active swimmers</option>
              <option value="all_swimmers">All swimmers</option>
            </select>
          </label>
          <label className="field">
            <span className="label">Message</span>
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write a WhatsApp broadcast…"
              required
            />
          </label>
          <div className="pass-form-actions">
            <button type="submit" className="submit" disabled={sending || !message.trim()}>
              {sending ? 'Sending…' : 'Send broadcast'}
            </button>
            <button type="button" className="ghost-btn" onClick={() => void onExpiry()} disabled={expirySending}>
              {expirySending ? 'Sending…' : 'Send 7-day pass expiry notices'}
            </button>
          </div>
        </form>
      </section>

      <section className="pass-form-card">
        <div className="top-row">
          <h2>Inbound inbox</h2>
          <button type="button" className="ghost-btn" onClick={() => void load()}>
            Refresh
          </button>
        </div>
        {inbox.length === 0 ? (
          <p className="pass-empty">No inbound WhatsApp media yet.</p>
        ) : (
          <div className="batch-saved-table-wrap">
            <table className="batch-saved-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>From</th>
                  <th>Type</th>
                  <th>Caption</th>
                  <th>File</th>
                </tr>
              </thead>
              <tbody>
                {inbox.map((item) => (
                  <tr key={item.id}>
                    <td>{new Date(item.createdAt).toLocaleString()}</td>
                    <td>{item.fromMobile}</td>
                    <td>{item.kind}</td>
                    <td>{item.caption || '—'}</td>
                    <td>
                      {item.filePath ? (
                        <a href={item.filePath} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
