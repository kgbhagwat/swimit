import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { App } from './App';
import { StaffRegistration } from './StaffRegistration';
import { setActiveTenant } from './tenantSession';

type PoolInfo = {
  poolName: string;
  poolAddress: string;
  poolLogoPath: string | null;
};

const ACCOUNT_CODE_RE = /^[a-z0-9]{6}$/;

function normalizeAccountCode(value: string) {
  return value.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toLowerCase();
}

function uploadUrl(filename: string | null | undefined) {
  if (!filename) return null;
  return `/uploads/${filename}`;
}

/** Public swimmer/staff registration — no desk login required. */
export function PublicOpenForm({ kind }: { kind: 'swimmer' | 'staff' }) {
  const { accountCode = '' } = useParams();
  const code = normalizeAccountCode(accountCode);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pool, setPool] = useState<PoolInfo | null>(null);
  const [accountName, setAccountName] = useState('');

  useEffect(() => {
    if (!ACCOUNT_CODE_RE.test(code)) {
      setLoading(false);
      setError('Invalid account link');
      return;
    }

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const accRes = await fetch(`/api/saas-accounts/by-code/${code}`);
        const accBody = await accRes.json().catch(() => ({}));
        if (!accRes.ok) throw new Error(accBody.error ?? 'Account not found');
        if (cancelled) return;

        const id = Number(accBody.id);
        const accountCodeValue = String(accBody.accountCode ?? code);
        setAccountName(String(accBody.accountName ?? ''));
        setActiveTenant({ id, accountCode: accountCodeValue });

        const poolRes = await fetch('/api/pool-core-info');
        const poolBody = await poolRes.json().catch(() => ({}));
        if (!poolRes.ok) throw new Error(poolBody.error ?? 'Failed to load pool info');
        if (cancelled) return;

        setPool({
          poolName: String(poolBody.poolName ?? accBody.accountName ?? ''),
          poolAddress: String(poolBody.poolAddress ?? ''),
          poolLogoPath: poolBody.poolLogoPath ? String(poolBody.poolLogoPath) : null,
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to open form');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (loading) {
    return (
      <div className="page public-open-form">
        <p className="pass-empty">Loading form…</p>
      </div>
    );
  }

  if (error || !pool) {
    return (
      <div className="page public-open-form">
        <p className="error">{error || 'Form unavailable'}</p>
      </div>
    );
  }

  const logoSrc = uploadUrl(pool.poolLogoPath);

  return (
    <div className="public-open-form">
      <header className="public-pool-banner">
        {logoSrc ? (
          <img src={logoSrc} alt="" className="public-pool-logo" />
        ) : (
          <div className="public-pool-logo public-pool-logo-fallback" aria-hidden>
            {pool.poolName.slice(0, 1).toUpperCase() || 'P'}
          </div>
        )}
        <div className="public-pool-text">
          <h1>{pool.poolName || accountName || 'Swimming pool'}</h1>
          {pool.poolAddress ? <p>{pool.poolAddress}</p> : null}
        </div>
      </header>
      {kind === 'swimmer' ? <App /> : <StaffRegistration />}
    </div>
  );
}

export function isPublicOpenFormPath(pathname: string) {
  return /\/open\/(register|staff-register)(\/|$)/.test(pathname);
}
