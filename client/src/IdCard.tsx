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
};

export function IdCard({ data }: { data: IdCardData }) {
  return (
    <article className="id-card" aria-label={`Pass for ${data.fullName}`}>
      <header className="id-card-header">
        <p className="id-card-brand">{data.poolName?.trim() || 'swimIT'}</p>
        <p className="id-card-title">Pass</p>
      </header>

      <div className="id-card-body">
        <div className="id-card-photo-wrap">
          {data.photoUrl ? (
            <img src={data.photoUrl} alt={data.fullName} className="id-card-photo" />
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
              <dd>{data.batch || '—'}</dd>
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
  );
}
