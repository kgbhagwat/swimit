import { useEffect, useState } from 'react';
import { defaultAccountTerms } from './accountTermsDefaults';
import { defaultCoachTerms, resolveCoachTerms } from './coachTermsDefaults';
import { useLanguage, useT } from './i18n';
import { defaultSwimmerTerms, resolveSwimmerTerms } from './swimmerTermsDefaults';
import { TermsBlocks } from './TermsBlocks';

type TermsVariant = 'swimmer' | 'staff' | 'account';

type TermsModalProps = {
  open: boolean;
  onClose: () => void;
  /** Called when the user confirms Accept (account terms). */
  onAccept?: () => void;
  variant?: TermsVariant;
};

export function TermsModal({ open, onClose, onAccept, variant = 'swimmer' }: TermsModalProps) {
  const t = useT();
  const { lang } = useLanguage();
  const fallback =
    variant === 'staff'
      ? defaultCoachTerms(lang)
      : variant === 'account'
        ? defaultAccountTerms(lang)
        : defaultSwimmerTerms(lang);
  const [termsText, setTermsText] = useState(fallback);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    if (variant === 'account') {
      setTermsText(defaultAccountTerms(lang));
      setLoading(false);
      return;
    }

    setLoading(true);
    const langFallback =
      variant === 'staff' ? defaultCoachTerms(lang) : defaultSwimmerTerms(lang);

    // Saved Pool Core Info terms override defaults. When empty, show built-in
    // language defaults (account users can edit defaults under Core Info).
    fetch('/api/pool-core-info')
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load terms');
        return res.json();
      })
      .then((data: { swimmerTerms?: string; staffTerms?: string }) => {
        if (cancelled) return;
        if (variant === 'staff') {
          setTermsText(resolveCoachTerms(String(data.staffTerms ?? ''), lang));
          return;
        }
        setTermsText(resolveSwimmerTerms(String(data.swimmerTerms ?? ''), lang));
      })
      .catch(() => {
        if (cancelled) return;
        setTermsText(langFallback);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, variant, lang]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="terms-title"
      onClick={onClose}
    >
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <h2 id="terms-title">{t('Terms & Conditions')}</h2>
        <p className="modal-intro">{t('Please read carefully before submitting your registration.')}</p>

        <div className="modal-scroll">
          {loading ? <p>{t('Loading…')}</p> : <TermsBlocks text={termsText} />}
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="submit"
            onClick={() => {
              if (variant === 'account') onAccept?.();
              onClose();
            }}
          >
            {t(variant === 'account' ? 'Accept' : 'OK')}
          </button>
        </div>
      </div>
    </div>
  );
}
