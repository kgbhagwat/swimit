import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { IdCard, fetchPoolBrand, type PoolBrand } from './IdCard';
import { PassInvoiceBody } from './PassInvoicePopup';
import { QrImage } from './QrImage';
import { useT } from './i18n';
import {
  PASS_POPUP_EVENT,
  type PassPopupKind,
  type PassPopupRequest,
} from './passPopupEvents';
import {
  fetchSwimmerPass,
  idCardUrl,
  type SwimmerPassDetails,
} from './swimmerPass';

export type { PassPopupKind };

const emptyBrand: PoolBrand = { poolName: '', poolAddress: '', poolLogoUrl: null };

/** In-page Pass QR / Pass card / invoice overlay (avoids a new browser tab). */
export function PassPopupOverlay() {
  const t = useT();
  const [request, setRequest] = useState<PassPopupRequest | null>(null);
  const [pass, setPass] = useState<SwimmerPassDetails | null>(null);
  const [brand, setBrand] = useState<PoolBrand>(emptyBrand);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    function onRequest(event: Event) {
      const detail = (event as CustomEvent<PassPopupRequest>).detail;
      if (!detail?.id || (detail.kind !== 'qr' && detail.kind !== 'pass' && detail.kind !== 'invoice')) {
        return;
      }
      setRequest({ kind: detail.kind, id: detail.id });
    }
    window.addEventListener(PASS_POPUP_EVENT, onRequest);
    return () => window.removeEventListener(PASS_POPUP_EVENT, onRequest);
  }, []);

  useEffect(() => {
    if (!request) return;
    if (request.kind === 'invoice') {
      setLoading(false);
      setError('');
      setPass(null);
      setBrand(emptyBrand);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');
    setPass(null);
    setBrand(emptyBrand);

    const load =
      request.kind === 'pass'
        ? Promise.all([fetchSwimmerPass(request.id), fetchPoolBrand()]).then(
            ([details, poolBrand]) => {
              if (cancelled) return;
              setPass(details);
              setBrand(poolBrand);
            },
          )
        : fetchSwimmerPass(request.id).then((details) => {
            if (cancelled) return;
            setPass(details);
          });

    void load
      .catch((err) => {
        if (cancelled) return;
        setPass(null);
        setError(err instanceof Error ? err.message : 'Failed to load pass');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [request]);

  useEffect(() => {
    if (!request) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setRequest(null);
    }
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [request]);

  if (!request) return null;

  const title =
    request.kind === 'qr' ? t('Pass QR') : request.kind === 'invoice' ? t('Invoice') : t('Pass');
  const qrValue = idCardUrl(request.id);
  const invoiceMode = request.kind === 'invoice';

  return createPortal(
    <div
      className="modal-backdrop pass-popup-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) setRequest(null);
      }}
    >
      <div
        className={`modal-panel pass-popup-panel${
          request.kind === 'pass' ? ' pass-popup-panel-wide' : ''
        }${invoiceMode ? ' pass-popup-panel-invoice' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pass-popup-title"
      >
        <div className="pass-popup-panel-head">
          <h2 id="pass-popup-title">{title}</h2>
          <button
            type="button"
            className="pass-popup-close-x"
            onClick={() => setRequest(null)}
            aria-label={t('Close')}
            title={t('Close')}
          >
            ×
          </button>
        </div>

        {invoiceMode ? <PassInvoiceBody swimmerId={request.id} /> : null}

        {!invoiceMode && loading ? <p className="pass-empty">{t('Loading…')}</p> : null}
        {!invoiceMode && error ? <p className="error">{error}</p> : null}

        {!invoiceMode && !loading && pass && request.kind === 'qr' ? (
          <section className="pass-qr-only" aria-label="Pass QR code">
            <QrImage value={qrValue} alt={`QR code for pass ${pass.id}`} size={240} />
            {pass.fullName ? <p className="pass-qr-hint">{pass.fullName}</p> : null}
          </section>
        ) : null}

        {!invoiceMode && !loading && pass && request.kind === 'pass' ? (
          <IdCard
            data={{
              id: pass.id,
              fullName: pass.fullName,
              photoUrl: pass.photoUrl,
              passType: pass.passType,
              duration: pass.duration,
              batch: pass.batch,
              coach: pass.coach,
              passValidUntil: pass.passValidUntil,
              poolName: brand.poolName,
              poolAddress: brand.poolAddress,
              poolLogoUrl: brand.poolLogoUrl,
            }}
          />
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
