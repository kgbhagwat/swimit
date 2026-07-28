import { useEffect, useState } from 'react';

type TermsVariant = 'swimmer' | 'staff';

type TermsModalProps = {
  open: boolean;
  onClose: () => void;
  variant?: TermsVariant;
};

const DEFAULT_SWIMMER_TERMS = `1. General
By registering, you confirm that the information provided is true and complete. False or incomplete details may lead to cancellation of registration without refund.

2. Eligibility & safety
Swimmers must follow all pool safety instructions given by coaches and staff. Any medical condition must be disclosed in the registration form. Participation is at your own risk.

3. Attendance & batches
Batch timings are fixed by the facility. Missed sessions are generally non-transferable unless the facility announces otherwise. Holidays and schedule changes will be communicated separately.

4. Fees & payments
Fees, if applicable, must be paid as instructed by the facility. Payment proof may be requested for verification. Fee policies are decided by the swimming tank management.

5. Identity & photos
Identity documents and photos submitted are used only for registration, verification, and facility access. Do not upload unclear or unrelated images.

6. Conduct
Respectful behaviour towards staff, coaches, and other swimmers is mandatory. Misconduct may result in suspension or termination of membership.

7. Liability
The facility is not responsible for loss of personal belongings. In case of injury, first aid will be provided and emergency contacts will be informed using the details you submit.

8. Updates
These terms may be updated from time to time. Continued use of the facility after updates means you accept the revised terms.`;

const DEFAULT_STAFF_TERMS = `1. General
By registering as staff, you confirm that the information provided is true and complete. False or incomplete details may lead to rejection or termination of engagement.

2. Duties & safety
Staff must follow all pool safety procedures and facility instructions. Report hazards, incidents, and medical emergencies promptly.

3. Conduct
Respectful behaviour towards swimmers, parents, coaches, and colleagues is mandatory. Misconduct may result in suspension or termination.

4. Confidentiality
Personal data of swimmers and staff must be handled confidentially and used only for facility operations.

5. Attendance & schedule
Duty timings and batch assignments are set by management. Changes will be communicated by the facility.

6. Identity & documents
Identity documents, certificates, and photos submitted are used for verification and facility records.

7. Liability
Follow all safety protocols while on duty. The facility will use emergency contact details you provide when needed.

8. Updates
These terms may be updated from time to time. Continued engagement means you accept the revised terms.`;

function renderTermsBlocks(text: string) {
  const chunks = text
    .trim()
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);

  return chunks.map((chunk, index) => {
    const lines = chunk.split('\n');
    const first = lines[0] ?? '';
    const looksLikeHeading = /^\d+\.\s+/.test(first) || first.length < 80;
    if (looksLikeHeading && lines.length > 1) {
      return (
        <div key={`${index}-${first}`}>
          <h3>{first}</h3>
          <p>{lines.slice(1).join(' ')}</p>
        </div>
      );
    }
    return <p key={`${index}-${first.slice(0, 24)}`}>{chunk}</p>;
  });
}

export function TermsModal({ open, onClose, variant = 'swimmer' }: TermsModalProps) {
  const [termsText, setTermsText] = useState(
    variant === 'staff' ? DEFAULT_STAFF_TERMS : DEFAULT_SWIMMER_TERMS,
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetch('/api/pool-core-info')
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load terms');
        return res.json();
      })
      .then((data: { swimmerTerms?: string; staffTerms?: string }) => {
        if (cancelled) return;
        const stored =
          variant === 'staff'
            ? String(data.staffTerms ?? '').trim()
            : String(data.swimmerTerms ?? '').trim();
        setTermsText(
          stored || (variant === 'staff' ? DEFAULT_STAFF_TERMS : DEFAULT_SWIMMER_TERMS),
        );
      })
      .catch(() => {
        if (cancelled) return;
        setTermsText(variant === 'staff' ? DEFAULT_STAFF_TERMS : DEFAULT_SWIMMER_TERMS);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, variant]);

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
        <h2 id="terms-title">Terms & Conditions and Rules & Regulations</h2>
        <p className="modal-intro">Please read carefully before submitting your registration.</p>

        <div className="modal-scroll">
          {loading ? <p>Loading…</p> : renderTermsBlocks(termsText)}
        </div>

        <div className="modal-footer">
          <button type="button" className="submit" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
