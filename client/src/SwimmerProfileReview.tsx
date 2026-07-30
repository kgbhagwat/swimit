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

function ReviewField({
  label,
  value,
  wide,
}: {
  label: string;
  value: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'swimmer-review-wide' : undefined}>
      <span className="swimmer-review-label">{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function SwimmerProfileReview({
  profile,
  loading,
  title = 'Confirm swimmer details',
  hint,
  actions,
  footer,
}: {
  profile: SwimmerProfile | null;
  loading?: boolean;
  title?: string;
  hint?: string;
  actions?: ReactNode;
  footer?: ReactNode;
}) {
  const showParent = Boolean(
    profile &&
      (String(profile.parentName ?? '').trim() ||
        String(profile.parentMobile ?? '').trim() ||
        String(profile.parentRelation ?? '').trim()),
  );
  const showHealthDetails = profile?.hasHealthIssue === 'Yes';

  return (
    <section className="swimmer-review-card" aria-label={title}>
      <div className="swimmer-review-head">
        <div>
          <h3>{title}</h3>
          {hint ? <p className="hint">{hint}</p> : null}
        </div>
        {actions ? <div className="swimmer-review-actions">{actions}</div> : null}
      </div>
      {loading ? (
        <p className="muted">Loading swimmer form…</p>
      ) : !profile ? (
        <p className="error">Could not load swimmer details.</p>
      ) : (
        <>
          <div className="swimmer-review-grid">
            <ReviewField label="Full name" value={displayProfileValue(profile.fullName)} wide />
            <ReviewField label="Full address" value={displayProfileValue(profile.fullAddress)} wide />
            <ReviewField
              label="WhatsApp mobile"
              value={displayProfileValue(profile.whatsappMobile)}
            />
            <ReviewField label="Other mobile" value={displayProfileValue(profile.otherMobile)} />
            <ReviewField label="Email" value={displayProfileValue(profile.email)} />
            <ReviewField label="Birth date" value={formatProfileDate(profile.birthdate)} />
            <ReviewField label="Sex" value={displayProfileValue(profile.sex)} />
            <ReviewField label="Blood group" value={displayProfileValue(profile.bloodGroup)} />
          </div>

          {showParent ? (
            <>
              <h4 className="swimmer-review-section">Parent / guardian</h4>
              <div className="swimmer-review-grid">
                <ReviewField label="Parent name" value={displayProfileValue(profile.parentName)} />
                <ReviewField
                  label="Relation"
                  value={displayProfileValue(profile.parentRelation)}
                />
                <ReviewField
                  label="Parent contact"
                  value={displayProfileValue(profile.parentMobile)}
                />
              </div>
            </>
          ) : null}

          <h4 className="swimmer-review-section">Emergency contact</h4>
          <div className="swimmer-review-grid">
            <ReviewField
              label="Emergency name"
              value={displayProfileValue(profile.emergencyName)}
            />
            <ReviewField
              label="Relation"
              value={displayProfileValue(profile.emergencyRelation)}
            />
            <ReviewField
              label="Emergency mobile"
              value={displayProfileValue(profile.emergencyMobile)}
            />
          </div>

          <h4 className="swimmer-review-section">Medical</h4>
          <div className="swimmer-review-grid">
            <ReviewField
              label="Any disease / health issue"
              value={displayProfileValue(profile.hasHealthIssue)}
            />
            {showHealthDetails ? (
              <>
                <ReviewField
                  label="Disease / health issue"
                  value={displayProfileValue(profile.healthIssueDetails)}
                  wide
                />
                <ReviewField label="Doctor name" value={displayProfileValue(profile.doctorName)} />
                <ReviewField label="Doctor no." value={displayProfileValue(profile.doctorNo)} />
              </>
            ) : null}
          </div>

          <h4 className="swimmer-review-section">Identity</h4>
          <div className="swimmer-review-grid">
            <ReviewField
              label="Identity document"
              value={displayProfileValue(profile.identityDocument)}
            />
          </div>
          <div className="swimmer-review-photos">
            <figure className="swimmer-review-photo">
              {profile.identityPhotoUrl ? (
                <img
                  className="swimmer-review-photo-doc"
                  src={profile.identityPhotoUrl}
                  alt={`${profile.fullName} identity proof`}
                />
              ) : (
                <div className="swimmer-review-photo-empty">No identity photo</div>
              )}
              <figcaption>Identity proof photo</figcaption>
            </figure>
            <figure className="swimmer-review-photo">
              {profile.photoUrl ? (
                <img src={profile.photoUrl} alt={`${profile.fullName} photo`} />
              ) : (
                <div className="swimmer-review-photo-empty">No swimmer photo</div>
              )}
              <figcaption>Swimmer photo</figcaption>
            </figure>
          </div>
          {footer}
        </>
      )}
    </section>
  );
}
