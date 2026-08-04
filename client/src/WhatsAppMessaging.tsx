import { FormEvent, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { isApplicationDemo } from './applicationDemo';
import { isValidMobile, MOBILE_INVALID_MSG } from './formValidation';
import { MobileField } from './MobileField';
import { PlatformPage } from './PlatformPage';
import { getActiveSaasAccountId, setActiveTenant } from './tenantSession';

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
  const { pathname } = useLocation();
  const showTestSend = pathname.startsWith('/platform/whatsapp');

  const [message, setMessage] = useState('');
  const [testMobile, setTestMobile] = useState('');
  const [testMessage, setTestMessage] = useState('Hello from SwimIT WhatsApp test.');
  const [sendMode, setSendMode] = useState<'template' | 'text'>('text');
  const [audience, setAudience] = useState('active_swimmers');
  const [sending, setSending] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [expirySaving, setExpirySaving] = useState(false);
  const [expiryNoticesEnabled, setExpiryNoticesEnabled] = useState(false);
  const [expiryDays, setExpiryDays] = useState('3');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const demoMode = isApplicationDemo();

  useEffect(() => {
    void (async () => {
      await ensureApplicationTenant();
      if (isApplicationDemo()) return;
      try {
        const res = await fetch('/api/whatsapp/pass-expiry-notice');
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return;
        setExpiryNoticesEnabled(Boolean(body.enabled));
        setExpiryDays(String(Math.min(9, Math.max(1, Number(body.days) || 3))));
      } catch {
        /* ignore */
      }
    })();
  }, []);

  async function saveExpiryNoticeSetting(enabled: boolean, daysValue: string) {
    if (isApplicationDemo()) return;
    const days = Math.min(9, Math.max(1, Number(daysValue) || 3));
    setExpirySaving(true);
    setError('');
    try {
      const res = await fetch('/api/whatsapp/pass-expiry-notice', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, days }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to save expiry notice setting');
      setExpiryNoticesEnabled(Boolean(body.enabled));
      setExpiryDays(String(body.days ?? days));
      setInfo(
        body.enabled
          ? `Daily morning WhatsApp notices enabled for passes expiring in ${body.days} day${
              Number(body.days) === 1 ? '' : 's'
            }.`
          : 'Daily pass expiry WhatsApp notices turned off.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save expiry notice setting');
      setExpiryNoticesEnabled(false);
    } finally {
      setExpirySaving(false);
    }
  }

  function onExpiryToggle(checked: boolean) {
    if (demoMode) {
      setExpiryNoticesEnabled(checked);
      return;
    }
    setExpiryNoticesEnabled(checked);
    void saveExpiryNoticeSetting(checked, expiryDays);
  }

  function onExpiryDaysChange(raw: string) {
    const next = raw.replace(/\D/g, '').slice(0, 1);
    if (!(next === '' || (Number(next) >= 1 && Number(next) <= 9))) return;
    setExpiryDays(next === '' ? '' : next);
    if (demoMode) return;
  }

  function onExpiryDaysBlur() {
    const days = !expiryDays || Number(expiryDays) < 1 ? '3' : expiryDays;
    setExpiryDays(days);
    if (demoMode) return;
    if (expiryNoticesEnabled) void saveExpiryNoticeSetting(true, days);
  }

  async function onTestSend(e: FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!isValidMobile(testMobile)) {
      setError(MOBILE_INVALID_MSG);
      return;
    }
    setTestSending(true);
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

  return (
    <PlatformPage title="WhatsApp">
      <p className="lede batch-list-lede">
        Send broadcast messages on WhatsApp to active swimmers or staff.
      </p>

      {error ? <p className="error">{error}</p> : null}
      {info ? <p className="success">{info}</p> : null}

      {showTestSend ? (
        <section className="pass-form-card pool-core-form" style={{ marginBottom: '1rem' }}>
          <h2>Send test message</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            <strong>App → WhatsApp:</strong> messages you send from here.
          </p>
          <form onSubmit={onTestSend}>
            <MobileField
              label="WhatsApp mobile"
              value={testMobile}
              onChange={setTestMobile}
              required
              placeholder="98XXXXXXXX"
            />
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
                Custom text usually works only after that person replies once to the Meta test chat (+1
                555…). Reply “Hi” there, then send.
              </p>
            ) : (
              <p className="muted">
                Template always sends Meta’s fixed “Welcome and congratulations…” sample.
              </p>
            )}
            <div className="pass-form-actions">
              <button
                type="submit"
                className="submit"
                disabled={
                  testSending ||
                  !isValidMobile(testMobile) ||
                  (sendMode === 'text' && !testMessage.trim())
                }
              >
                {testSending ? 'Sending…' : 'Send test message'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="pass-form-card pool-core-form whatsapp-broadcast-card">
        <h2 className="whatsapp-broadcast-title">
          Broadcast
          <span className="whatsapp-per-message-note">(per message charges applicable)</span>
        </h2>
        <form className="pass-form" onSubmit={onBroadcast}>
          <label className="field whatsapp-audience-field">
            <span className="label">Audience</span>
            <select value={audience} onChange={(e) => setAudience(e.target.value)}>
              <option value="active_swimmers">Active Swimmers</option>
              <option value="all_staff">All staff</option>
            </select>
          </label>
          <div className="whatsapp-message-block">
            <label className="field whatsapp-message-field">
              <span className="label">Message</span>
              <textarea
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write a WhatsApp broadcast…"
                required
              />
            </label>
            <button
              type="submit"
              className="submit whatsapp-send-broadcast"
              disabled={sending || !message.trim()}
            >
              {sending ? 'Sending…' : 'Send broadcast'}
            </button>
          </div>
        </form>
      </section>

      <div className="whatsapp-expiry-row">
        <div className="whatsapp-expiry-sentence">
          <label className="whatsapp-expiry-check">
            <input
              type="checkbox"
              checked={expiryNoticesEnabled}
              onChange={(e) => onExpiryToggle(e.target.checked)}
              disabled={expirySaving}
            />
            <span>Send pass expiry message before</span>
          </label>
          <input
            type="text"
            inputMode="numeric"
            className="whatsapp-expiry-days-input"
            maxLength={1}
            value={expiryDays}
            onChange={(e) => onExpiryDaysChange(e.target.value)}
            onBlur={onExpiryDaysBlur}
            disabled={expirySaving}
            aria-label="Days before expiry"
          />
          <span>days of expiry.</span>
          <span className="whatsapp-per-message-note">(per message charges applicable)</span>
        </div>
      </div>
    </PlatformPage>
  );
}
