import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { MenuBackLink } from './MenuBackLink';
import { CameraActionIcon, UploadActionIcon } from './PhotoActionIcons';
import { compressImageToLimit } from './compressImage';
import { emailHint, emergencyMatchesApplicant, isValidEmail, isValidMobile, mobileHint } from './formValidation';
import { canEditPage } from './pageAccess';
import { SendFormQrButton } from './SendFormQrButton';
import { tenantPath } from './tenantSession';
import { TermsModal } from './TermsModal';

type Lang = 'en' | 'mr' | 'hi';

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
  acceptedTerms: false,
};

const copy = {
  en: {
    mainMenu: '← Back',
    title: 'Registration form',
    editTitle: 'Edit swimmer',
    saveChanges: 'Save changes',
    requiredNote: 'Required information.',
    personal: 'Personal details',
    fullName: 'Full name',
    fullNamePh: 'As per identity document',
    fullAddress: 'Full address',
    fullAddressPh: 'House no., street, city, state, PIN',
    whatsapp: 'WhatsApp mobile no.',
    otherMobile: 'Another mobile no.',
    mobilePh: '10-digit mobile number',
    otherMobilePh: 'Optional 10-digit number',
    email: 'Email',
    emailPh: 'name@example.com',
    birthdate: 'Birth Date',
    sex: 'Sex',
    selectSex: 'Select sex',
    bloodGroup: 'Blood group',
    selectBlood: 'Select blood group',
    parentInfo: 'Parent information',
    parentName: 'Name',
    parentNamePh: 'Parent / guardian full name',
    parentRelation: 'Relationship',
    selectParentRelation: 'Select relationship',
    parentContact: 'Contact no.',
    father: 'Father',
    mother: 'Mother',
    emergency: 'Emergency contact',
    parentOnly: 'Parent only',
    emergencyName: 'Emergency contact name',
    emergencyNamePh: 'Contact person name',
    relation: 'Relation',
    selectRelation: 'Select relation',
    emergencyNo: 'Emergency contact no.',
    emergencySameAsApplicant: 'Emergency contact number cannot be the same as the applicant mobile number',
    medical: 'Medical information',
    healthIssue: 'Do you have any health issue?',
    healthDetails: 'Disease / health issue',
    healthDetailsPh: 'Asthma, epilepsy, heart condition, etc.',
    doctorName: 'Doctor name',
    doctorNamePh: 'Optional',
    doctorNo: 'Doctor no.',
    doctorNoPh: 'Optional 10-digit number',
    identity: 'Identity & photos',
    identityDoc: 'Identity document',
    selectDoc: 'Select document type',
    idPhoto: 'Photo of identity proof',
    idPhotoHint: 'Max 200 KB — upload or take a photo of your identity proof',
    swimmerPhoto: 'Swimmer photo',
    swimmerPhotoHint: 'Max 200 KB — recent passport-size photo of the swimmer',
    takePhoto: 'Take photo',
    upload: 'Upload',
    terms: 'I accept the',
    termsLink: 'Terms & Conditions and Rules & Regulations',
    submit: 'Submit',
    submitting: 'Submitting…',
    success: 'Registration submitted successfully.',
    ok: 'OK',
    errorCountOne: '1 error',
    errorCountMany: '{count} errors',
    male: 'Male',
    female: 'Female',
    other: 'Other',
    parent: 'Parent',
    spouse: 'Spouse',
    sibling: 'Sibling',
    friend: 'Friend',
    guardian: 'Guardian',
    aadhaar: 'Aadhaar card',
    pan: 'PAN card',
    passport: 'Passport',
    driving: 'Driving licence',
    school: 'School / college ID',
    yes: 'Yes',
    no: 'No',
  },
  mr: {
    mainMenu: '← मागे',
    title: 'नोंदणी फॉर्म',
    editTitle: 'पोहणाऱ्याचे तपशील संपादित करा',
    saveChanges: 'बदल जतन करा',
    requiredNote: 'आवश्यक माहिती.',
    personal: 'वैयक्तिक तपशील',
    fullName: 'पूर्ण नाव',
    fullNamePh: 'ओळखपत्राप्रमाणे',
    fullAddress: 'पूर्ण पत्ता',
    fullAddressPh: 'घर क्र., रस्ता, शहर, राज्य, पिन',
    whatsapp: 'WhatsApp मोबाइल क्र.',
    otherMobile: 'दुसरा मोबाइल क्र.',
    mobilePh: '१० अंकी मोबाइल क्रमांक',
    otherMobilePh: 'पर्यायी १० अंकी क्रमांक',
    email: 'ईमेल',
    emailPh: 'name@example.com',
    birthdate: 'जन्मतारीख',
    sex: 'लिंग',
    selectSex: 'लिंग निवडा',
    bloodGroup: 'रक्तगट',
    selectBlood: 'रक्तगट निवडा',
    parentInfo: 'पालक माहिती',
    parentName: 'नाव',
    parentNamePh: 'पालक / संरक्षक पूर्ण नाव',
    parentRelation: 'नाते',
    selectParentRelation: 'नाते निवडा',
    parentContact: 'संपर्क क्र.',
    father: 'वडील',
    mother: 'आई',
    emergency: 'आपत्कालीन संपर्क',
    parentOnly: 'फक्त पालक',
    emergencyName: 'आपत्कालीन संपर्क नाव',
    emergencyNamePh: 'संपर्क व्यक्तीचे नाव',
    relation: 'नाते',
    selectRelation: 'नाते निवडा',
    emergencyNo: 'आपत्कालीन संपर्क क्र.',
    emergencySameAsApplicant: 'आपत्कालीन संपर्क क्रमांक अर्जदाराच्या मोबाइल क्रमांकासारखा असू शकत नाही',
    medical: 'वैद्यकीय माहिती',
    healthIssue: 'तुम्हाला काही आरोग्य समस्या आहे का?',
    healthDetails: 'आजार / आरोग्य समस्या',
    healthDetailsPh: 'दमा, अपस्मार, हृदयविकार इ.',
    doctorName: 'डॉक्टरांचे नाव',
    doctorNamePh: 'पर्यायी',
    doctorNo: 'डॉक्टर क्र.',
    doctorNoPh: 'पर्यायी १० अंकी क्रमांक',
    identity: 'ओळखपत्र आणि फोटो',
    identityDoc: 'ओळखपत्र',
    selectDoc: 'दस्तऐवज प्रकार निवडा',
    idPhoto: 'ओळखपत्राचा फोटो',
    idPhotoHint: 'कमाल २०० KB — अपलोड करा किंवा स्पष्ट फोटो घ्या',
    swimmerPhoto: 'पोहणाऱ्याचा फोटो',
    swimmerPhotoHint: 'कमाल २०० KB — अलीकडील पासपोर्ट-साइज फोटो',
    takePhoto: 'फोटो घ्या',
    upload: 'अपलोड',
    terms: 'मी स्वीकारतो/स्वीकारते',
    termsLink: 'अटी व शर्ती आणि नियम व विनियम',
    submit: 'सबमिट',
    submitting: 'सबमिट होत आहे…',
    success: 'नोंदणी यशस्वीरित्या सबमिट झाली.',
    ok: 'ठीक आहे',
    errorCountOne: '1 त्रुटी',
    errorCountMany: '{count} त्रुटी',
    male: 'पुरुष',
    female: 'स्त्री',
    other: 'इतर',
    parent: 'पालक',
    spouse: 'जोडीदार',
    sibling: 'भावंड',
    friend: 'मित्र/मैत्रिण',
    guardian: 'पालक/संरक्षक',
    aadhaar: 'आधार कार्ड',
    pan: 'पॅन कार्ड',
    passport: 'पासपोर्ट',
    driving: 'ड्रायव्हिंग लायसन्स',
    school: 'शाळा / महाविद्यालय ओळखपत्र',
    yes: 'होय',
    no: 'नाही',
  },
  hi: {
    mainMenu: '← वापस',
    title: 'पंजीकरण फॉर्म',
    editTitle: 'तैराक विवरण संपादित करें',
    saveChanges: 'परिवर्तन सहेजें',
    requiredNote: 'आवश्यक जानकारी।',
    personal: 'व्यक्तिगत विवरण',
    fullName: 'पूरा नाम',
    fullNamePh: 'पहचान पत्र के अनुसार',
    fullAddress: 'पूरा पता',
    fullAddressPh: 'मकान नं., गली, शहर, राज्य, पिन',
    whatsapp: 'WhatsApp मोबाइल नं.',
    otherMobile: 'अन्य मोबाइल नं.',
    mobilePh: '10 अंकों का मोबाइल नंबर',
    otherMobilePh: 'वैकल्पिक 10 अंकों का नंबर',
    email: 'ईमेल',
    emailPh: 'name@example.com',
    birthdate: 'जन्म तिथि',
    sex: 'लिंग',
    selectSex: 'लिंग चुनें',
    bloodGroup: 'रक्त समूह',
    selectBlood: 'रक्त समूह चुनें',
    parentInfo: 'अभिभावक जानकारी',
    parentName: 'नाम',
    parentNamePh: 'अभिभावक / संरक्षक पूरा नाम',
    parentRelation: 'संबंध',
    selectParentRelation: 'संबंध चुनें',
    parentContact: 'संपर्क नं.',
    father: 'पिता',
    mother: 'माता',
    emergency: 'आपातकालीन संपर्क',
    parentOnly: 'केवल अभिभावक',
    emergencyName: 'आपातकालीन संपर्क नाम',
    emergencyNamePh: 'संपर्क व्यक्ति का नाम',
    relation: 'संबंध',
    selectRelation: 'संबंध चुनें',
    emergencyNo: 'आपातकालीन संपर्क नं.',
    emergencySameAsApplicant: 'आपातकालीन संपर्क नंबर आवेदक के मोबाइल नंबर जैसा नहीं हो सकता',
    medical: 'चिकित्सा जानकारी',
    healthIssue: 'क्या आपको कोई स्वास्थ्य समस्या है?',
    healthDetails: 'रोग / स्वास्थ्य समस्या',
    healthDetailsPh: 'अस्थमा, मिर्गी, हृदय रोग आदि',
    doctorName: 'डॉक्टर का नाम',
    doctorNamePh: 'वैकल्पिक',
    doctorNo: 'डॉक्टर नं.',
    doctorNoPh: 'वैकल्पिक 10 अंकों का नंबर',
    identity: 'पहचान और फोटो',
    identityDoc: 'पहचान दस्तावेज़',
    selectDoc: 'दस्तावेज़ प्रकार चुनें',
    idPhoto: 'पहचान पत्र का फोटो',
    idPhotoHint: 'अधिकतम 200 KB — अपलोड करें या स्पष्ट फोटो लें',
    swimmerPhoto: 'तैराक का फोटो',
    swimmerPhotoHint: 'अधिकतम 200 KB — हाल का पासपोर्ट-साइज़ फोटो',
    takePhoto: 'फोटो लें',
    upload: 'अपलोड',
    terms: 'मैं स्वीकार करता/करती हूँ',
    termsLink: 'नियम एवं शर्तें और नियम व विनियम',
    submit: 'सबमिट',
    submitting: 'सबमिट हो रहा है…',
    success: 'पंजीकरण सफलतापूर्वक सबमिट हो गया।',
    ok: 'ठीक है',
    errorCountOne: '1 त्रुटि',
    errorCountMany: '{count} त्रुटियाँ',
    male: 'पुरुष',
    female: 'महिला',
    other: 'अन्य',
    parent: 'अभिभावक',
    spouse: 'पति/पत्नी',
    sibling: 'भाई/बहन',
    friend: 'मित्र',
    guardian: 'अभिभावक',
    aadhaar: 'आधार कार्ड',
    pan: 'पैन कार्ड',
    passport: 'पासपोर्ट',
    driving: 'ड्राइविंग लाइसेंस',
    school: 'स्कूल / कॉलेज आईडी',
    yes: 'हाँ',
    no: 'नहीं',
  },
} as const;

function Label({ children, required }: { children: string; required?: boolean }) {
  return (
    <span className="label">
      {children}
      {required ? <span className="req"> *</span> : null}
    </span>
  );
}

function PhotoField({
  label,
  hint,
  required,
  file,
  preview,
  existingUrl,
  takeLabel,
  uploadLabel,
  onPick,
  invalid,
}: {
  label: string;
  hint: string;
  required?: boolean;
  file: File | null;
  preview: string | null;
  existingUrl?: string | null;
  takeLabel: string;
  uploadLabel: string;
  onPick: (file: File | null) => void;
  invalid?: boolean;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const displayPreview = preview || existingUrl || null;
  const [compressing, setCompressing] = useState(false);

  async function handleFile(selected: File | null) {
    if (!selected) {
      onPick(null);
      return;
    }
    setCompressing(true);
    try {
      const ready = await compressImageToLimit(selected);
      onPick(ready);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Unable to process image');
      onPick(null);
    } finally {
      setCompressing(false);
      if (cameraRef.current) cameraRef.current.value = '';
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className={`photo-field${invalid ? ' field-box-invalid' : ''}`}>
      <Label required={required}>{label}</Label>
      <p className="hint">{hint}</p>
      {compressing ? <p className="hint">Compressing image…</p> : null}
      {displayPreview ? (
        <div className="preview-wrap">
          <img src={displayPreview} alt={label} className="preview" />
          {file ? (
            <button type="button" className="linkish" onClick={() => onPick(null)}>
              Remove
            </button>
          ) : (
            <button type="button" className="linkish" onClick={() => fileRef.current?.click()}>
              Change
            </button>
          )}
        </div>
      ) : (
        <div className="photo-actions">
          <button
            type="button"
            className="photo-btn"
            disabled={compressing}
            onClick={() => cameraRef.current?.click()}
          >
            <CameraActionIcon />
            {takeLabel}
          </button>
          <button
            type="button"
            className="photo-btn"
            disabled={compressing}
            onClick={() => fileRef.current?.click()}
          >
            <UploadActionIcon />
            {uploadLabel}
          </button>
        </div>
      )}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
      />
      {file ? (
        <p className="file-name">
          {file.name} ({Math.ceil(file.size / 1024)} KB)
        </p>
      ) : null}
    </div>
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

  const [lang, setLang] = useState<Lang>('en');
  const t = copy[lang];
  const [form, setForm] = useState<FormState>(initialForm);
  const [identityPhoto, setIdentityPhoto] = useState<File | null>(null);
  const [swimmerPhoto, setSwimmerPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [, setError] = useState('');
  const [errorCount, setErrorCount] = useState(0);
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set());
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

  const identityPreview = useMemo(
    () => (identityPhoto ? URL.createObjectURL(identityPhoto) : null),
    [identityPhoto],
  );
  const swimmerPreview = useMemo(
    () => (swimmerPhoto ? URL.createObjectURL(swimmerPhoto) : null),
    [swimmerPhoto],
  );

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
      <div className="page">
        <p className="pass-empty">Loading…</p>
      </div>
    );
  }

  if (isEdit && loadError) {
    return (
      <div className="page">
        <div className="top-row">
          <MenuBackLink label={t.mainMenu} />
        </div>
        <p className="error">{loadError}</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="page">
        <div className="top-row">
          <MenuBackLink label={t.mainMenu} />
          <div className="top-row-right">
            <SendFormQrButton form="swimmer" />
            <div className="langs">
              {(['en', 'mr', 'hi'] as const).map((code, i) => (
                <span key={code}>
                  {i > 0 ? <span className="sep"> / </span> : null}
                  <button
                    type="button"
                    className={lang === code ? 'lang active' : 'lang'}
                    onClick={() => setLang(code)}
                  >
                    {code === 'en' ? 'English' : code === 'mr' ? 'Marathi' : 'Hindi'}
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>

        <h1>{t.title}</h1>

        <div className="registration-success-panel">
          <p className="success">{t.success}</p>
          <button type="button" className="submit" onClick={onSuccessOk}>
            {t.ok}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="top-row">
        <MenuBackLink label={t.mainMenu} />
        <div className="top-row-right">
          {isEdit ? null : <SendFormQrButton form="swimmer" />}
          <div className="langs">
            {(['en', 'mr', 'hi'] as const).map((code, i) => (
              <span key={code}>
                {i > 0 ? <span className="sep"> / </span> : null}
                <button
                  type="button"
                  className={lang === code ? 'lang active' : 'lang'}
                  onClick={() => setLang(code)}
                >
                  {code === 'en' ? 'English' : code === 'mr' ? 'Marathi' : 'Hindi'}
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>

      <h1>{isEdit ? t.editTitle : t.title}</h1>
      <p className="required-note">
        <span className="req">*</span> {t.requiredNote}
      </p>

      <form onSubmit={onSubmit} noValidate>
        <section className="card">
          <h2>{t.personal}</h2>

          <label className="field">
            <Label required>{t.fullName}</Label>
            <input
              value={form.fullName}
              onChange={(e) => setField('fullName', e.target.value)}
              placeholder={t.fullNamePh}
              required
              aria-invalid={isInvalid('fullName')}
            />
          </label>

          <label className="field">
            <Label required>{t.fullAddress}</Label>
            <textarea
              value={form.fullAddress}
              onChange={(e) => setField('fullAddress', e.target.value)}
              placeholder={t.fullAddressPh}
              rows={3}
              required
              aria-invalid={isInvalid('fullAddress')}
            />
          </label>

          <div className="grid-2">
            <label className="field">
              <Label required>{t.whatsapp}</Label>
              <input
                value={form.whatsappMobile}
                onChange={(e) => setField('whatsappMobile', e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder={t.mobilePh}
                inputMode="numeric"
                pattern="\d{10}"
                required
                aria-invalid={isInvalid('whatsappMobile') || Boolean(mobileHint(form.whatsappMobile))}
              />
              {mobileHint(form.whatsappMobile) ? (
                <span className="field-error">{mobileHint(form.whatsappMobile)}</span>
              ) : null}
            </label>
            <label className="field">
              <Label>{t.otherMobile}</Label>
              <input
                value={form.otherMobile}
                onChange={(e) => setField('otherMobile', e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder={t.otherMobilePh}
                inputMode="numeric"
                pattern="\d{10}"
                aria-invalid={isInvalid('otherMobile') || Boolean(mobileHint(form.otherMobile))}
              />
              {mobileHint(form.otherMobile) ? (
                <span className="field-error">{mobileHint(form.otherMobile)}</span>
              ) : null}
            </label>
          </div>

          <div className="grid-2">
            <label className="field">
              <Label>{t.email}</Label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
                placeholder={t.emailPh}
                pattern="[^@\s]+@[^@\s]+\.[^@\s]+"
                title="Email must include @ and ."
                aria-invalid={isInvalid('email') || Boolean(emailHint(form.email))}
              />
              {emailHint(form.email) ? <span className="field-error">{emailHint(form.email)}</span> : null}
            </label>
            <label className="field">
              <Label required>{t.birthdate}</Label>
              <input
                type="date"
                value={form.birthdate}
                onChange={(e) => onBirthdateChange(e.target.value)}
                required
                aria-invalid={isInvalid('birthdate')}
              />
            </label>
          </div>

          <div className="grid-2">
            <label className="field">
              <Label required>{t.sex}</Label>
              <select
                value={form.sex}
                onChange={(e) => setField('sex', e.target.value)}
                required
                aria-invalid={isInvalid('sex')}
              >
                <option value="">{t.selectSex}</option>
                <option value="Male">{t.male}</option>
                <option value="Female">{t.female}</option>
                <option value="Other">{t.other}</option>
              </select>
            </label>
            <label className="field">
              <Label required>{t.bloodGroup}</Label>
              <select
                value={form.bloodGroup}
                onChange={(e) => setField('bloodGroup', e.target.value)}
                required
                aria-invalid={isInvalid('bloodGroup')}
              >
                <option value="">{t.selectBlood}</option>
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
          <section className="card">
            <h2>{t.parentInfo}</h2>
            <label className="field">
              <Label required>{t.parentName}</Label>
              <input
                value={form.parentName}
                onChange={(e) => setField('parentName', e.target.value)}
                placeholder={t.parentNamePh}
                required
                aria-invalid={isInvalid('parentName')}
              />
            </label>
            <div className="grid-2">
              <label className="field">
                <Label required>{t.parentRelation}</Label>
                <select
                  value={form.parentRelation}
                  onChange={(e) => setField('parentRelation', e.target.value)}
                  required
                  aria-invalid={isInvalid('parentRelation')}
                >
                  <option value="">{t.selectParentRelation}</option>
                  <option value="Father">{t.father}</option>
                  <option value="Mother">{t.mother}</option>
                  <option value="Guardian">{t.guardian}</option>
                  <option value="Other">{t.other}</option>
                </select>
              </label>
              <label className="field">
                <Label required>{t.parentContact}</Label>
                <input
                  value={form.parentMobile}
                  onChange={(e) =>
                    setField('parentMobile', e.target.value.replace(/\D/g, '').slice(0, 10))
                  }
                  placeholder={t.mobilePh}
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

        <section className="card emergency">
          <h2>{t.emergency}</h2>
          {needsParentInfo ? (
            <label className="parent-only-check">
              <input
                type="checkbox"
                checked={parentOnly}
                onChange={(e) => onParentOnlyChange(e.target.checked)}
              />
              <span>{t.parentOnly}</span>
            </label>
          ) : null}
          <label className="field">
            <Label required>{t.emergencyName}</Label>
            <input
              value={form.emergencyName}
              onChange={(e) => setField('emergencyName', e.target.value)}
              placeholder={t.emergencyNamePh}
              required
              readOnly={parentOnly && needsParentInfo}
              aria-invalid={isInvalid('emergencyName')}
            />
          </label>
          <div className="grid-2">
            <label className="field">
              <Label required>{t.relation}</Label>
              <select
                value={form.emergencyRelation}
                onChange={(e) => setField('emergencyRelation', e.target.value)}
                required
                disabled={parentOnly && needsParentInfo}
                aria-invalid={isInvalid('emergencyRelation')}
              >
                <option value="">{t.selectRelation}</option>
                <option value="Parent">{t.parent}</option>
                <option value="Spouse">{t.spouse}</option>
                <option value="Sibling">{t.sibling}</option>
                <option value="Friend">{t.friend}</option>
                <option value="Guardian">{t.guardian}</option>
                <option value="Other">{t.other}</option>
              </select>
            </label>
            <label className="field">
              <Label required>{t.emergencyNo}</Label>
              <input
                value={form.emergencyMobile}
                onChange={(e) =>
                  setField('emergencyMobile', e.target.value.replace(/\D/g, '').slice(0, 10))
                }
                placeholder={t.mobilePh}
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
                <span className="field-error">{t.emergencySameAsApplicant}</span>
              ) : null}
            </label>
          </div>
        </section>

        <section className="card medical">
          <h2>{t.medical}</h2>
          <div className="inline-row">
            <Label required>{t.healthIssue}</Label>
            <select
              value={form.hasHealthIssue}
              onChange={(e) => setField('hasHealthIssue', e.target.value)}
              required
            >
              <option value="No">{t.no}</option>
              <option value="Yes">{t.yes}</option>
            </select>
          </div>
          {form.hasHealthIssue === 'Yes' ? (
            <div className="medical-details">
              <label className="field">
                <Label required>{t.healthDetails}</Label>
                <textarea
                  value={form.healthIssueDetails}
                  onChange={(e) => setField('healthIssueDetails', e.target.value)}
                  placeholder={t.healthDetailsPh}
                  rows={4}
                  required
                  aria-invalid={isInvalid('healthIssueDetails')}
                />
              </label>
              <div className="grid-2">
                <label className="field">
                  <Label>{t.doctorName}</Label>
                  <input
                    value={form.doctorName}
                    onChange={(e) => setField('doctorName', e.target.value)}
                    placeholder={t.doctorNamePh}
                  />
                </label>
                <label className="field">
                  <Label>{t.doctorNo}</Label>
                  <input
                    value={form.doctorNo}
                    onChange={(e) => setField('doctorNo', e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder={t.doctorNoPh}
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

        <section className="card">
          <h2>{t.identity}</h2>
          <label className="field">
            <Label required>{t.identityDoc}</Label>
            <select
              value={form.identityDocument}
              onChange={(e) => setField('identityDocument', e.target.value)}
              required
              aria-invalid={isInvalid('identityDocument')}
            >
              <option value="">{t.selectDoc}</option>
              <option value="Aadhaar">{t.aadhaar}</option>
              <option value="PAN">{t.pan}</option>
              <option value="Passport">{t.passport}</option>
              <option value="Driving Licence">{t.driving}</option>
              <option value="School ID">{t.school}</option>
            </select>
          </label>

          <div className="grid-2 photos">
            <PhotoField
              label={t.idPhoto}
              hint={t.idPhotoHint}
              required
              file={identityPhoto}
              preview={identityPreview}
              existingUrl={existingIdentityUrl}
              takeLabel={t.takePhoto}
              uploadLabel={t.upload}
              invalid={isInvalid('identityPhoto')}
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
            <PhotoField
              label={t.swimmerPhoto}
              hint={t.swimmerPhotoHint}
              required
              file={swimmerPhoto}
              preview={swimmerPreview}
              existingUrl={existingSwimmerUrl}
              takeLabel={t.takePhoto}
              uploadLabel={t.upload}
              invalid={isInvalid('swimmerPhoto')}
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
                {t.terms}{' '}
                <button type="button" className="terms-link" onClick={() => setTermsOpen(true)}>
                  {t.termsLink}
                </button>
              </span>
            </label>
          )}
          <div className="submit-wrap">
            {errorCount > 0 ? (
              <p className="error submit-error-count">
                {errorCount === 1
                  ? t.errorCountOne
                  : t.errorCountMany.replace('{count}', String(errorCount))}
              </p>
            ) : null}
            <button className="submit" type="submit" disabled={submitting}>
              {submitting ? t.submitting : isEdit ? t.saveChanges : t.submit}
            </button>
          </div>
        </div>
      </form>

      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} variant="swimmer" />
    </div>
  );
}
