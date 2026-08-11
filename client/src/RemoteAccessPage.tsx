import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useT } from './i18n';

export function RemoteAccessPage() {
  const t = useT();
  const [params] = useSearchParams();
  const token = String(params.get('token') ?? '').trim();
  const decision = String(params.get('decision') ?? '')
    .trim()
    .toLowerCase();
  const [status, setStatus] = useState<'working' | 'done' | 'error'>('working');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!token || (decision !== 'approve' && decision !== 'deny')) {
        setStatus('error');
        setMessage(t('This remote access link is invalid or incomplete.'));
        return;
      }
      try {
        const res = await fetch('/api/remote-login/decide', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, decision }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? t('Failed to update remote access'));
        if (cancelled) return;
        setStatus('done');
        if (body.alreadyDecided) {
          setMessage(
            decision === 'approve'
              ? t('This remote access request was already decided.')
              : t('This remote access request was already decided.'),
          );
        } else if (decision === 'approve') {
          setMessage(
            t('Remote access approved. The user can sign in for the next 24 hours.'),
          );
        } else {
          setMessage(t('Remote access denied. The user cannot sign in from this location.'));
        }
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setMessage(err instanceof Error ? err.message : t('Failed to update remote access'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, decision, t]);

  return (
    <div className="page remote-access-page">
      <div className="remote-access-card">
        <img src="/swimit-logo.png" alt="SwimIT" className="remote-access-logo" />
        <h1>{t('Remote login approval')}</h1>
        {status === 'working' ? <p className="muted">{t('Updating…')}</p> : null}
        {status !== 'working' ? (
          <p className={status === 'error' ? 'error' : 'success'}>{message}</p>
        ) : null}
        <p className="remote-access-home">
          <Link to="/">{t('Back to home')}</Link>
        </p>
      </div>
    </div>
  );
}
