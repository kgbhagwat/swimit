import { useCallback, useEffect, useState } from 'react';
import { useT } from './i18n';

type CaptchaPayload = {
  captchaId: string;
  imageDataUrl: string;
};

export type LoginCaptchaValue = {
  captchaId: string;
  captchaAnswer: string;
};

export function useLoginCaptcha(active = true) {
  const [challenge, setChallenge] = useState<CaptchaPayload | null>(null);
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    setAnswer('');
    try {
      const res = await fetch('/api/captcha', { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to load captcha');
      setChallenge({
        captchaId: String(body.captchaId ?? ''),
        imageDataUrl: String(body.imageDataUrl ?? ''),
      });
    } catch (err) {
      setChallenge(null);
      setLoadError(err instanceof Error ? err.message : 'Failed to load captcha');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void refresh();
  }, [active, refresh]);

  const value: LoginCaptchaValue | null =
    challenge?.captchaId && answer.trim()
      ? { captchaId: challenge.captchaId, captchaAnswer: answer.trim() }
      : null;

  return {
    challenge,
    answer,
    setAnswer,
    loading,
    loadError,
    refresh,
    value,
    ready: Boolean(challenge?.captchaId && answer.trim()),
  };
}

export function LoginCaptchaField({
  challenge,
  answer,
  onAnswerChange,
  onRefresh,
  loading,
  loadError,
  disabled,
}: {
  challenge: CaptchaPayload | null;
  answer: string;
  onAnswerChange: (value: string) => void;
  onRefresh: () => void;
  loading?: boolean;
  loadError?: string;
  disabled?: boolean;
}) {
  const t = useT();
  return (
    <div className="field login-captcha-field">
      <span className="label">
        {t('Captcha')} <span className="req">*</span>
      </span>
      <div className="login-captcha-controls">
        <div className="login-captcha-image-wrap">
          {challenge?.imageDataUrl ? (
            <img
              src={challenge.imageDataUrl}
              alt={t('Captcha code')}
              className="login-captcha-image"
              draggable={false}
            />
          ) : (
            <div className="login-captcha-placeholder" aria-hidden>
              {loading ? t('Loading…') : '—'}
            </div>
          )}
          <button
            type="button"
            className="login-captcha-refresh"
            onClick={() => onRefresh()}
            disabled={disabled || loading}
            title={t('Refresh captcha')}
            aria-label={t('Refresh captcha')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M20 12a8 8 0 1 1-2.3-5.6" />
              <path d="M20 4v5h-5" />
            </svg>
          </button>
        </div>
        <input
          value={answer}
          onChange={(e) =>
            onAnswerChange(e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase())
          }
          placeholder={t('Enter captcha')}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          required
          disabled={disabled || loading || !challenge}
          aria-invalid={Boolean(loadError)}
          maxLength={8}
        />
        {loadError ? <p className="field-error">{loadError}</p> : null}
      </div>
    </div>
  );
}
