import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useT } from './i18n';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { PlatformPage } from './PlatformPage';
import { emailHint, emergencyMatchesApplicant, isValidEmail, isValidMobile, isValidPersonName, mobileHint, nameHint, sanitizeMobileInput, sanitizeNameInput } from './formValidation';
import { canEditPage } from './pageAccess';
import { SendFormQrButton } from './SendFormQrButton';
import { tenantPath } from './tenantSession';
import { TermsModal } from './TermsModal';
import { IdentityCaptureFields } from './IdentityCaptureFields';
import { identityNumberError } from './identityNumber';
import { RegistrationPhotoField } from './RegistrationPhotoField';
import { BirthDateField, ageYearsAsOfToday } from './BirthDateField';
import { clearFormDraft, mergeDraft, readFormDraft, useFormDraft } from './formDraft';
import { useObjectUrl } from './useObjectUrl';
import type { SwimmerProfile } from './SwimmerProfileReview';
import { fileAsDataUrl, saveSampleSwimmerProfile } from './sampleSwimmerEdit';


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

function FieldValidationError({
  show,
  message = 'This field is required.',
}: {
  show: boolean;
  message?: string;
}) {
  const t = useT();
  return show ? <span className="field-error">{t(message)}</span> : null;
}

const SWIMMER_FORM_DRAFT = 'swimmer-registration';

type SwimmerDraft = { form: FormState; parentOnly: boolean };

function getAgeYears(birthdate: string) {
  return ageYearsAsOfToday(birthdate);
}

function profileToForm(data: SwimmerProfile): FormState {
  return {
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
  };
}

function formToProfile(
  form: FormState,
  base: SwimmerProfile,
  identityPhotoUrl: string | null,
  photoUrl: string | null,
): SwimmerProfile {
  return {
    ...base,
    fullName: form.fullName,
    fullAddress: form.fullAddress,
    whatsappMobile: form.whatsappMobile,
    otherMobile: form.otherMobile,
    email: form.email,
    birthdate: form.birthdate,
    sex: form.sex,
    bloodGroup: form.bloodGroup,
    parentName: form.parentName,
    parentRelation: form.parentRelation,
    parentMobile: form.parentMobile,
    emergencyName: form.emergencyName,
    emergencyRelation: form.emergencyRelation,
    emergencyMobile: form.emergencyMobile,
    hasHealthIssue: form.hasHealthIssue,
    healthIssueDetails: form.healthIssueDetails,
    doctorName: form.doctorName,
    doctorNo: form.doctorNo,
    identityDocument: form.identityDocument,
    identityNumber: form.identityNumber,
    identityPhotoUrl,
    photoUrl,
  };
}

export function App() {
  const { id: editIdParam } = useParams();
  const editId = Number(editIdParam);
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as {
    returnTo?: string;
    sampleProfile?: SwimmerProfile;
  } | null;
  const sampleProfile = locationState?.sampleProfile ?? null;
  const isSampleEdit = Boolean(sampleProfile && editId < 0);
  const isEdit = (Number.isFinite(editId) && editId > 0) || isSampleEdit;

  const t = useT();
  const savedDraft = !isEdit ? readFormDraft<SwimmerDraft>(SWIMMER_FORM_DRAFT) : null;
  const [form, setForm] = useState<FormState>(() => mergeDraft(initialForm, savedDraft?.form));
  const [identityPhoto, setIdentityPhoto] = useState<File | null>(null);
  const [swimmerPhoto, setSwimmerPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [errorCount, setErrorCount] = useState(0);
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [parentOnly, setParentOnly] = useState(() => Boolean(savedDraft?.parentOnly));
  const [loadingEdit, setLoadingEdit] = useState(isEdit);
  const [loadError, setLoadError] = useState('');
  const [existingIdentityUrl, setExistingIdentityUrl] = useState<string | null>(null);
  const [existingSwimmerUrl, setExistingSwimmerUrl] = useState<string | null>(null);

  useFormDraft(SWIMMER_FORM_DRAFT, { form, parentOnly }, !isEdit && !submitted);

  useEffect(() => {
    if (!isEdit) return;
    if (isSampleEdit && sampleProfile) {
      setForm(profileToForm(sampleProfile));
      setExistingIdentityUrl(sampleProfile.identityPhotoUrl ?? null);
      setExistingSwimmerUrl(sampleProfile.photoUrl ?? null);
      setLoadingEdit(false);
      return;
    }
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
        setForm(profileToForm(data as SwimmerProfile));
        setExistingIdentityUrl(data.identityPhotoUrl ?? null);
        setExistingSwimmerUrl(data.photoUrl ?? null);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load swimmer'))
      .finally(() => setLoadingEdit(false));
  }, [editId, isEdit, isSampleEdit, sampleProfile]);

  const ageYears = useMemo(() => getAgeYears(form.birthdate), [form.birthdate]);
  const needsParentInfo = ageYears !== null && ageYears < 18;

  const identityPreview = useObjectUrl(identityPhoto);
  const swimmerPreview = useObjectUrl(swimmerPhoto);

  function cancelEdit() {
    navigate(locationState?.returnTo || tenantPath('/swimmers'));
  }

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

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setInvalidFields((prev) => {
      if (!prev.has(String(key))) return prev;
      const next = new Set(prev);
      next.delete(String(key));
      setErrorCount(next.size);
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
      setErrorCount(next.size);
      if (next.size === 0) setError('');
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

    if (!form.fullName.trim() || !isValidPersonName(form.fullName)) fields.add('fullName');
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
      if (!form.parentName.trim() || !isValidPersonName(form.parentName)) fields.add('parentName');
      if (!form.parentRelation) fields.add('parentRelation');
      if (!form.parentMobile.trim() || !isValidMobile(form.parentMobile)) {
        fields.add('parentMobile');
      }
    }

    if (!form.emergencyName.trim() || !isValidPersonName(form.emergencyName)) fields.add('emergencyName');
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
    if (identityNumberError(form.identityNumber)) fields.add('identityNumber');
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

    const fields = collectInvalidFields();
    setInvalidFields(fields);
    if (fields.size > 0) {
      setErrorCount(fields.size);
      return;
    }

    if (isSampleEdit && sampleProfile) {
      setSubmitting(true);
      try {
        const identityPhotoUrl = identityPhoto
          ? await fileAsDataUrl(identityPhoto)
          : existingIdentityUrl;
        const photoUrl = swimmerPhoto ? await fileAsDataUrl(swimmerPhoto) : existingSwimmerUrl;
        saveSampleSwimmerProfile(
          formToProfile(form, sampleProfile, identityPhotoUrl, photoUrl),
        );
        navigate(locationState?.returnTo || tenantPath('/pass-payment'));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Update failed');
      } finally {
        setSubmitting(false);
      }
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
        const returnTo = locationState?.returnTo;
        navigate(typeof returnTo === 'string' && returnTo ? returnTo : tenantPath('/swimmers'));
        return;
      }
      setForm(initialForm);
      setParentOnly(false);
      setIdentityPhoto(null);
      setSwimmerPhoto(null);
      clearFormDraft(SWIMMER_FORM_DRAFT);
      setError('');
      setErrorCount(0);
      setInvalidFields(new Set());
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
                onChange={(e) => setField('fullName', sanitizeNameInput(e.target.value))}
                placeholder={t("As per identity document")}
                autoCapitalize="words"
                autoComplete="name"
                required
                aria-invalid={isInvalid('fullName') || Boolean(nameHint(form.fullName))}
              />
              {nameHint(form.fullName) ? (
                <span className="field-error">{t(nameHint(form.fullName))}</span>
              ) : null}
              <FieldValidationError
                show={isInvalid('fullName') && !Boolean(nameHint(form.fullName))}
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
              <FieldValidationError show={isInvalid('fullAddress')} />
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
              <FieldValidationError
                show={isInvalid('whatsappMobile') && !Boolean(mobileHint(form.whatsappMobile))}
              />
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
              <BirthDateField
                className="field-control-sm"
                value={form.birthdate}
                onChange={onBirthdateChange}
                required
                invalid={isInvalid('birthdate')}
              />
              <FieldValidationError
                show={isInvalid('birthdate')}
                message="Enter a valid birth date."
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
              <FieldValidationError show={isInvalid('sex')} />
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
              <FieldValidationError show={isInvalid('bloodGroup')} />
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
                  onChange={(e) => setField('parentName', sanitizeNameInput(e.target.value))}
                  placeholder={t("Parent / guardian full name")}
                  autoCapitalize="words"
                  autoComplete="name"
                  required
                  aria-invalid={isInvalid('parentName') || Boolean(nameHint(form.parentName))}
                />
                {nameHint(form.parentName) ? (
                  <span className="field-error">{t(nameHint(form.parentName))}</span>
                ) : null}
                <FieldValidationError
                  show={isInvalid('parentName') && !Boolean(nameHint(form.parentName))}
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
                <FieldValidationError show={isInvalid('parentRelation')} />
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
                <FieldValidationError
                  show={isInvalid('parentMobile') && !Boolean(mobileHint(form.parentMobile))}
                />
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
                onChange={(e) => setField('emergencyName', sanitizeNameInput(e.target.value))}
                placeholder={t("Contact person name")}
                autoCapitalize="words"
                autoComplete="name"
                required
                readOnly={parentOnly && needsParentInfo}
                aria-invalid={isInvalid('emergencyName') || Boolean(nameHint(form.emergencyName))}
              />
              {nameHint(form.emergencyName) ? (
                <span className="field-error">{t(nameHint(form.emergencyName))}</span>
              ) : null}
              <FieldValidationError
                show={isInvalid('emergencyName') && !Boolean(nameHint(form.emergencyName))}
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
              <FieldValidationError show={isInvalid('emergencyRelation')} />
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
              <FieldValidationError
                show={
                  isInvalid('emergencyMobile') &&
                  !Boolean(mobileHint(form.emergencyMobile)) &&
                  !emergencyMatchesApplicant({
                    emergencyMobile: form.emergencyMobile,
                    whatsappMobile: form.whatsappMobile,
                    otherMobile: form.otherMobile,
                  })
                }
              />
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
                <FieldValidationError show={isInvalid('healthIssueDetails')} />
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
          <IdentityCaptureFields
            document={form.identityDocument}
            number={form.identityNumber}
            onDocumentChange={(value) => setField('identityDocument', value)}
            onNumberChange={(value) => setField('identityNumber', value)}
            documentInvalid={isInvalid('identityDocument')}
            numberInvalid={isInvalid('identityNumber')}
            proofFile={identityPhoto}
            proofPreview={identityPreview}
            proofExistingUrl={existingIdentityUrl}
            proofInvalid={isInvalid('identityPhoto')}
            onClearProofExisting={() => setExistingIdentityUrl(null)}
            onPickProof={(file) => {
              setInvalidFields((prev) => {
                if (!prev.has('identityPhoto')) return prev;
                const next = new Set(prev);
                next.delete('identityPhoto');
                setErrorCount(next.size);
                return next;
              });
              setIdentityPhoto(file);
            }}
          >
            <RegistrationPhotoField
              label={t("Swimmer photo")}
              hint={t("Image (max 200 KB) or PDF (max 2 MB) — recent passport-size photo of the swimmer")}
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
          </IdentityCaptureFields>
        </section>

        <div className="footer-row">
          {isEdit ? (
            <span />
          ) : (
            <div>
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
              <FieldValidationError
                show={isInvalid('acceptedTerms')}
                message="Please accept the Terms & Conditions."
              />
            </div>
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
              </div>
            ) : null}
            {isEdit ? (
              <button
                className="ghost-btn"
                type="button"
                disabled={submitting}
                onClick={cancelEdit}
              >
                {t('Cancel')}
              </button>
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
