import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { MenuBackLink } from './MenuBackLink';
import { QrImage } from './QrImage';
import { tenantPath } from './tenantSession';
import {
  fetchSwimmerPass,
  idCardUrl,
  isPassPopupWindow,
  type SwimmerPassDetails,
} from './swimmerPass';

export function PassView() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const passId = Number(id);
  const asPopup = searchParams.get('popup') === '1' || isPassPopupWindow();
  const [pass, setPass] = useState<SwimmerPassDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!Number.isFinite(passId) || passId <= 0) {
      setError('Invalid pass');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');

    fetchSwimmerPass(passId)
      .then((details) => {
        if (cancelled) return;
        setPass(details);
      })
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
  }, [passId]);

  const qrValue = Number.isFinite(passId) && passId > 0 ? idCardUrl(passId) : '';

  return (
    <div className={`page${asPopup ? ' pass-popup-page' : ''}`}>
      <div className="top-row">
        {asPopup ? (
          <button type="button" className="menu-link pass-popup-close" onClick={() => window.close()}>
            Close
          </button>
        ) : (
          <>
            <MenuBackLink />
            <div className="top-row-right">
              <Link className="menu-link" to={tenantPath('/swimmers')}>
                Swimmer List
              </Link>
            </div>
          </>
        )}
      </div>

      <div className="swimmer-list-card">
        <h1>Pass QR</h1>
        {loading ? <p className="pass-empty">Loading…</p> : null}
        {error ? <p className="error">{error}</p> : null}

        {!loading && pass ? (
          <section className="pass-qr-only" aria-label="Pass QR code">
            <QrImage value={qrValue} alt={`QR code for pass ${pass.id}`} size={240} />
            {pass.fullName ? <p className="pass-qr-hint">{pass.fullName}</p> : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
