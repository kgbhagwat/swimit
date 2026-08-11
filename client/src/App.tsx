import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useT } from './i18n';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { PlatformPage } from './PlatformPage';
import { emailHint, emergencyMatchesApplicant, isValidEmail, isValidMobile, mobileHint, sanitizeMobileInput } from './formValidation';
import { canEditPage } from './pageAccess';
import { SendFormQrButton } from './SendFormQrButton';
import { tenantPath } from './tenantSession';
import { TermsModal } from './TermsModal';
import { RegistrationPhotoField } from './RegistrationPhotoField';
import { useObjectUrl } from './useObjectUrl';


type FormState = {
  fullName: string;
  fullAddress: string;
  whatsappMobile: string;
  otherMobile: string;
  email: string;
  birthdate: string;
  sex: string;
  bloodGroup: string;
  parentName: string;
  parentRelation: string;
  parentMobile: string;
  emergencyName: string;
  emergencyRelation: string;
  emergencyMobile: string;
  hasHealthIssue: string;
  healthIssueDetails: string;
  doctorName: string;
  doctorNo: string;
  identityDocument: string;
  identityNumber: string;
  acceptedTerms: boolean;
};

const initialForm: FormState = {
  fullName: '',
  fullAddress: '',
  whatsappMobile: '',
  otherMobile: '',
  email: '',
  birthdate: '',
  sex: '',
  bloodGroup: '',
  parentName: '',
  parentRelation: '',
  parentMobile: '',
  emergencyName: '',
  emergencyRelation: '',
  emergencyMobile: '',
  hasHealthIssue: 'No',
  healthIssueDetails: '',
  doctorName: '',
  doctorNo: '',
  identityDocument: '',
  identityNumber: '',
  acceptedTerms: false,
};

function Label({ children, required }: { children: string; required?: boolean }) {
  return (
    <span className="label">
      {children}
      {required ? <span className="req"> *</span> : null}
    </span>
  );
}

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

export function App() {
  const { id: editIdParam } = useParams();
  const editId = Number(editIdParam);
  const isEdit = Number.isFinite(editId) && editId > 0;
  const navigate = useNavigate();
  const location = useLocation();

  const t = useT();
  const [form, setForm] = useState<FormState>(initialForm);
  const [identityPhoto, setIdentityPhoto] = useState<File | null>(null);
  const [swimmerPhoto, setSwimmerPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [errorCount, setErrorCount] = useState(0);
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set());
  const [missingLabels, setMissingLabels] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [parentOnly, setParentOnly] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(isEdit);
  const [loadError, setLoadError] = useState('');
  const [existingIdentityUrl, setExistingIdentityUrl] = useState<string | null>(null);
  const [existingSwimmerUrl, setExistingSwimmerUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isEdit) return;
    if (!canEditPage('swimmers')) {
      setLoadError('You do not have permission to edit swimmers');
      setLoadingEdit(false);
      return;
    }
    setLoadingEdit(true);
    setLoadError('');
    fetch(`/api/registrations/${editId}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? 'Failed to load swimmer');
        }
        return res.json();
      })
      .then((data) => {
        setForm({
          fullName: data.fullName ?? '',
          fullAddress: data.fullAddress ?? '',
          whatsappMobile: data.whatsappMobile ?? '',
          otherMobile: data.otherMobile ?? '',
          email: data.email ?? '',
          birthdate: data.birthdate ?? '',
          sex: data.sex ?? '',
          bloodGroup: data.bloodGroup ?? '',
          parentName: data.parentName ?? '',
          parentRelation: data.parentRelation ?? '',
          parentMobile: data.parentMobile ?? '',
          emergencyName: data.emergencyName ?? '',
          emergencyRelation: data.emergencyRelation ?? '',
          emergencyMobile: data.emergencyMobile ?? '',
          hasHealthIssue: data.hasHealthIssue ?? 'No',
          healthIssueDetails: data.healthIssueDetails ?? '',
          doctorName: data.doctorName ?? '',
          doctorNo: data.doctorNo ?? '',
          identityDocument: data.identityDocument ?? '',
          identityNumber: data.identityNumber ?? '',
          acceptedTerms: true,
        });
        setExistingIdentityUrl(data.identityPhotoUrl ?? null);
        setExistingSwimmerUrl(data.photoUrl ?? null);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load swimmer'))
      .finally(() => setLoadingEdit(false));
  }, [editId, isEdit]);

  const ageYears = useMemo(() => getAgeYears(form.birthdate), [form.birthdate]);
  const needsParentInfo = ageYears !== null && ageYears < 18;

  const identityPreview = useObjectUrl(identityPhoto);
  const swimmerPreview = useObjectUrl(swimmerPhoto);

  function mapParentRelationToEmergency(relation: string) {
    if (relation === 'Father' || relation === 'Mother') return 'Parent';
    if (relation === 'Guardian') return 'Guardian';
    if (relation === 'Other') return 'Other';
    return relation;
  }

  function copyParentToEmergency(next: FormState) {
    return {
      ...next,
      emergencyName: next.parentName,
      emergencyRelation: mapParentRelationToEmergency(next.parentRelation),
      emergencyMobile: next.parentMobile,
    };
  }

  function fieldLabel(key: string) {
    const labels: Record<string, string> = {
      fullName: t("Full name"),
      fullAddress: t("Full address"),
      whatsappMobile: t("WhatsApp mobile no."),
      otherMobile: t("Another mobile no."),
      email: t("Email"),
      birthdate: t("Birth Date"),
      sex: t("Sex"),
      bloodGroup: t("Blood group"),
      parentName: t("Name"),
      parentRelation: t("Relationship"),
      parentMobile: t("Contact no."),
      emergencyName: t("Emergency contact name"),
      emergencyRelation: t("Relation"),
      emergencyMobile: t("Emergency contact no."),
      healthIssueDetails: t("Disease / health issue"),
      doctorNo: t("Doctor no."),
      identityDocument: t("Identity document"),
      identityNumber: t('Identity number'),
      identityPhoto: t("Photo of identity proof"),
      swimmerPhoto: t("Swimmer photo"),
      acceptedTerms: t("Terms & Conditions"),
    };
    return labels[key] ?? key;
  }

  function labelsForFields(fields: Set<string>) {
    return [...fields].map((key) => fieldLabel(key));
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setInvalidFields((prev) => {
      if (!prev.has(String(key))) return prev;
      const next = new Set(prev);
      next.delete(String(key));
      setErrorCount(next.size);
      setMissingLabels(labelsForFields(next));
      if (next.size === 0) setError('');
      return next;
    });
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (
        parentOnly &&
        needsParentInfo &&
        (key === 'parentName' || key === 'parentRelation' || key === 'parentMobile')
      ) {
        return copyParentToEmergency(next);
      }
      return next;
    });
  }

  function onBirthdateChange(value: string) {
    setInvalidFields((prev) => {
      if (!prev.has('birthdate')) return prev;
      const next = new Set(prev);
      next.delete('birthdate');
      return next;
    });
    const age = getAgeYears(value);
    if (age !== null && age >= 18) {
      setParentOnly(false);
    }
    setForm((prev) => ({
      ...prev,
      birthdate: value,
      ...(age !== null && age >= 18
        ? { parentName: '', parentRelation: '', parentMobile: '' }
        : {}),
    }));
  }

  function onParentOnlyChange(checked: boolean) {
    setParentOnly(checked);
    if (checked) {
      setForm((prev) => copyParentToEmergency(prev));
    }
  }

  function isInvalid(field: string) {
    return invalidFields.has(field);
  }

  function collectInvalidFields() {
    const fields = new Set<string>();

    if (!form.fullName.trim()) fields.add('fullName');
    if (!form.fullAddress.trim()) fields.add('fullAddress');
    if (!form.whatsappMobile.trim() || !isValidMobile(form.whatsappMobile)) {
      fields.add('whatsappMobile');
    }
    if (form.otherMobile.trim() && !isValidMobile(form.otherMobile)) {
      fields.add('otherMobile');
    }
    if (form.email.trim() && !isValidEmail(form.email)) fields.add('email');
    if (!form.birthdate) fields.add('birthdate');
    if (!form.sex) fields.add('sex');
    if (!form.bloodGroup) fields.add('bloodGroup');

    if (needsParentInfo) {
      if (!form.parentName.trim()) fields.add('parentName');
      if (!form.parentRelation) fields.add('parentRelation');
      if (!form.parentMobile.trim() || !isValidMobile(form.parentMobile)) {
        fields.add('parentMobile');
      }
    }

    if (!form.emergencyName.trim()) fields.add('emergencyName');
    if (!form.emergencyRelation) fields.add('emergencyRelation');
    if (!form.emergencyMobile.trim() || !isValidMobile(form.emergencyMobile)) {
      fields.add('emergencyMobile');
    } else if (
      !needsParentInfo &&
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
    if (form.identityNumber.trim().replace(/\s+/g, '').length < 4) {
      fields.add('identityNumber');
    }
    if (isEdit) {
      if (!identityPhoto && !existingIdentityUrl) fields.add('identityPhoto');
      if (!swimmerPhoto && !existingSwimmerUrl) fields.add('swimmerPhoto');
    } else {
      if (!identityPhoto) fields.add('identityPhoto');
      if (!swimmerPhoto) fields.add('swimmerPhoto');
    }
    if (!isEdit && !form.acceptedTerms) fields.add('acceptedTerms');

    return fields;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setErrorCount(0);
    setMissingLabels([]);

    const fields = collectInvalidFields();
    setInvalidFields(fields);
    if (fields.size > 0) {
      setErrorCount(fields.size);
      setMissingLabels(labelsForFields(fields));
      return;
    }

    const data = new FormData();
    Object.entries(form).forEach(([key, value]) => {
      data.append(key, String(value));
    });
    if (identityPhoto) data.append('identityPhoto', identityPhoto);
    if (swimmerPhoto) data.append('swimmerPhoto', swimmerPhoto);

    setSubmitting(true);
    try {
      const res = await fetch(
        isEdit ? `/api/registrations/${editId}` : '/api/registrations',
        { method: isEdit ? 'PUT' : 'POST', body: data },
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error ?? (isEdit ? 'Update failed' : 'Registration failed'));
      }
      if (isEdit) {
        const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;
        navigate(typeof returnTo === 'string' && returnTo ? returnTo : tenantPath('/swimmers'));
        return;
      }
      setForm(initialForm);
      setParentOnly(false);
      setIdentityPhoto(null);
      setSwimmerPhoto(null);
      setError('');
      setErrorCount(0);
      setMissingLabels([]);
      setInvalidFields(new Set());
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setErrorCount(1);
      setMissingLabels([]);
      setError(err instanceof Error ? err.message : isEdit ? 'Update failed' : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  }

  function onSuccessOk() {
    setSubmitted(false);
    setError('');
    setErrorCount(0);
    setMissingLabels([]);
    setInvalidFields(new Set());
  }

  if (isEdit && loadingEdit) {
    return (
      <PlatformPage title={isEdit ? "Edit swimmer" : "Registration form"}>
        <p className="pass-empty">{t("Loading…")}</p>
      </PlatformPage>
    );
  }

  if (isEdit && loadError) {
    return (
      <PlatformPage title={isEdit ? "Edit swimmer" : "Registration form"}>
        <p className="error">{loadError}</p>
      </PlatformPage>
    );
  }

  if (submitted) {
    return (
      <PlatformPage
        title="Registration form"
        actions={
          <>
            <SendFormQrButton form="swimmer" />
          </>
        }
      >
        <div className="registration-success-panel">
          <p className="success">{t("Registration submitted successfully.")}</p>
          <button type="button" className="submit" onClick={onSuccessOk}>
            {t("OK")}
          </button>
        </div>
      </PlatformPage>
    );
  }

  return (
    <PlatformPage
      title={isEdit ? "Edit swimmer" : "Registration form"}
      actions={
        <>
          {isEdit ? null : <SendFormQrButton form="swimmer" />}
        </>
      }
    >
      <p className="required-note">
        <span className="req">*</span> {t("Required information.")}
      </p>

      <form onSubmit={onSubmit} noValidate className="pass-form-card pool-core-form registration-form">
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
                placeholder={t("Optional 10-digit number")}
                inputMode="numeric"
                pattern="\d{10}"
                aria-invalid={isInvalid('otherMobile') || Boolean(mobileHint(form.otherMobile))}
              />
              {mobileHint(form.otherMobile) ? (
                <span className="field-error">{mobileHint(form.otherMobile)}</span>
              ) : null}
            </label>
            <label className="field field-beside">
              <Label>{t("Email")}</Label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
                placeholder={t("name@example.com")}
                pattern="[^@\s]+@[^@\s]+\.[^@\s]+"
                title="Email must include @ and ."
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
                onChange={(e) => onBirthdateChange(e.target.value)}
                required
                aria-invalid={isInvalid('birthdate')}
              />
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

        {needsParentInfo ? (
          <section className="registration-section">
            <h2>{t("Parent information")}</h2>
            <div className="grid-3 registration-align-3 registration-align-3--parent">
              <label className="field field-beside">
                <Label required>{t("Name")}</Label>
                <input
                  value={form.parentName}
                  onChange={(e) => setField('parentName', e.target.value)}
                  placeholder={t("Parent / guardian full name")}
                  required
                  aria-invalid={isInvalid('parentName')}
                />
              </label>
              <label className="field field-beside">
                <Label required>{t("Relationship")}</Label>
                <select
                  className="field-control-sm"
                  value={form.parentRelation}
                  onChange={(e) => setField('parentRelation', e.target.value)}
                  required
                  aria-invalid={isInvalid('parentRelation')}
                >
                  <option value="">{t("Select relationship")}</option>
                  <option value="Father">{t("Father")}</option>
                  <option value="Mother">{t("Mother")}</option>
                  <option value="Guardian">{t("Guardian")}</option>
                  <option value="Other">{t("Other")}</option>
                </select>
              </label>
              <label className="field field-beside">
                <Label required>{t("Contact no.")}</Label>
                <input
                  value={form.parentMobile}
                  onChange={(e) =>
                    setField('parentMobile', sanitizeMobileInput(e.target.value))
                  }
                  placeholder={t("10-digit mobile number")}
                  inputMode="numeric"
                  pattern="\d{10}"
                  required
                  aria-invalid={isInvalid('parentMobile') || Boolean(mobileHint(form.parentMobile))}
                />
                {mobileHint(form.parentMobile) ? (
                  <span className="field-error">{mobileHint(form.parentMobile)}</span>
                ) : null}
              </label>
            </div>
          </section>
        ) : null}

        <section className="registration-section registration-section--emergency">
          <h2>{t("Emergency contact")}</h2>
          {needsParentInfo ? (
            <label className="parent-only-check">
              <input
                type="checkbox"
                checked={parentOnly}
                onChange={(e) => onParentOnlyChange(e.target.checked)}
              />
              <span>{t("Parent only")}</span>
            </label>
          ) : null}
          <div className="grid-3">
            <label className="field field-beside">
              <Label required>{t("Emergency contact name")}</Label>
              <input
                value={form.emergencyName}
                onChange={(e) => setField('emergencyName', e.target.value)}
                placeholder={t("Contact person name")}
                required
                readOnly={parentOnly && needsParentInfo}
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
                disabled={parentOnly && needsParentInfo}
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
                readOnly={parentOnly && needsParentInfo}
                aria-invalid={isInvalid('emergencyMobile') || Boolean(mobileHint(form.emergencyMobile))}
              />
              {mobileHint(form.emergencyMobile) ? (
                <span className="field-error">{mobileHint(form.emergencyMobile)}</span>
              ) : !needsParentInfo &&
                emergencyMatchesApplicant({
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
          <h2>{t("Identity & photos")}</h2>
          <div className="registration-identity-row">
            <label
              className={`field field-beside registration-identity-doc${
                isInvalid('identityDocument') ? ' field-box-invalid' : ''
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
            </label>
            <label
              className={`field field-beside registration-identity-number${
                isInvalid('identityNumber') ? ' field-box-invalid' : ''
              }`}
            >
              <Label required>{t('Identity number')}</Label>
              <input
                className="field-control-sm"
                value={form.identityNumber}
                onChange={(e) => setField('identityNumber', e.target.value)}
                placeholder={t('Enter document number')}
                autoComplete="off"
                required
                aria-invalid={isInvalid('identityNumber')}
              />
            </label>
            <RegistrationPhotoField
              label={t("Photo of identity proof")}
              hint={t("Max 200 KB — upload or take a photo of your identity proof")}
              required
              hideLabel
              protectFromCapture
              identityNumberToMask={form.identityNumber}
              file={identityPhoto}
              preview={identityPreview}
              existingUrl={existingIdentityUrl}
              takeLabel={t("Take photo")}
              uploadLabel={t("Upload")}
              invalid={isInvalid('identityPhoto')}
              onClearExisting={() => setExistingIdentityUrl(null)}
              onPick={(file) => {
                setInvalidFields((prev) => {
                  if (!prev.has('identityPhoto')) return prev;
                  const next = new Set(prev);
                  next.delete('identityPhoto');
                  setErrorCount(next.size);
                  return next;
                });
                setIdentityPhoto(file);
              }}
            />
            <RegistrationPhotoField
              label={t("Swimmer photo")}
              hint={t("Max 200 KB — recent passport-size photo of the swimmer")}
              required
              protectFromCapture
              file={swimmerPhoto}
              preview={swimmerPreview}
              existingUrl={existingSwimmerUrl}
              takeLabel={t("Take photo")}
              uploadLabel={t("Upload")}
              invalid={isInvalid('swimmerPhoto')}
              onClearExisting={() => setExistingSwimmerUrl(null)}
              onPick={(file) => {
                setInvalidFields((prev) => {
                  if (!prev.has('swimmerPhoto')) return prev;
                  const next = new Set(prev);
                  next.delete('swimmerPhoto');
                  setErrorCount(next.size);
                  return next;
                });
                setSwimmerPhoto(file);
              }}
            />
          </div>
        </section>

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
              <div className="submit-error-block" role="alert">
                <p className="error submit-error-count">
                  {errorCount === 1
                    ? t("1 error")
                    : t("{count} errors").replace('{count}', String(errorCount))}
                </p>
                {error ? <p className="error submit-error-detail">{error}</p> : null}
                {missingLabels.length > 0 ? (
                  <ul className="submit-error-list">
                    {missingLabels.map((label) => (
                      <li key={label}>{label}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            <button className="submit" type="submit" disabled={submitting}>
              {submitting ? t("Submitting…") : isEdit ? t("Save changes") : t("Submit")}
            </button>
          </div>
        </div>
      </form>

      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} variant="swimmer" />
    </PlatformPage>
  );
}
