import { useEffect, useState } from 'react';
import { isApplicationDemo } from './applicationDemo';
import { useT } from './i18n';
import { readTenantSessionAccess } from './pageAccess';

type VerificationMode = 'ok_not_ok' | 'face';

function parseVerificationMode(value: unknown): VerificationMode {
  return String(value ?? '').trim() === 'face' ? 'face' : 'ok_not_ok';
}

function canChangePassVerification() {
  if (isApplicationDemo()) return true;
  const session = readTenantSessionAccess();
  if (!session) return true;
  if (session.isAccountAdmin) return true;
  return session.menuAccess.includes('pass-types');
}

export function PassVerificationCard() {
  const t = useT();
  const canEdit = canChangePassVerification();
  const [mode, setMode] = useState<VerificationMode>('ok_not_ok');
  const [editing, setEditing] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setSettingsLoading(true);
      try {
        const res = await fetch('/api/pass-types/verification');
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) {
          setMode(parseVerificationMode(body.verificationMode));
          setEditing(body.configured !== true);
        } else {
          setEditing(true);
        }
      } catch {
        if (!cancelled) setEditing(true);
      } finally {
        if (!cancelled) setSettingsLoading(false);
      }
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
      const res = await fetch('/api/pass-types/verification', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verificationMode: mode }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to save pass verification');
      setMode(parseVerificationMode(body.verificationMode));
      setEditing(false);
      setInfo(t('Pass verification saved.'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save pass verification');
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
    <section className="pass-form-card pool-core-form whatsapp-setup-card pass-verification-card">
      <h2>{t('Pass verification')}</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        {t('Choose how staff check a pass at the scanner.')}
      </p>
      {settingsLoading ? (
        <p className="muted">{t('Loading…')}</p>
      ) : (
        <div
          className="pass-yes-no pass-verification-options"
          role="radiogroup"
          aria-label={t('Pass verification')}
        >
          {(
            [
              { value: 'ok_not_ok', label: 'OK / Not OK enough' },
              { value: 'face', label: 'Face verification required' },
            ] as const
          ).map((option) => (
            <label key={option.value} className="pass-yes-no-option">
              <input
                type="radio"
                name="passVerificationMode"
                value={option.value}
                checked={mode === option.value}
                disabled={fieldsLocked}
                onChange={() => setMode(option.value)}
              />
              <span>{t(option.label)}</span>
            </label>
          ))}
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
