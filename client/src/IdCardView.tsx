import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { IdCard } from './IdCard';
import { MenuBackLink } from './MenuBackLink';
import { tenantPath } from './tenantSession';
import {
  fetchSwimmerPass,
  isPassPopupWindow,
  type SwimmerPassDetails,
} from './swimmerPass';

export function IdCardView() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const passId = Number(id);
  const asPopup = searchParams.get('popup') === '1' || isPassPopupWindow();
  const [pass, setPass] = useState<SwimmerPassDetails | null>(null);
  const [poolName, setPoolName] = useState('');
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

    Promise.all([
      fetchSwimmerPass(passId),
      fetch('/api/pool-core-info')
        .then(async (res) => {
          const body = await res.json().catch(() => ({}));
          if (!res.ok) return '';
          return String(body.poolName ?? '').trim();
        })
        .catch(() => ''),
    ])
      .then(([details, name]) => {
        if (cancelled) return;
        setPass(details);
        setPoolName(name);
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
        <h1>Pass</h1>
        {loading ? <p className="pass-empty">Loading…</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {!loading && pass ? (
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
    </div>
  );
}
