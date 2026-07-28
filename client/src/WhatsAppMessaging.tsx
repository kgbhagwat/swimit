import { FormEvent, useEffect, useState } from 'react';
import { isApplicationDemo } from './applicationDemo';
import { MenuBackLink } from './MenuBackLink';
import { getActiveSaasAccountId, setActiveTenant } from './tenantSession';

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
  tokenValid?: boolean;
  tokenError?: string | null;
  displayPhoneNumber?: string | null;
  verifiedName?: string | null;
};

async function ensureApplicationTenant() {
  if (!isApplicationDemo()) return;
  if (getActiveSaasAccountId() != null) return;
  const res = await fetch('/api/saas-accounts/by-code/swimit');
  if (!res.ok) return;
  const body = (await res.json()) as { id?: number; accountCode?: string };
  if (body.id && body.accountCode) {
    setActiveTenant({ id: Number(body.id), accountCode: String(body.accountCode) });
  }
}

export function WhatsAppMessaging() {
  const [status, setStatus] = useState<WaStatus | null>(null);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [message, setMessage] = useState('');
  const [testMobile, setTestMobile] = useState('');
  const [testMessage, setTestMessage] = useState('Hello from SwimIT WhatsApp test.');
  const [sendMode, setSendMode] = useState<'template' | 'text'>('text');
  const [audience, setAudience] = useState('active_swimmers');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [expirySending, setExpirySending] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      await ensureApplicationTenant();
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

  async function onTestSend(e: FormEvent) {
    e.preventDefault();
    setTestSending(true);
    setError('');
    setInfo('');
    try {
      const res = await fetch('/api/whatsapp/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mobile: testMobile,
          message: testMessage,
          mode: sendMode,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Test send failed');
      setInfo(
        body.mode === 'template'
          ? `Template hello_world sent to ${testMobile}. That is Meta’s sample text (not the box below). Check chat +1 555…`
          : `Custom text sent to ${testMobile}. If nothing arrives, first reply “Hi” to the +1 555… chat, then retry.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test send failed');
    } finally {
      setTestSending(false);
    }
  }

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

      {isApplicationDemo() ? (
        <p className="muted">
          Application preview is connected to live WhatsApp on staging. Use{' '}
          <strong>Send test message</strong> below (number must be on Meta’s allow list while the app
          is unpublished).
        </p>
      ) : null}

      {loading ? <p className="pass-empty">Loading…</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {info ? <p className="success">{info}</p> : null}

      {status ? (
        <section className="pass-form-card" style={{ marginBottom: '1rem' }}>
          <p>
            <strong>Status:</strong>{' '}
            {!status.enabled
              ? 'Not configured (messages are logged / skipped)'
              : status.tokenValid
                ? `Connected${status.displayPhoneNumber ? ` (${status.displayPhoneNumber})` : ''}`
                : 'Token invalid / expired'}
          </p>
          {!status.enabled ? (
            <p className="muted">
              Set <code>WHATSAPP_TOKEN</code>, <code>WHATSAPP_PHONE_NUMBER_ID</code>, and{' '}
              <code>PUBLIC_APP_URL</code> on the server, then recreate the app container.
            </p>
          ) : null}
          {status.enabled && status.tokenValid === false ? (
            <p className="error" style={{ marginBottom: 0 }}>
              {status.tokenError ||
                'WHATSAPP_TOKEN on the server is not accepted by Meta. Paste a fresh token into .env and recreate the app container.'}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="pass-form-card" style={{ marginBottom: '1rem' }}>
        <h2>Send test message</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          <strong>App → WhatsApp:</strong> messages you send from here.
          <br />
          <strong>WhatsApp → App:</strong> photos/docs people send to the business number show in Inbound inbox
          below.
        </p>
        <form onSubmit={onTestSend}>
          <label className="field">
            <span className="label">WhatsApp mobile (10 digits)</span>
            <input
              value={testMobile}
              onChange={(e) => setTestMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
              inputMode="numeric"
              placeholder="98XXXXXXXX"
              required
            />
          </label>
          <label className="field">
            <span className="label">Send as</span>
            <select
              value={sendMode}
              onChange={(e) => setSendMode(e.target.value === 'template' ? 'template' : 'text')}
            >
              <option value="text">Custom text (message box below)</option>
              <option value="template">Meta hello_world template (sample text)</option>
            </select>
          </label>
          <label className="field">
            <span className="label">Message (used for custom text)</span>
            <textarea
              rows={3}
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              required={sendMode === 'text'}
              disabled={sendMode === 'template'}
            />
          </label>
          {sendMode === 'text' ? (
            <p className="muted">
              Custom text usually works only after that person replies once to the Meta test chat (+1 555…). Reply
              “Hi” there, then send.
            </p>
          ) : (
            <p className="muted">Template always sends Meta’s fixed “Welcome and congratulations…” sample.</p>
          )}
          <div className="pass-form-actions">
            <button
              type="submit"
              className="submit"
              disabled={
                testSending ||
                testMobile.length !== 10 ||
                (sendMode === 'text' && !testMessage.trim())
              }
            >
              {testSending ? 'Sending…' : 'Send test message'}
            </button>
          </div>
        </form>
      </section>

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
          <p className="pass-empty">
            No inbound WhatsApp media yet. Send a photo/text to Meta’s test number, then Refresh. In Meta → Step
            2 → Configure Webhooks, confirm <code>messages</code> is subscribed. While the app is unpublished,
            also check Meta’s “Check test webhooks” log after you send.
          </p>
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
