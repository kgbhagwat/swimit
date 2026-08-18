import { useEffect, useState } from 'react';
import { isApplicationDemo } from './applicationDemo';
import { useT } from './i18n';
import { readTenantSessionAccess } from './pageAccess';
import {
  fetchWhatsAppNoticeSettings,
  saveWhatsAppNoticeSettings,
  type WhatsAppNoticeSettings,
} from './whatsappCharges';

function canChangeWhatsAppTicks() {
  if (isApplicationDemo()) return true;
  const session = readTenantSessionAccess();
  if (!session) return true;
  if (session.isAccountAdmin) return true;
  return session.menuAccess.includes('pass-types');
}

export function WhatsAppChargesCard() {
  const t = useT();
  const canEdit = canChangeWhatsAppTicks();
  const [expiryEnabled, setExpiryEnabled] = useState(false);
  const [expiryDays, setExpiryDays] = useState(3);
  const [broadcastEnabled, setBroadcastEnabled] = useState(false);
  const [editing, setEditing] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  function applySettings(body: WhatsAppNoticeSettings) {
    setExpiryEnabled(body.enabled);
    setExpiryDays(body.days);
    setBroadcastEnabled(body.broadcastEnabled);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setSettingsLoading(true);
      const settings = await fetchWhatsAppNoticeSettings();
      if (cancelled) return;
      if (settings) {
        applySettings(settings);
        setEditing(!settings.chargesAccepted);
      } else {
        setEditing(true);
      }
      setSettingsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSave() {
    if (!canEdit) return;
    setError('');
    setInfo('');
    setSaving(true);
    try {
      const settings = await saveWhatsAppNoticeSettings({
        enabled: expiryEnabled,
        days: expiryDays,
        broadcastEnabled,
      });
      applySettings(settings);
      setEditing(false);
      setInfo(t('WhatsApp settings saved.'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save WhatsApp settings');
    } finally {
      setSaving(false);
    }
  }

  function onEdit() {
    if (!canEdit) return;
    setError('');
    setInfo('');
    setEditing(true);
  }

  const fieldsLocked = !canEdit || !editing || saving;

  return (
    <section className="pass-form-card pool-core-form whatsapp-broadcast-card whatsapp-setup-card">
      <h2 className="whatsapp-broadcast-title">
        {t('WhatsApp charges')}
        <span className="whatsapp-per-message-note">{t('₹1 per message')}</span>
      </h2>
      <p className="muted" style={{ marginTop: 0 }}>
        {t(
          'Broadcast messages and pass-expiry reminders are charged separately from your SwimIT subscription, at ₹1 per delivered WhatsApp message. These charges are added to the next renewal invoice.',
        )}
      </p>
      {settingsLoading ? (
        <p className="muted">{t('Loading…')}</p>
      ) : (
        <div className="whatsapp-option-stack">
          <div className="whatsapp-expiry-row">
            <label className="whatsapp-expiry-check">
              <input
                type="checkbox"
                checked={expiryEnabled}
                disabled={fieldsLocked}
                onChange={(e) => setExpiryEnabled(e.target.checked)}
              />
              {t('Send a pass-expiry reminder')}
            </label>
            <span className="whatsapp-expiry-sentence">
              <input
                className="whatsapp-expiry-days-input"
                inputMode="numeric"
                maxLength={1}
                value={String(expiryDays)}
                disabled={fieldsLocked}
                aria-label={t('Days before pass expiry')}
                onChange={(e) => {
                  const next = Number(e.target.value.replace(/\D/g, '')) || 1;
                  setExpiryDays(Math.min(9, Math.max(1, next)));
                }}
              />
              {t('days before the pass ends.')}
            </span>
          </div>
          <div className="whatsapp-expiry-row">
            <label className="whatsapp-expiry-check">
              <input
                type="checkbox"
                checked={broadcastEnabled}
                disabled={fieldsLocked}
                onChange={(e) => setBroadcastEnabled(e.target.checked)}
              />
              {t('WhatsApp broadcast message')}
            </label>
          </div>
        </div>
      )}

      {error ? <p className="error">{t(error)}</p> : null}
      {info ? <p className="success">{info}</p> : null}

      {!settingsLoading && canEdit ? (
        <div className="pass-form-actions whatsapp-setup-actions">
          {editing ? (
            <button type="button" className="submit" disabled={saving} onClick={() => void onSave()}>
              {saving ? t('Saving…') : t('Save')}
            </button>
          ) : (
            <button type="button" className="submit" onClick={onEdit}>
              {t('Edit')}
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}
