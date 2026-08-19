import { isApplicationDemo } from './applicationDemo';
import { FilePreview } from './FilePreview';
import { SensitiveSurface } from './sensitiveScreen';
import { formatDisplayDate } from './swimmerPass';

export type IdCardData = {
  id: number;
  fullName: string;
  photoUrl: string | null;
  passType: string;
  duration?: string;
  batch: string;
  coach: string;
  passValidUntil: string;
  poolName?: string;
  poolAddress?: string;
  poolLogoUrl?: string | null;
};

export type PoolBrand = {
  poolName: string;
  poolAddress: string;
  poolLogoUrl: string | null;
};

const SAMPLE_POOL_BRAND: PoolBrand = {
  poolName: 'SwimIT Sample Pool',
  poolAddress: '12 Sample Lane, Pune',
  poolLogoUrl: null,
};

export async function fetchPoolBrand(): Promise<PoolBrand> {
  if (isApplicationDemo()) {
    try {
      const res = await fetch('/api/pool-core-info');
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        const logoPath = String(body.poolLogoPath ?? '').trim();
        const poolName = String(body.poolName ?? '').trim();
        const poolAddress = String(body.poolAddress ?? '').trim();
        if (poolName || poolAddress || logoPath) {
          return {
            poolName: poolName || SAMPLE_POOL_BRAND.poolName,
            poolAddress: poolAddress || SAMPLE_POOL_BRAND.poolAddress,
            poolLogoUrl: logoPath
              ? logoPath.startsWith('/') || logoPath.startsWith('http')
                ? logoPath
                : `/uploads/${logoPath}`
              : null,
          };
        }
      }
    } catch {
      /* use sample brand below */
    }
    return { ...SAMPLE_POOL_BRAND };
  }
  try {
    const res = await fetch('/api/pool-core-info');
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { poolName: '', poolAddress: '', poolLogoUrl: null };
    }
    const logoPath = String(body.poolLogoPath ?? '').trim();
    return {
      poolName: String(body.poolName ?? '').trim(),
      poolAddress: String(body.poolAddress ?? '').trim(),
      poolLogoUrl: logoPath
        ? logoPath.startsWith('/') || logoPath.startsWith('http')
          ? logoPath
          : `/uploads/${logoPath}`
        : null,
    };
  } catch {
    return { poolName: '', poolAddress: '', poolLogoUrl: null };
  }
}

export function formatBatchDisplay(batch: string) {
  const value = String(batch ?? '').trim();
  if (!value) return { title: '—', time: '' };

  const timeMatch = value.match(/^(.*?)\s*[—-]\s*(\d{1,2}:\d{2}\s*to\s*\d{1,2}:\d{2})\s*$/i);
  if (timeMatch) {
    return { title: timeMatch[1].trim(), time: timeMatch[2].trim() };
  }

  const parts = value.split(/\s*[—-]\s*/);
  if (parts.length >= 3) {
    const time = parts[parts.length - 1].trim();
    if (/^\d{1,2}:\d{2}\s*to\s*\d{1,2}:\d{2}$/i.test(time)) {
      return { title: parts.slice(0, -1).join(' — ').trim(), time };
    }
  }

  return { title: value, time: '' };
}

export function IdCard({ data }: { data: IdCardData }) {
  const poolName = data.poolName?.trim() || 'SwimIT';
  const poolAddress = data.poolAddress?.trim() || '';
  const logoUrl = data.poolLogoUrl?.trim() || null;
  const batchDisplay = formatBatchDisplay(data.batch);

  return (
    <SensitiveSurface
      className="id-card-sensitive"
      label="SwimIT · Confidential"
      watermark={false}
    >
      <article className="id-card" aria-label={`Pass for ${data.fullName}`}>
        <header className="id-card-header">
          <div className="id-card-brand-row">
            <div className="id-card-logo-wrap" aria-hidden={!logoUrl}>
              {logoUrl ? (
                <FilePreview src={logoUrl} alt={poolName} className="id-card-logo" draggable={false} />
              ) : (
                <span className="id-card-logo-fallback">{poolName.slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <div className="id-card-brand-text">
              <p className="id-card-brand">{poolName}</p>
              {poolAddress ? <p className="id-card-address">{poolAddress}</p> : null}
            </div>
          </div>
        </header>

        <div className="id-card-body">
          <div className="id-card-photo-wrap">
            {data.photoUrl ? (
              <FilePreview src={data.photoUrl} alt={data.fullName} className="id-card-photo" draggable={false} />
            ) : (
              <div className="id-card-photo-fallback">No photo</div>
            )}
          </div>

          <div className="id-card-fields">
            <h2 className="id-card-name">{data.fullName}</h2>
            <dl className="id-card-dl">
              <div>
                <dt>Pass ID</dt>
                <dd>{data.id}</dd>
              </div>
              <div>
                <dt>Pass type</dt>
                <dd>{data.passType || '—'}</dd>
              </div>
              {data.duration ? (
                <div>
                  <dt>Duration</dt>
                  <dd>{data.duration}</dd>
                </div>
              ) : null}
              <div>
                <dt>Batch</dt>
                <dd>
                  <span className="id-card-batch-title">{batchDisplay.title}</span>
                  {batchDisplay.time ? (
                    <span className="id-card-batch-time">{batchDisplay.time}</span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt>Coach</dt>
                <dd>{data.coach || '—'}</dd>
              </div>
              <div>
                <dt>Valid until</dt>
                <dd>{formatDisplayDate(data.passValidUntil)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </article>
    </SensitiveSurface>
  );
}
