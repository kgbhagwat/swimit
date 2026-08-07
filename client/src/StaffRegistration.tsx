import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useT } from './i18n';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { isApplicationDemo } from './applicationDemo';
import { emailHint, emergencyMatchesApplicant, isValidEmail, isValidMobile, mobileHint, sanitizeMobileInput } from './formValidation';
import { PlatformPage } from './PlatformPage';
import { MultiCertificateField, RegistrationPhotoField } from './RegistrationPhotoField';
import { TermsModal } from './TermsModal';
import { getSampleStaffDetail, SAMPLE_STAFF_BATCHES } from './sampleStaff';
import { SendFormQrButton } from './SendFormQrButton';
import { tenantPath } from './tenantSession';
import { useObjectUrl, useObjectUrls } from './useObjectUrl';


type AvailableBatch = {
  id: string;
  name: string;
  type: string;
  startTime: string;
  endTime: string;
};

function formatBatchTime(value: string) {
  const [hRaw, mRaw] = value.slice(0, 5).split(':').map(Number);
  const period = hRaw >= 12 ? 'PM' : 'AM';
  let hour = hRaw % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${String(mRaw).padStart(2, '0')} ${period}`;
}

type FormState = {
  registrationFor: string;
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
  hasHealthIssue: string;
  healthIssueDetails: string;
  doctorName: string;
  doctorNo: string;
  identityDocument: string;
  teachStrokes: string[];
  suitableBatchIds: string[];
  achievements: string;
  hasLifeguardCert: string;
  lifeguardExpiry: string;
  certificateDetails: string;
  postName: string;
  salary: string;
  acceptedTerms: boolean;
};

const initialForm: FormState = {
  registrationFor: '',
  fullName: '',
  fullAddress: '',
  whatsappMobile: '',
  otherMobile: '',
  email: '',
  birthdate: '',
  sex: '',
  bloodGroup: '',
  emergencyName: '',
  emergencyRelation: '',
  emergencyMobile: '',
  hasHealthIssue: 'No',
  healthIssueDetails: '',
  doctorName: '',
  doctorNo: '',
  identityDocument: '',
  teachStrokes: [],
  suitableBatchIds: [],
  achievements: '',
  hasLifeguardCert: 'No',
  lifeguardExpiry: '',
  certificateDetails: '',
  postName: '',
  salary: '',
  acceptedTerms: false,
};

function getAgeYears(birthdate: string) {
  if (!birthdate) return null;
  const born = new Date(`${birthdate}T00:00:00`);
  if (Number.isNaN(born.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - born.getFullYear();
  const monthDiff = today.getMonth() - born.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < born.getDate())) {
    age -= 1;
  }
  return age;
}

/** Latest birthdate allowed so the person is over 18 years old. */
function maxBirthdateForOver18() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function Label({ children, required }: { children: string; required?: boolean }) {
  return (
    <span className="label">
      {children}
      {required ? <span className="req"> *</span> : null}
    </span>
  );
}

function uploadUrl(filename: string | null | undefined) {
  if (!filename) return null;
  return `/uploads/${filename}`;
}

export function StaffRegistration() {
  const { id: editIdParam } = useParams();
  const navigate = useNavigate();
  const editId = editIdParam ? Number(editIdParam) : null;
  const isSampleEdit =
    isApplicationDemo() && editId !== null && Number.isFinite(editId) && editId < 0;
  const isEdit =
    (editId !== null && Number.isFinite(editId) && editId > 0) || isSampleEdit;

  const t = useT();
  const [form, setForm] = useState<FormState>(initialForm);
  const [isActive, setIsActive] = useState(true);
  const [loadingEdit, setLoadingEdit] = useState(isEdit);
  const [identityPhoto, setIdentityPhoto] = useState<File | null>(null);
  const [staffPhoto, setStaffPhoto] = useState<File | null>(null);
  const [lifeguardPhoto, setLifeguardPhoto] = useState<File | null>(null);
  const [certPhotos, setCertPhotos] = useState<(File | null)[]>([null, null, null]);
  const [existingPhotos, setExistingPhotos] = useState({
    identity: null as string | null,
    staff: null as string | null,
    lifeguard: null as string | null,
    certs: [null, null, null] as (string | null)[],
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [errorCount, setErrorCount] = useState(0);
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set());
  const [success, setSuccess] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [availableBatches, setAvailableBatches] = useState<AvailableBatch[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(false);

  useEffect(() => {
    if (!isEdit || editId === null) return;
    setLoadingEdit(true);
    setError('');

    if (isSampleEdit) {
      const sample = getSampleStaffDetail(editId);
      if (!sample) {
        setError('Sample staff not found');
        setLoadingEdit(false);
        return;
      }
      setForm({
        registrationFor: sample.registrationFor,
        fullName: sample.fullName,
        fullAddress: sample.fullAddress,
        whatsappMobile: sample.whatsappMobile,
        otherMobile: sample.otherMobile,
        email: sample.email,
        birthdate: sample.birthdate,
        sex: sample.sex,
        bloodGroup: sample.bloodGroup,
        emergencyName: sample.emergencyName,
        emergencyRelation: sample.emergencyRelation,
        emergencyMobile: sample.emergencyMobile,
        hasHealthIssue: sample.hasHealthIssue,
        healthIssueDetails: sample.healthIssueDetails,
        doctorName: sample.doctorName,
        doctorNo: sample.doctorNo,
        identityDocument: sample.identityDocument,
        teachStrokes: [...sample.teachStrokes],
        suitableBatchIds: [...sample.suitableBatchIds],
        achievements: sample.achievements,
        hasLifeguardCert: sample.hasLifeguardCert,
        lifeguardExpiry: sample.lifeguardExpiry,
        certificateDetails: sample.certificateDetails,
        postName: sample.postName,
        salary: sample.salary,
        acceptedTerms: true,
      });
      setIsActive(sample.isActive);
      setExistingPhotos({
        identity: null,
        staff: null,
        lifeguard: null,
        certs: [null, null, null],
      });
      setAvailableBatches(SAMPLE_STAFF_BATCHES);
      setLoadingEdit(false);
      return;
    }

    fetch(`/api/staff-registrations/${editId}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? 'Failed to load staff');
        }
        return res.json();
      })
      .then((data) => {
        setForm({
          registrationFor: data.registrationFor ?? '',
          fullName: data.fullName ?? '',
          fullAddress: data.fullAddress ?? '',
          whatsappMobile: data.whatsappMobile ?? '',
          otherMobile: data.otherMobile ?? '',
          email: data.email ?? '',
          birthdate: data.birthdate ?? '',
          sex: data.sex ?? '',
          bloodGroup: data.bloodGroup ?? '',
          emergencyName: data.emergencyName ?? '',
          emergencyRelation: data.emergencyRelation ?? '',
          emergencyMobile: data.emergencyMobile ?? '',
          hasHealthIssue: data.hasHealthIssue ?? 'No',
          healthIssueDetails: data.healthIssueDetails ?? '',
          doctorName: data.doctorName ?? '',
          doctorNo: data.doctorNo ?? '',
          identityDocument: data.identityDocument ?? '',
          teachStrokes: Array.isArray(data.teachStrokes) ? data.teachStrokes : [],
          suitableBatchIds: Array.isArray(data.suitableBatchIds)
            ? data.suitableBatchIds.map(String)
            : [],
          achievements: data.achievements ?? '',
          hasLifeguardCert: data.hasLifeguardCert ?? 'No',
          lifeguardExpiry: data.lifeguardExpiry ?? '',
          certificateDetails: data.certificateDetails ?? '',
          postName: data.postName ?? '',
          salary: data.salary ?? '',
          acceptedTerms: true,
        });
        setIsActive(data.isActive !== false);
        setExistingPhotos({
          identity: data.identityPhotoUrl || uploadUrl(data.identityPhotoPath),
          staff: uploadUrl(data.staffPhotoPath),
          lifeguard: uploadUrl(data.lifeguardPhotoPath),
          certs: [
            uploadUrl(data.certificatePhoto1),
            uploadUrl(data.certificatePhoto2),
            uploadUrl(data.certificatePhoto3),
          ],
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load staff'))
      .finally(() => setLoadingEdit(false));
  }, [editId, isEdit, isSampleEdit]);

  useEffect(() => {
    if (form.registrationFor !== 'Coach') return;
    if (isSampleEdit || isApplicationDemo()) {
      setAvailableBatches(SAMPLE_STAFF_BATCHES);
      setBatchesLoading(false);
      return;
    }
    setBatchesLoading(true);
    fetch('/api/batches')
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load batches');
        return res.json();
      })
      .then((data: { slots?: AvailableBatch[] }) => {
        const slots = [...(data.slots ?? [])].sort((a, b) => {
          const startDiff = String(a.startTime ?? '').localeCompare(String(b.startTime ?? ''));
          if (startDiff !== 0) return startDiff;
          return String(a.name ?? '').localeCompare(String(b.name ?? ''), undefined, {
            numeric: true,
            sensitivity: 'base',
          });
        });
        setAvailableBatches(slots);
      })
      .catch(() => setAvailableBatches([]))
      .finally(() => setBatchesLoading(false));
  }, [form.registrationFor, isSampleEdit]);

  const identityPreview = useObjectUrl(identityPhoto);
  const staffPreview = useObjectUrl(staffPhoto);
  const lifeguardPreview = useObjectUrl(lifeguardPhoto);
  const certPreviews = useObjectUrls(certPhotos);

  function clearInvalid(field: string) {
    setInvalidFields((prev) => {
      if (!prev.has(field)) return prev;
      const next = new Set(prev);
      next.delete(field);
      setErrorCount(next.size);
      return next;
    });
  }

  const selectedCoachBatches = useMemo(
    () => availableBatches.filter((batch) => form.suitableBatchIds.includes(batch.id)),
    [availableBatches, form.suitableBatchIds],
  );
  const hasAdvanceBatch = selectedCoachBatches.some((batch) => batch.type === 'Advance');
  const advanceNeedsCompetitive =
    hasAdvanceBatch && !form.teachStrokes.includes('Competitive');
  const isFemaleCoach = form.sex === 'Female';

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    clearInvalid(String(key));
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'sex' && value !== 'Female') {
        next.suitableBatchIds = prev.suitableBatchIds.filter((id) => {
          const batch = availableBatches.find((item) => item.id === id);
          return batch?.type !== 'Ladies';
        });
      }
      return next;
    });
  }

  function toggleStroke(stroke: string) {
    clearInvalid('teachStrokes');
    setForm((prev) => ({
      ...prev,
      teachStrokes: prev.teachStrokes.includes(stroke)
        ? prev.teachStrokes.filter((s) => s !== stroke)
        : [...prev.teachStrokes, stroke],
    }));
  }

  function toggleBatch(batchId: string) {
    const batch = availableBatches.find((item) => item.id === batchId);
    if (!batch) return;
    if (batch.type === 'Ladies' && form.sex !== 'Female') return;

    clearInvalid('suitableBatchIds');
    setForm((prev) => ({
      ...prev,
      suitableBatchIds: prev.suitableBatchIds.includes(batchId)
        ? prev.suitableBatchIds.filter((id) => id !== batchId)
        : [...prev.suitableBatchIds, batchId],
    }));
  }

  function setCertPhoto(index: number, file: File | null) {
    setCertPhotos((prev) => {
      const next = [...prev];
      next[index] = file;
      return next;
    });
  }

  function isInvalid(field: string) {
    return invalidFields.has(field);
  }

  function collectInvalidFields() {
    const fields = new Set<string>();

    if (!form.registrationFor) fields.add('registrationFor');
    if (!form.fullName.trim()) fields.add('fullName');
    if (!form.fullAddress.trim()) fields.add('fullAddress');
    if (!form.whatsappMobile.trim() || !isValidMobile(form.whatsappMobile)) {
      fields.add('whatsappMobile');
    }
    if (form.otherMobile.trim() && !isValidMobile(form.otherMobile)) {
      fields.add('otherMobile');
    }
    if (!form.email.trim() || !isValidEmail(form.email)) fields.add('email');
    if (!form.birthdate) fields.add('birthdate');
    else {
      const age = getAgeYears(form.birthdate);
      if (age === null || age <= 18) fields.add('birthdate');
    }
    if (!form.sex) fields.add('sex');
    if (!form.bloodGroup) fields.add('bloodGroup');

    if (!form.emergencyName.trim()) fields.add('emergencyName');
    if (!form.emergencyRelation) fields.add('emergencyRelation');
    if (!form.emergencyMobile.trim() || !isValidMobile(form.emergencyMobile)) {
      fields.add('emergencyMobile');
    } else if (
      emergencyMatchesApplicant({
        emergencyMobile: form.emergencyMobile,
        whatsappMobile: form.whatsappMobile,
        otherMobile: form.otherMobile,
      })
    ) {
      fields.add('emergencyMobile');
    }

    if (form.hasHealthIssue === 'Yes' && !form.healthIssueDetails.trim()) {
      fields.add('healthIssueDetails');
    }
    if (form.doctorNo.trim() && !isValidMobile(form.doctorNo)) {
      fields.add('doctorNo');
    }

    if (!form.identityDocument) fields.add('identityDocument');
    if (!isSampleEdit) {
      if (!identityPhoto && !existingPhotos.identity) fields.add('identityPhoto');
      if (!staffPhoto && !existingPhotos.staff) fields.add('staffPhoto');
    }

    if (form.registrationFor === 'Coach') {
      if (form.teachStrokes.length === 0) fields.add('teachStrokes');
      if (availableBatches.length > 0 && form.suitableBatchIds.length === 0) {
        fields.add('suitableBatchIds');
      }
      const selected = availableBatches.filter((batch) =>
        form.suitableBatchIds.includes(batch.id),
      );
      if (selected.some((batch) => batch.type === 'Advance') && !form.teachStrokes.includes('Competitive')) {
        fields.add('teachStrokes');
      }
      if (selected.some((batch) => batch.type === 'Ladies') && form.sex !== 'Female') {
        fields.add('suitableBatchIds');
        fields.add('sex');
      }
    }

    const needsLifeguardSection =
      form.registrationFor === 'Coach' || form.registrationFor === 'Lifeguard';
    if (needsLifeguardSection && form.hasLifeguardCert === 'Yes') {
      if (!form.lifeguardExpiry) fields.add('lifeguardExpiry');
      if (!isSampleEdit && !lifeguardPhoto && !existingPhotos.lifeguard) {
        fields.add('lifeguardPhoto');
      }
    }

    if (isEdit && form.registrationFor === 'Other') {
      if (!form.postName.trim()) fields.add('postName');
      if (form.salary === '' || Number.isNaN(Number(form.salary))) fields.add('salary');
    }

    if (!isEdit && !form.acceptedTerms) fields.add('acceptedTerms');

    return fields;
  }

  async function onToggleActive(nextActive: boolean) {
    if (!isEdit || editId === null || isSampleEdit) {
      setIsActive(nextActive);
      return;
    }
    const previous = isActive;
    setIsActive(nextActive);
    try {
      const res = await fetch(`/api/staff-registrations/${editId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: nextActive }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to update status');
      }
    } catch (err) {
      setIsActive(previous);
      setError(err instanceof Error ? err.message : 'Failed to update status');
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setErrorCount(0);

    const fields = collectInvalidFields();
    setInvalidFields(fields);
    if (fields.size > 0) {
      setErrorCount(fields.size);
      return;
    }

    if (isSampleEdit) {
      setSubmitting(true);
      setErrorCount(0);
      setInvalidFields(new Set());
      setSuccess(t("Staff details updated successfully."));
      setSubmitting(false);
      setTimeout(() => navigate(tenantPath('/coaches')), 800);
      return;
    }

    const data = new FormData();
    Object.entries(form).forEach(([key, value]) => {
      if (key === 'teachStrokes' || key === 'suitableBatchIds') {
        data.append(key, JSON.stringify(value));
      } else {
        data.append(key, String(value));
      }
    });
    if (isEdit) data.append('isActive', String(isActive));
    if (identityPhoto) data.append('identityPhoto', identityPhoto);
    if (staffPhoto) data.append('staffPhoto', staffPhoto);
    if (lifeguardPhoto) data.append('lifeguardPhoto', lifeguardPhoto);
    certPhotos.forEach((file, i) => {
      if (file) data.append(`certificatePhoto${i + 1}`, file);
    });

    setSubmitting(true);
    try {
      const res = await fetch(
        isEdit ? `/api/staff-registrations/${editId}` : '/api/staff-registrations',
        { method: isEdit ? 'PUT' : 'POST', body: data },
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? (isEdit ? 'Update failed' : 'Registration failed'));
      setErrorCount(0);
      setInvalidFields(new Set());
      if (isEdit) {
        setSuccess(t("Staff details updated successfully."));
        setTimeout(() => navigate(tenantPath('/coaches')), 800);
      } else {
        setForm(initialForm);
        setIdentityPhoto(null);
        setStaffPhoto(null);
        setLifeguardPhoto(null);
        setCertPhotos([null, null, null]);
        setExistingPhotos({
          identity: null,
          staff: null,
          lifeguard: null,
          certs: [null, null, null],
        });
        setSubmitted(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err) {
      setErrorCount(1);
      setError(err instanceof Error ? err.message : isEdit ? 'Update failed' : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  }

  function onSuccessOk() {
    setSubmitted(false);
    setError('');
    setErrorCount(0);
    setInvalidFields(new Set());
  }

  if (loadingEdit) {
    return (
      <PlatformPage title={isEdit ? "Staff details" : "Staff registration"}>
        <p className="pass-empty">{t("Loading…")}</p>
      </PlatformPage>
    );
  }

  if (submitted) {
    return (
      <PlatformPage
        title="Staff registration"
        actions={
          <>
          </>
        }
      >
        <div className="registration-success-panel">
          <p className="success">{t("Staff registration submitted successfully.")}</p>
          <button type="button" className="submit" onClick={onSuccessOk}>
            {t("OK")}
          </button>
        </div>
      </PlatformPage>
    );
  }

  return (
    <PlatformPage
      title={isEdit ? "Staff details" : "Staff registration"}
      actions={
        <>
          {isEdit ? (
            <Link className="menu-link" to={tenantPath('/coaches')}>
              {t("← Staff List")}
            </Link>
          ) : null}
          {isEdit ? (
            <label className="status-switch">
              <span className={isActive ? 'status-on' : 'status-off'}>
                {isActive ? t("Active") : t("Inactive")}
              </span>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => void onToggleActive(e.target.checked)}
                aria-label="Active status"
              />
            </label>
          ) : (
            <SendFormQrButton form="staff" />
          )}
        </>
      }
    >
      <p className="required-note">
        <span className="req">*</span> {t("Required information.")}
      </p>

      <form onSubmit={onSubmit} noValidate className="pass-form-card pool-core-form registration-form">
        <section className={`registration-section role-card${isInvalid('registrationFor') ? ' field-box-invalid' : ''}`}>
          <div className="role-row" role="radiogroup" aria-label={t("Registration for")}>
            <span className="role-label">
              {t("Registration for")}
              <span className="req"> *</span>
            </span>
            <div className="role-choices">
              {(
                [
                  ['Coach', t("Coach")],
                  ['Lifeguard', t("Lifeguard")],
                  ['Other', t("Other")],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={`choice-chip ${form.registrationFor === value ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="registrationFor"
                    value={value}
                    checked={form.registrationFor === value}
                    onChange={() => setField('registrationFor', value)}
                    required
                    aria-invalid={isInvalid('registrationFor')}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </section>

        <section className="registration-section">
          <h2>{t("Personal details")}</h2>
          <div className="grid-2">
            <label className="field field-beside">
              <Label required>{t("Full name")}</Label>
              <input
                value={form.fullName}
                onChange={(e) => setField('fullName', e.target.value)}
                placeholder={t("As per identity document")}
                required
                aria-invalid={isInvalid('fullName')}
              />
            </label>
            <label className="field field-beside">
              <Label required>{t("Full address")}</Label>
              <textarea
                value={form.fullAddress}
                onChange={(e) => setField('fullAddress', e.target.value)}
                placeholder={t("House no., street, city, state, PIN")}
                rows={3}
                required
                aria-invalid={isInvalid('fullAddress')}
              />
            </label>
          </div>
          <div className="grid-3 registration-align-3">
            <label className="field field-beside">
              <Label required>{t("WhatsApp mobile no.")}</Label>
              <input
                value={form.whatsappMobile}
                onChange={(e) => setField('whatsappMobile', sanitizeMobileInput(e.target.value))}
                placeholder={t("10-digit mobile number")}
                inputMode="numeric"
                pattern="\d{10}"
                required
                aria-invalid={isInvalid('whatsappMobile') || Boolean(mobileHint(form.whatsappMobile))}
              />
              {mobileHint(form.whatsappMobile) ? (
                <span className="field-error">{mobileHint(form.whatsappMobile)}</span>
              ) : null}
            </label>
            <label className="field field-beside">
              <Label>{t("Another mobile no.")}</Label>
              <input
                value={form.otherMobile}
                onChange={(e) => setField('otherMobile', sanitizeMobileInput(e.target.value))}
                placeholder={t("Optional 10-digit mobile number")}
                inputMode="numeric"
                pattern="\d{10}"
                aria-invalid={isInvalid('otherMobile') || Boolean(mobileHint(form.otherMobile))}
              />
              {mobileHint(form.otherMobile) ? (
                <span className="field-error">{mobileHint(form.otherMobile)}</span>
              ) : null}
            </label>
            <label className="field field-beside">
              <Label required>{t("Email")}</Label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
                placeholder={t("name@example.com")}
                required
                aria-invalid={isInvalid('email') || Boolean(emailHint(form.email))}
              />
              {emailHint(form.email) ? <span className="field-error">{emailHint(form.email)}</span> : null}
            </label>
          </div>
          <div className="grid-3 registration-align-3">
            <label className="field field-beside">
              <Label required>{t("Birth Date")}</Label>
              <input
                type="date"
                className="field-control-sm"
                value={form.birthdate}
                max={maxBirthdateForOver18()}
                onChange={(e) => setField('birthdate', e.target.value)}
                required
                aria-invalid={isInvalid('birthdate')}
              />
              {form.birthdate &&
              getAgeYears(form.birthdate) !== null &&
              (getAgeYears(form.birthdate) as number) <= 18 ? (
                <span className="field-error">{t("Staff must be more than 18 years old")}</span>
              ) : null}
            </label>
            <label className="field field-beside">
              <Label required>{t("Sex")}</Label>
              <select
                className="field-control-sm"
                value={form.sex}
                onChange={(e) => setField('sex', e.target.value)}
                required
                aria-invalid={isInvalid('sex')}
              >
                <option value="">{t("Select sex")}</option>
                <option value="Male">{t("Male")}</option>
                <option value="Female">{t("Female")}</option>
                <option value="Other">{t("Other")}</option>
              </select>
            </label>
            <label className="field field-beside">
              <Label required>{t("Blood group")}</Label>
              <select
                className="field-control-sm"
                value={form.bloodGroup}
                onChange={(e) => setField('bloodGroup', e.target.value)}
                required
                aria-invalid={isInvalid('bloodGroup')}
              >
                <option value="">{t("Select blood group")}</option>
                {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Not known'].map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="registration-section registration-section--emergency">
          <h2>{t("Emergency contact")}</h2>
          <div className="grid-3">
            <label className="field field-beside">
              <Label required>{t("Emergency contact name")}</Label>
              <input
                value={form.emergencyName}
                onChange={(e) => setField('emergencyName', e.target.value)}
                placeholder={t("Contact person name")}
                required
                aria-invalid={isInvalid('emergencyName')}
              />
            </label>
            <label className="field field-beside">
              <Label required>{t("Relation")}</Label>
              <select
                className="field-control-sm"
                value={form.emergencyRelation}
                onChange={(e) => setField('emergencyRelation', e.target.value)}
                required
                aria-invalid={isInvalid('emergencyRelation')}
              >
                <option value="">{t("Select relation")}</option>
                <option value="Parent">{t("Parent")}</option>
                <option value="Spouse">{t("Spouse")}</option>
                <option value="Sibling">{t("Sibling")}</option>
                <option value="Friend">{t("Friend")}</option>
                <option value="Guardian">{t("Guardian")}</option>
                <option value="Other">{t("Other")}</option>
              </select>
            </label>
            <label className="field field-beside">
              <Label required>{t("Emergency contact no.")}</Label>
              <input
                value={form.emergencyMobile}
                onChange={(e) =>
                  setField('emergencyMobile', sanitizeMobileInput(e.target.value))
                }
                placeholder={t("10-digit mobile number")}
                inputMode="numeric"
                pattern="\d{10}"
                required
                aria-invalid={isInvalid('emergencyMobile') || Boolean(mobileHint(form.emergencyMobile))}
              />
              {mobileHint(form.emergencyMobile) ? (
                <span className="field-error">{mobileHint(form.emergencyMobile)}</span>
              ) : emergencyMatchesApplicant({
                  emergencyMobile: form.emergencyMobile,
                  whatsappMobile: form.whatsappMobile,
                  otherMobile: form.otherMobile,
                }) ? (
                <span className="field-error">{t("Emergency contact number cannot be the same as the applicant mobile number")}</span>
              ) : null}
            </label>
          </div>
        </section>

        <section className="registration-section registration-section--medical">
          <h2>{t("Medical information")}</h2>
          <label className="field field-beside medical-health-issue">
            <Label required>{t("Do you have any health issue?")}</Label>
            <select
              className="field-control-sm"
              value={form.hasHealthIssue}
              onChange={(e) => setField('hasHealthIssue', e.target.value)}
              required
            >
              <option value="No">{t("No")}</option>
              <option value="Yes">{t("Yes")}</option>
            </select>
          </label>
          {form.hasHealthIssue === 'Yes' ? (
            <div className="medical-details grid-2">
              <label className="field field-beside medical-details-main">
                <Label required>{t("Disease / health issue")}</Label>
                <textarea
                  value={form.healthIssueDetails}
                  onChange={(e) => setField('healthIssueDetails', e.target.value)}
                  placeholder={t("Asthma, epilepsy, heart condition, etc.")}
                  rows={4}
                  required
                  aria-invalid={isInvalid('healthIssueDetails')}
                />
              </label>
              <div className="medical-doctor-col">
                <label className="field field-beside">
                  <Label>{t("Doctor name")}</Label>
                  <input
                    value={form.doctorName}
                    onChange={(e) => setField('doctorName', e.target.value)}
                    placeholder={t("Optional")}
                  />
                </label>
                <label className="field field-beside">
                  <Label>{t("Doctor no.")}</Label>
                  <input
                    value={form.doctorNo}
                    onChange={(e) => setField('doctorNo', sanitizeMobileInput(e.target.value))}
                    placeholder={t("Optional 10-digit number")}
                    inputMode="numeric"
                    pattern="\d{10}"
                    aria-invalid={isInvalid('doctorNo') || Boolean(mobileHint(form.doctorNo))}
                  />
                  {mobileHint(form.doctorNo) ? (
                    <span className="field-error">{mobileHint(form.doctorNo)}</span>
                  ) : null}
                </label>
              </div>
            </div>
          ) : null}
        </section>

        <section className="registration-section">
          <h2>{t("Identity & photo")}</h2>
          <div className="grid-2 registration-identity-row">
            <div
              className={`field field-beside registration-identity-doc${
                isInvalid('identityPhoto') ? ' field-box-invalid' : ''
              }`}
            >
              <Label required>{t("Identity document")}</Label>
              <select
                className="field-control-sm registration-identity-doc-select"
                value={form.identityDocument}
                onChange={(e) => setField('identityDocument', e.target.value)}
                required
                aria-invalid={isInvalid('identityDocument')}
              >
                <option value="">{t("Select document type")}</option>
                <option value="Aadhaar">{t("Aadhaar card")}</option>
                <option value="PAN">{t("PAN card")}</option>
                <option value="Passport">{t("Passport")}</option>
                <option value="Driving Licence">{t("Driving licence")}</option>
                <option value="School ID">{t("School / college ID")}</option>
              </select>
              <RegistrationPhotoField
                label={t("Photo of identity proof")}
                hint={t("Max 200 KB — upload or take a photo of your identity proof")}
                required
                hideLabel
                file={identityPhoto}
                preview={identityPreview}
                existingUrl={existingPhotos.identity}
                takeLabel={t("Take photo")}
                uploadLabel={t("Upload")}
                invalid={isInvalid('identityPhoto')}
                onClearExisting={() =>
                  setExistingPhotos((prev) => ({ ...prev, identity: null }))
                }
                onPick={(file) => {
                  clearInvalid('identityPhoto');
                  setIdentityPhoto(file);
                }}
              />
            </div>
            <RegistrationPhotoField
              label={t("Photo")}
              hint={t("Max 200 KB — recent passport-size photo for identification")}
              required
              file={staffPhoto}
              preview={staffPreview}
              existingUrl={existingPhotos.staff}
              takeLabel={t("Take photo")}
              uploadLabel={t("Upload")}
              invalid={isInvalid('staffPhoto')}
              onClearExisting={() => setExistingPhotos((prev) => ({ ...prev, staff: null }))}
              onPick={(file) => {
                clearInvalid('staffPhoto');
                setStaffPhoto(file);
              }}
            />
          </div>
        </section>

        {form.registrationFor === 'Coach' ? (
          <>
            <section className={`registration-section coach-card${isInvalid('suitableBatchIds') ? ' field-box-invalid' : ''}`}>
              <h2>{t("Suitable Batch Slot")}</h2>
              {batchesLoading ? (
                <p className="batch-empty">Loading batches…</p>
              ) : availableBatches.length === 0 ? (
                <p className="batch-empty">
                  {t("No batches are set up yet.")}{' '}
                  <Link className="terms-link" to={tenantPath('/batches')}>
                    {t("Set up batches first")}
                  </Link>
                </p>
              ) : (
                <div className="batch-options">
                  {availableBatches.map((batch) => {
                    const selected = form.suitableBatchIds.includes(batch.id);
                    const ladiesLocked = batch.type === 'Ladies' && !isFemaleCoach;
                    const advanceInvalid =
                      selected && batch.type === 'Advance' && advanceNeedsCompetitive;
                    return (
                      <label
                        key={batch.id}
                        className={`batch-option${selected ? ' selected' : ''}${ladiesLocked ? ' disabled' : ''}${advanceInvalid ? ' invalid' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={ladiesLocked}
                          onChange={() => toggleBatch(batch.id)}
                        />
                        <span>
                          {batch.name} — {batch.type} — {formatBatchTime(batch.startTime)} to{' '}
                          {formatBatchTime(batch.endTime)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              {!isFemaleCoach ? <p className="hint">{t("Ladies batch is allowed for Female coaches only.")}</p> : null}
              {advanceNeedsCompetitive ? (
                <p className="field-error">{t("Advance batch requires Competitive under Interested to teach.")}</p>
              ) : null}
            </section>

            <section className={`registration-section coach-card${isInvalid('teachStrokes') ? ' field-box-invalid' : ''}`}>
              <div className="coach-teach-row">
                <h2>
                  {t("Interested to teach")}
                  <span className="req"> *</span>
                </h2>
                <div className="check-row">
                  {(
                    [
                      ['Free Style', t("Free Style")],
                      ['Back Stroke', t("Back Stroke")],
                      ['Breast Stroke', t("Breast Stroke")],
                      ['Butterfly', t("Butterfly")],
                      ['Competitive', t("Competitive")],
                    ] as const
                  ).map(([value, label]) => (
                    <label key={value} className="radio-option">
                      <input
                        type="checkbox"
                        checked={form.teachStrokes.includes(value)}
                        onChange={() => toggleStroke(value)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </section>

            <section className="registration-section">
              <h2>{t("Achievements and certificates")}</h2>
              <div className="achievements-cert-row">
                <label className="field achievements-cert-text">
                  <textarea
                    value={form.achievements}
                    onChange={(e) => setField('achievements', e.target.value)}
                    placeholder={t("Competition results, medals, records, coaching experience highlights, etc.")}
                    rows={4}
                  />
                </label>
                <div className="achievements-cert-uploads">
                  <MultiCertificateField
                    label={t("Certificates")}
                    hint={t("Optional — upload up to 3 certificate photos (max 200 KB each)")}
                    files={certPhotos}
                    previews={certPreviews}
                    existingUrls={existingPhotos.certs}
                    takeLabel={t("Take photo")}
                    uploadLabel={t("Upload")}
                    onChangeFiles={setCertPhotos}
                    onChangeExisting={(certs) =>
                      setExistingPhotos((prev) => ({ ...prev, certs }))
                    }
                  />
                </div>
              </div>
            </section>
          </>
        ) : null}

        {isEdit && form.registrationFor === 'Other' ? (
          <section className="registration-section">
            <h2>{t("Post details")}</h2>
            <div className="grid-2">
              <label className="field field-beside">
                <Label required>{t("Post name")}</Label>
                <input
                  value={form.postName}
                  onChange={(e) => setField('postName', e.target.value)}
                  placeholder={t("e.g. Manager, Accountant, Cleaner")}
                  required
                  aria-invalid={isInvalid('postName')}
                />
              </label>
              <label className="field field-beside">
                <Label required>{t("Salary")}</Label>
                <div className="money-input">
                  <span className="money-prefix" aria-hidden="true">
                    ₹
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={form.salary}
                    onChange={(e) => setField('salary', e.target.value)}
                    placeholder={t("e.g. 15000")}
                    required
                    aria-label={t("Salary")}
                    aria-invalid={isInvalid('salary')}
                  />
                </div>
              </label>
            </div>
          </section>
        ) : null}

        {form.registrationFor === 'Coach' || form.registrationFor === 'Lifeguard' ? (
          <section className="registration-section lifeguard-card">
            <div className="lifeguard-head-row">
              <h2>{t("Life Guard certificate")}</h2>
              <span className="lifeguard-question">{t("Do you have life guard certification?")}</span>
              <div className="lifeguard-choices">
                <label className="radio-option">
                  <input
                    type="radio"
                    name="hasLifeguardCert"
                    checked={form.hasLifeguardCert === 'Yes'}
                    onChange={() => setField('hasLifeguardCert', 'Yes')}
                  />
                  {t("Yes")}
                </label>
                <label className="radio-option">
                  <input
                    type="radio"
                    name="hasLifeguardCert"
                    checked={form.hasLifeguardCert === 'No'}
                    onChange={() => {
                      setField('hasLifeguardCert', 'No');
                      setField('lifeguardExpiry', '');
                      clearInvalid('lifeguardPhoto');
                      setLifeguardPhoto(null);
                    }}
                  />
                  {t("No")}
                </label>
              </div>
              {form.hasLifeguardCert === 'Yes' ? (
                <>
                  <label className="lifeguard-expiry field field-beside">
                    <span className="label">
                      {t("Expiring On")}
                      <span className="req"> *</span>
                    </span>
                    <input
                      className="field-control-sm"
                      type="date"
                      value={form.lifeguardExpiry}
                      onChange={(e) => setField('lifeguardExpiry', e.target.value)}
                      required
                      aria-invalid={isInvalid('lifeguardExpiry')}
                    />
                  </label>
                  <div className="lifeguard-photo-inline">
                    <RegistrationPhotoField
                      label={t("Certificate")}
                      hint={t("Max 200 KB — upload or take a clear photo of the Life Guard certificate")}
                      required
                      file={lifeguardPhoto}
                      preview={lifeguardPreview}
                      existingUrl={existingPhotos.lifeguard}
                      takeLabel={t("Take photo")}
                      uploadLabel={t("Upload")}
                      invalid={isInvalid('lifeguardPhoto')}
                      onClearExisting={() =>
                        setExistingPhotos((prev) => ({ ...prev, lifeguard: null }))
                      }
                      onPick={(file) => {
                        clearInvalid('lifeguardPhoto');
                        setLifeguardPhoto(file);
                      }}
                    />
                  </div>
                </>
              ) : null}
            </div>
          </section>
        ) : null}

        <div className="footer-row">
          {isEdit ? (
            <span />
          ) : (
            <label className={`terms${isInvalid('acceptedTerms') ? ' field-box-invalid' : ''}`}>
              <input
                type="checkbox"
                checked={form.acceptedTerms}
                onChange={(e) => setField('acceptedTerms', e.target.checked)}
                required
                aria-invalid={isInvalid('acceptedTerms')}
              />
              <span>
                {t("I accept the")}{' '}
                <button type="button" className="terms-link" onClick={() => setTermsOpen(true)}>
                  {t("Terms & Conditions")}
                </button>
              </span>
            </label>
          )}
          <div className="submit-wrap">
            {errorCount > 0 ? (
              <p className="error submit-error-count">
                {errorCount === 1
                  ? t("1 error")
                  : t("{count} errors").replace('{count}', String(errorCount))}
              </p>
            ) : null}
            <button className="submit" type="submit" disabled={submitting}>
              {submitting ? t("Submitting…") : isEdit ? t("Save changes") : t("Submit")}
            </button>
          </div>
        </div>

        {error ? <p className="error">{error}</p> : null}
        {success ? <p className="success">{success}</p> : null}
      </form>

      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} variant="staff" />
    </PlatformPage>
  );
}
