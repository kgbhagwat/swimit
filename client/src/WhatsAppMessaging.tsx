import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { isApplicationDemo } from './applicationDemo';
import { isValidMobile, MOBILE_INVALID_MSG } from './formValidation';
import { InPageSelect } from './InPageSelect';
import { useT } from './i18n';
import { MobileField } from './MobileField';
import { PlatformPage } from './PlatformPage';
import { getActiveSaasAccountId, setActiveTenant, tenantPath } from './tenantSession';
import { fetchWhatsAppNoticeSettings } from './whatsappCharges';

type PoolAccountOption = {
  accountCode: string;
  accountName: string;
  status: string;
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

function normalizePoolCode(value: string) {
  return value.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toLowerCase();
}

type GatewayStatus = {
  enabled: boolean;
  phoneNumberIdSet: boolean;
  publicAppUrl: string | null;
  tokenValid: boolean;
  tokenError: string | null;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
};

export function WhatsAppMessaging() {
  const t = useT();
  const { pathname } = useLocation();
  const showTestSend = pathname.startsWith('/platform/whatsapp');

  const [message, setMessage] = useState('');
  const [testMobile, setTestMobile] = useState('');
  const [testMessage, setTestMessage] = useState('Hello from SwimIT WhatsApp test.');
  const [sendMode, setSendMode] = useState<'template' | 'text'>('text');
  const [audience, setAudience] = useState('active_swimmers');
  const [poolCode, setPoolCode] = useState('');
  const [poolOptions, setPoolOptions] = useState<PoolAccountOption[]>([]);
  const [poolsLoading, setPoolsLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [broadcastEnabled, setBroadcastEnabled] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(!showTestSend);

  useEffect(() => {
    void ensureApplicationTenant();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setStatusLoading(true);
      try {
        const res = await fetch('/api/whatsapp/status');
        const body = (await res.json().catch(() => ({}))) as Partial<GatewayStatus>;
        if (cancelled) return;
        setGatewayStatus({
          enabled: Boolean(body.enabled),
          phoneNumberIdSet: Boolean(body.phoneNumberIdSet),
          publicAppUrl: body.publicAppUrl ? String(body.publicAppUrl) : null,
          tokenValid: Boolean(body.tokenValid),
          tokenError: body.tokenError ? String(body.tokenError) : null,
          displayPhoneNumber: body.displayPhoneNumber ? String(body.displayPhoneNumber) : null,
          verifiedName: body.verifiedName ? String(body.verifiedName) : null,
        });
      } catch {
        if (!cancelled) setGatewayStatus(null);
      } finally {
        if (!cancelled) setStatusLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (showTestSend) {
      setSettingsLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setSettingsLoading(true);
      const settings = await fetchWhatsAppNoticeSettings();
      if (!cancelled) {
        setBroadcastEnabled(Boolean(settings?.broadcastEnabled));
        setSettingsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showTestSend]);

  useEffect(() => {
    if (!showTestSend) return;
    let cancelled = false;
    void (async () => {
      setPoolsLoading(true);
      try {
        const res = await fetch('/api/saas-accounts');
        const body = await res.json().catch(() => []);
        if (!res.ok || cancelled) return;
        const rows = (Array.isArray(body) ? body : []) as Array<Record<string, unknown>>;
        const options = rows
          .map((row) => ({
            accountCode: normalizePoolCode(String(row.accountCode ?? '')),
            accountName: String(row.accountName ?? '').trim(),
            status: String(row.status ?? '').trim(),
          }))
          .filter(
            (row) =>
              /^[a-z0-9]{6}$/.test(row.accountCode) &&
              row.accountCode !== 'swimit' &&
              row.status.toLowerCase() === 'active',
          )
          .sort((a, b) => a.accountCode.localeCompare(b.accountCode));
        setPoolOptions(options);
        setPoolCode((prev) => {
          if (prev && options.some((o) => o.accountCode === prev)) return prev;
          return options[0]?.accountCode ?? '';
        });
      } catch {
        if (!cancelled) setPoolOptions([]);
      } finally {
        if (!cancelled) setPoolsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showTestSend]);

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
          ? `${t('Template hello_world sent to')} ${testMobile}. ${t('That is Meta’s sample text (not the box below). Check chat +1 555…')}`
          : `${t('Custom text sent to')} ${testMobile}. ${t('If nothing arrives, first reply “Hi” to the +1 555… chat, then retry.')}`,
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
    const needsPoolCode =
      showTestSend &&
      (audience === 'active_swimmers' || audience === 'all_staff');
    if (!showTestSend && !isApplicationDemo() && !broadcastEnabled) {
      setError(
        t('Turn on WhatsApp broadcast messages on Pass Type before sending broadcasts.'),
      );
      setSending(false);
      return;
    }
    try {
      if (needsPoolCode) {
        const code = normalizePoolCode(poolCode);
        if (!/^[a-z0-9]{6}$/.test(code)) {
          setError('Select a swimming pool code');
          setSending(false);
          return;
        }
      }
      const res = await fetch('/api/whatsapp/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          audience,
          ...(needsPoolCode ? { accountCode: normalizePoolCode(poolCode) } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Broadcast failed');
      const codeNote = body.accountCode ? ` — ${body.accountCode}` : '';
      setInfo(
        `${t('Broadcast done')}${codeNote}: ${body.sent} ${t('sent')}, ${body.failed} ${t('failed (of')} ${body.total}).`,
      );
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Broadcast failed');
    } finally {
      setSending(false);
    }
  }

  const needsPoolCode =
    showTestSend && (audience === 'active_swimmers' || audience === 'all_staff');

  const audienceOptions = useMemo(
    () => [
      { value: 'active_swimmers', label: t('Active Swimmers') },
      { value: 'all_staff', label: t('All staff') },
      ...(showTestSend
        ? [
            { value: 'active_account_admins', label: t('Active account Admins') },
            { value: 'active_account_users', label: t('Active account users') },
          ]
        : []),
    ],
    [showTestSend, t],
  );

  const sendModeOptions = useMemo(
    () => [
      { value: 'text', label: t('Custom text (message box below)') },
      { value: 'template', label: t('Meta hello_world template (sample text)') },
    ],
    [t],
  );

  const poolSelectOptions = useMemo(() => {
    if (poolsLoading) return [{ value: '', label: t('Loading…') }];
    if (poolOptions.length === 0) return [{ value: '', label: t('No active pools') }];
    return poolOptions.map((opt) => ({
      value: opt.accountCode,
      label: opt.accountName ? `${opt.accountCode} — ${opt.accountName}` : opt.accountCode,
    }));
  }, [poolOptions, poolsLoading, t]);

  if (!showTestSend && !isApplicationDemo() && !settingsLoading && !broadcastEnabled) {
    return <Navigate to={tenantPath('/pass-types')} replace />;
  }

  return (
    <PlatformPage
      title={showTestSend ? 'WhatsApp' : 'WhatsApp Broadcast'}
      className={`whatsapp-page${showTestSend ? ' whatsapp-page--saas' : ''}`}
    >
      <p className="lede batch-list-lede">
        {t('Send broadcast messages on WhatsApp to active swimmers or staff.')}
      </p>

      <div
        className={`whatsapp-gateway-status${
          gatewayStatus?.enabled && gatewayStatus.tokenValid
            ? ' whatsapp-gateway-status--ok'
            : ' whatsapp-gateway-status--off'
        }`}
        role="status"
      >
        {statusLoading ? (
          <span>{t('Checking WhatsApp connection…')}</span>
        ) : gatewayStatus?.enabled && gatewayStatus.tokenValid ? (
          <span>
            <strong>{t('Connected')}</strong>
            {` — ${t('Ready to send messages to swimmers and staff.')}`}
          </span>
        ) : (
          <span>
            <strong>{t('Not connected')}</strong>
            {' — '}
            {gatewayStatus?.tokenError
              ? gatewayStatus.tokenError
              : t(
                  'Set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID in server .env, then restart the server.',
                )}
          </span>
        )}
      </div>

      {error ? <p className="error">{t(error)}</p> : null}
      {info ? <p className="success">{info}</p> : null}

      {showTestSend ? (
        <section className="pass-form-card pool-core-form" style={{ marginBottom: '1rem' }}>
          <h2>{t('Send test message')}</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            <strong>{t('App → WhatsApp:')}</strong> {t('messages you send from here.')}
          </p>
          <form onSubmit={onTestSend}>
            <MobileField
              label={t('WhatsApp mobile')}
              value={testMobile}
              onChange={setTestMobile}
              required
              placeholder="98XXXXXXXX"
            />
            <label className="field">
              <span className="label">{t('Send as')}</span>
              <InPageSelect
                value={sendMode}
                onChange={(value) => setSendMode(value === 'template' ? 'template' : 'text')}
                options={sendModeOptions}
                required
                aria-label={t('Send as')}
              />
            </label>
            <label className="field">
              <span className="label">{t('Message (used for custom text)')}</span>
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
                {t(
                  'Custom text usually works only after that person replies once to the Meta test chat (+1 555…). Reply “Hi” there, then send.',
                )}
              </p>
            ) : (
              <p className="muted">
                {t('Template always sends Meta’s fixed “Welcome and congratulations…” sample.')}
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
                {testSending ? t('Sending…') : t('Send test message')}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="pass-form-card pool-core-form whatsapp-broadcast-card">
        <h2 className="whatsapp-broadcast-title">{t('Broadcast')}</h2>
        <form className="pass-form" onSubmit={onBroadcast}>
          <div className="whatsapp-audience-row">
            <div className="field whatsapp-audience-field field-beside">
              <span className="label">{t('Audience')}</span>
              <InPageSelect
                value={audience}
                onChange={setAudience}
                options={audienceOptions}
                required
                aria-label={t('Audience')}
              />
            </div>
            {needsPoolCode ? (
              <div className="field whatsapp-pool-code-field field-beside">
                <span className="label">
                  {t('Swimming pool code')} <span className="req">*</span>
                </span>
                <InPageSelect
                  value={poolCode}
                  onChange={(value) => setPoolCode(normalizePoolCode(value))}
                  options={poolSelectOptions}
                  required
                  disabled={poolsLoading || poolOptions.length === 0}
                  aria-label={t('Swimming pool code')}
                />
              </div>
            ) : null}
          </div>
          <div className="whatsapp-message-block">
            <label className="field whatsapp-message-field">
              <span className="label">{t('Message')}</span>
              <textarea
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('Write a WhatsApp broadcast…')}
                required
              />
            </label>
            <button
              type="submit"
              className="submit whatsapp-send-broadcast"
              disabled={
                sending ||
                !message.trim() ||
                (!showTestSend && !isApplicationDemo() && !broadcastEnabled) ||
                (needsPoolCode &&
                  (poolOptions.length === 0 || !/^[a-z0-9]{6}$/.test(poolCode)))
              }
            >
              {sending ? t('Sending…') : t('Send broadcast')}
            </button>
          </div>
        </form>
      </section>
    </PlatformPage>
  );
}
