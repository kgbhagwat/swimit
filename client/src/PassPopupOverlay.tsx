import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { IdCard } from './IdCard';
import { QrImage } from './QrImage';
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

/** In-page Pass QR / Pass card overlay (avoids a new browser tab). */
export function PassPopupOverlay() {
  const [request, setRequest] = useState<PassPopupRequest | null>(null);
  const [pass, setPass] = useState<SwimmerPassDetails | null>(null);
  const [poolName, setPoolName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    function onRequest(event: Event) {
      const detail = (event as CustomEvent<PassPopupRequest>).detail;
      if (!detail?.id || (detail.kind !== 'qr' && detail.kind !== 'pass')) return;
      setRequest({ kind: detail.kind, id: detail.id });
    }
    window.addEventListener(PASS_POPUP_EVENT, onRequest);
    return () => window.removeEventListener(PASS_POPUP_EVENT, onRequest);
  }, []);

  useEffect(() => {
    if (!request) return;

    let cancelled = false;
    setLoading(true);
    setError('');
    setPass(null);
    setPoolName('');

    const load =
      request.kind === 'pass'
        ? Promise.all([
            fetchSwimmerPass(request.id),
            fetch('/api/pool-core-info')
              .then(async (res) => {
                const body = await res.json().catch(() => ({}));
                if (!res.ok) return '';
                return String(body.poolName ?? '').trim();
              })
              .catch(() => ''),
          ]).then(([details, name]) => {
            if (cancelled) return;
            setPass(details);
            setPoolName(name);
          })
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

  const title = request.kind === 'qr' ? 'Pass QR' : 'Pass';
  const qrValue = idCardUrl(request.id);

  return createPortal(
    <div
      className="modal-backdrop pass-popup-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) setRequest(null);
      }}
    >
      <div
        className="modal-panel pass-popup-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pass-popup-title"
      >
        <div className="pass-popup-panel-head">
          <h2 id="pass-popup-title">{title}</h2>
          <button type="button" className="menu-link" onClick={() => setRequest(null)}>
            Close
          </button>
        </div>

        {loading ? <p className="pass-empty">Loading…</p> : null}
        {error ? <p className="error">{error}</p> : null}

        {!loading && pass && request.kind === 'qr' ? (
          <section className="pass-qr-only" aria-label="Pass QR code">
            <QrImage value={qrValue} alt={`QR code for pass ${pass.id}`} size={240} />
            {pass.fullName ? <p className="pass-qr-hint">{pass.fullName}</p> : null}
          </section>
        ) : null}

        {!loading && pass && request.kind === 'pass' ? (
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
              poolName,
            }}
          />
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
