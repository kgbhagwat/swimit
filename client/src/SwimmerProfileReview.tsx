import type { ReactNode } from 'react';

export type SwimmerProfile = {
  id: number;
  fullName: string;
  fullAddress: string;
  whatsappMobile: string;
  otherMobile: string;
  email: string;
  birthdate: string;
  sex: string;
  bloodGroup: string;
  emergencyName: string;
  emergencyRelation: string;
  emergencyMobile: string;
  parentName: string;
  parentRelation: string;
  parentMobile: string;
  hasHealthIssue: string;
  healthIssueDetails: string;
  doctorName: string;
  doctorNo: string;
  identityDocument: string;
  identityPhotoUrl: string | null;
  photoUrl: string | null;
};

export function formatProfileDate(value: string) {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function displayProfileValue(value: string | null | undefined) {
  const trimmed = String(value ?? '').trim();
  return trimmed || '—';
}

export async function fetchSwimmerProfile(id: number): Promise<SwimmerProfile> {
  const res = await fetch(`/api/registrations/${id}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? 'Failed to load swimmer details');
  return body as SwimmerProfile;
}

export function SwimmerProfileReview({
  profile,
  loading,
  title = 'Confirm swimmer details',
  hint,
  footer,
}: {
  profile: SwimmerProfile | null;
  loading?: boolean;
  title?: string;
  hint?: string;
  footer?: ReactNode;
}) {
  return (
    <section className="swimmer-review-card" aria-label={title}>
      <h3>{title}</h3>
      {hint ? <p className="hint">{hint}</p> : null}
      {loading ? (
        <p className="muted">Loading swimmer form…</p>
      ) : !profile ? (
        <p className="error">Could not load swimmer details.</p>
      ) : (
        <>
          <div className="swimmer-review-photos">
            <figure className="swimmer-review-photo">
              {profile.photoUrl ? (
                <img src={profile.photoUrl} alt={`${profile.fullName} photo`} />
              ) : (
                <div className="swimmer-review-photo-empty">No swimmer photo</div>
              )}
              <figcaption>Swimmer photo</figcaption>
            </figure>
            <figure className="swimmer-review-photo">
              {profile.identityPhotoUrl ? (
                <img
                  src={profile.identityPhotoUrl}
                  alt={`${profile.fullName} identity proof`}
                />
              ) : (
                <div className="swimmer-review-photo-empty">No identity photo</div>
              )}
              <figcaption>
                Identity proof ({displayProfileValue(profile.identityDocument)})
              </figcaption>
            </figure>
          </div>

          <div className="swimmer-review-grid">
            <div>
              <span className="swimmer-review-label">Full name</span>
              <strong>{displayProfileValue(profile.fullName)}</strong>
            </div>
            <div>
              <span className="swimmer-review-label">Birth date</span>
              <span>{formatProfileDate(profile.birthdate)}</span>
            </div>
            <div>
              <span className="swimmer-review-label">Sex</span>
              <span>{displayProfileValue(profile.sex)}</span>
            </div>
            <div>
              <span className="swimmer-review-label">Blood group</span>
              <span>{displayProfileValue(profile.bloodGroup)}</span>
            </div>
            <div className="swimmer-review-wide">
              <span className="swimmer-review-label">Full address</span>
              <span>{displayProfileValue(profile.fullAddress)}</span>
            </div>
            <div>
              <span className="swimmer-review-label">WhatsApp mobile</span>
              <span>{displayProfileValue(profile.whatsappMobile)}</span>
            </div>
            <div>
              <span className="swimmer-review-label">Other mobile</span>
              <span>{displayProfileValue(profile.otherMobile)}</span>
            </div>
            <div className="swimmer-review-wide">
              <span className="swimmer-review-label">Email</span>
              <span>{displayProfileValue(profile.email)}</span>
            </div>
            <div>
              <span className="swimmer-review-label">Emergency contact</span>
              <span>
                {displayProfileValue(profile.emergencyName)}
                {profile.emergencyRelation ? ` (${profile.emergencyRelation})` : ''}
              </span>
            </div>
            <div>
              <span className="swimmer-review-label">Emergency mobile</span>
              <span>{displayProfileValue(profile.emergencyMobile)}</span>
            </div>
            {profile.parentName || profile.parentMobile ? (
              <>
                <div>
                  <span className="swimmer-review-label">Parent / guardian</span>
                  <span>
                    {displayProfileValue(profile.parentName)}
                    {profile.parentRelation ? ` (${profile.parentRelation})` : ''}
                  </span>
                </div>
                <div>
                  <span className="swimmer-review-label">Parent mobile</span>
                  <span>{displayProfileValue(profile.parentMobile)}</span>
                </div>
              </>
            ) : null}
            <div>
              <span className="swimmer-review-label">Health issue</span>
              <span>{displayProfileValue(profile.hasHealthIssue)}</span>
            </div>
            <div>
              <span className="swimmer-review-label">Health details</span>
              <span>{displayProfileValue(profile.healthIssueDetails)}</span>
            </div>
            <div>
              <span className="swimmer-review-label">Doctor name</span>
              <span>{displayProfileValue(profile.doctorName)}</span>
            </div>
            <div>
              <span className="swimmer-review-label">Doctor no.</span>
              <span>{displayProfileValue(profile.doctorNo)}</span>
            </div>
          </div>
          {footer}
        </>
      )}
    </section>
  );
}
