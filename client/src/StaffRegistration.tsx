import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { compressImageToLimit } from './compressImage';
import { emailHint, emergencyMatchesApplicant, isValidEmail, isValidMobile, mobileHint } from './formValidation';
import { PlatformPage } from './PlatformPage';
import { CameraActionIcon, UploadActionIcon } from './PhotoActionIcons';
import { TermsModal } from './TermsModal';
import { SendFormQrButton } from './SendFormQrButton';
import { tenantPath } from './tenantSession';
import { useObjectUrl, useObjectUrls } from './useObjectUrl';

type Lang = 'en' | 'mr' | 'hi';

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

const copy = {
  en: {
    mainMenu: '← Back',
    title: 'Staff registration',
    editTitle: 'Staff details',
    saveChanges: 'Save changes',
    updateSuccess: 'Staff details updated successfully.',
    active: 'Active',
    inactive: 'Inactive',
    backToList: '← Staff List',
    requiredNote: 'Required information.',
    registrationFor: 'Registration for',
    coach: 'Coach',
    lifeguard: 'Lifeguard',
    otherRole: 'Other',
    postDetails: 'Post details',
    postName: 'Post name',
    postNamePh: 'e.g. Manager, Accountant, Cleaner',
    salary: 'Salary',
    salaryPh: 'e.g. 15000',
    personal: 'Personal details',
    fullName: 'Full name',
    fullNamePh: 'As per identity document',
    fullAddress: 'Full address',
    fullAddressPh: 'House no., street, city, state, PIN',
    whatsapp: 'WhatsApp mobile no.',
    otherMobile: 'Another mobile no.',
    mobilePh: '10-digit mobile number',
    otherMobilePh: 'Optional 10-digit mobile number',
    email: 'Email',
    emailPh: 'name@example.com',
    birthdate: 'Birth Date',
    underAge: 'Staff must be more than 18 years old',
    sex: 'Sex',
    selectSex: 'Select sex',
    bloodGroup: 'Blood group',
    selectBlood: 'Select blood group',
    emergency: 'Emergency contact',
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
    identity: 'Identity & photo',
    identityDoc: 'Identity document',
    selectDoc: 'Select document type',
    idPhoto: 'Photo of identity proof',
    idPhotoHint: 'Max 200 KB — upload or take a photo of your identity proof',
    staffPhoto: 'Photo',
    staffPhotoHint: 'Max 200 KB — recent passport-size photo for identification',
    takePhoto: 'Take photo',
    upload: 'Upload',
    terms: 'I accept the',
    termsLink: 'Terms & Conditions and Rules & Regulations',
    submit: 'Submit',
    submitting: 'Submitting…',
    success: 'Staff registration submitted successfully.',
    errorCountOne: '1 error',
    errorCountMany: '{count} errors',
    ok: 'OK',
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
    batchSlot: 'Suitable Batch Slot',
    noBatches: 'No batches are set up yet.',
    setupBatches: 'Set up batches first',
    selectBatches: 'Select one or more suitable batch slots',
    interestedTeach: 'Interested to teach',
    freeStyle: 'Free Style',
    backStroke: 'Back Stroke',
    breastStroke: 'Breast Stroke',
    butterfly: 'Butterfly',
    competitive: 'Competitive',
    advanceNeedsCompetitive: 'Advance batch requires Competitive under Interested to teach.',
    ladiesFemaleOnly: 'Ladies batch is allowed for Female coaches only.',
    achievements: 'Achievements',
    achievementsPh: 'Competition results, medals, records, coaching experience highlights, etc.',
    lifeguardCert: 'Life Guard certificate',
    hasLifeguard: 'Do you have life guard certification?',
    expiringOn: 'Expiring On',
    lifeguardPhoto: 'Life Guard certificate photo',
    lifeguardPhotoHint: 'Max 200 KB — upload or take a clear photo of the Life Guard certificate',
    certificates: 'Certificates',
    certificateDetails: 'Certificate details',
    certificateDetailsPh: 'Lifeguard credentials, coaching certifications, first aid, etc.',
    certificateUploadHint: 'Optional — upload up to 3 certificate photos (max 200 KB each)',
    certificateN: 'Certificate',
  },
  mr: {
    mainMenu: '← मागे',
    title: 'कर्मचारी नोंदणी',
    editTitle: 'कर्मचारी तपशील',
    saveChanges: 'बदल जतन करा',
    updateSuccess: 'कर्मचारी तपशील यशस्वीरित्या अद्ययावत झाले.',
    active: 'सक्रिय',
    inactive: 'निष्क्रिय',
    backToList: '← स्टाफ यादी',
    requiredNote: 'आवश्यक माहिती.',
    registrationFor: 'पदाचे नाव',
    coach: 'कोच',
    lifeguard: 'लाइफगार्ड',
    otherRole: 'इतर',
    postDetails: 'पद तपशील',
    postName: 'पदाचे नाव',
    postNamePh: 'उदा. व्यवस्थापक, लेखापाल',
    salary: 'पगार',
    salaryPh: 'उदा. 15000',
    personal: 'वैयक्तिक तपशील',
    fullName: 'पूर्ण नाव',
    fullNamePh: 'ओळखपत्राप्रमाणे',
    fullAddress: 'पूर्ण पत्ता',
    fullAddressPh: 'घर क्र., रस्ता, शहर, राज्य, पिन',
    whatsapp: 'WhatsApp मोबाइल क्र.',
    otherMobile: 'दुसरा मोबाइल क्र.',
    mobilePh: '१० अंकी मोबाइल क्रमांक',
    otherMobilePh: 'पर्यायी १० अंकी मोबाइल क्रमांक',
    email: 'ईमेल',
    emailPh: 'name@example.com',
    birthdate: 'जन्मतारीख',
    underAge: 'कर्मचारी १८ वर्षांपेक्षा जास्त वयाचा असावा',
    sex: 'लिंग',
    selectSex: 'लिंग निवडा',
    bloodGroup: 'रक्तगट',
    selectBlood: 'रक्तगट निवडा',
    emergency: 'आपत्कालीन संपर्क',
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
    staffPhoto: 'फोटो',
    staffPhotoHint: 'कमाल २०० KB — ओळखीसाठी अलीकडील पासपोर्ट-साइज फोटो',
    takePhoto: 'फोटो घ्या',
    upload: 'अपलोड',
    terms: 'मी स्वीकारतो/स्वीकारते',
    termsLink: 'अटी व शर्ती आणि नियम व विनियम',
    submit: 'सबमिट',
    submitting: 'सबमिट होत आहे…',
    success: 'कर्मचारी नोंदणी यशस्वीरित्या सबमिट झाली.',
    errorCountOne: '1 त्रुटी',
    errorCountMany: '{count} त्रुटी',
    ok: 'ठीक आहे',
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
    batchSlot: 'योग्य बॅच स्लॉट',
    noBatches: 'अद्याप कोणतेही बॅच सेट अप नाहीत.',
    setupBatches: 'आधी बॅच सेट अप करा',
    selectBatches: 'एक किंवा अधिक योग्य बॅच स्लॉट निवडा',
    interestedTeach: 'शिकवण्यास इच्छुक',
    freeStyle: 'फ्री स्टाइल',
    backStroke: 'बॅक स्ट्रोक',
    breastStroke: 'ब्रेस्ट स्ट्रोक',
    butterfly: 'बटरफ्लाय',
    competitive: 'स्पर्धात्मक',
    advanceNeedsCompetitive: 'अॅडव्हान्स बॅचसाठी Interested to teach मध्ये स्पर्धात्मक निवडणे आवश्यक आहे.',
    ladiesFemaleOnly: 'लेडीज बॅच फक्त महिला कोचसाठी उपलब्ध आहे.',
    achievements: 'उपलब्धी',
    achievementsPh: 'स्पर्धा निकाल, पदके, रेकॉर्ड, कोचिंग अनुभव इ.',
    lifeguardCert: 'लाइफ गार्ड प्रमाणपत्र',
    hasLifeguard: 'तुमच्याकडे लाइफ गार्ड प्रमाणपत्र आहे का?',
    expiringOn: 'कालबाह्य तारीख',
    lifeguardPhoto: 'लाइफ गार्ड प्रमाणपत्र फोटो',
    lifeguardPhotoHint: 'कमाल २०० KB — लाइफ गार्ड प्रमाणपत्राचा स्पष्ट फोटो अपलोड करा किंवा घ्या',
    certificates: 'प्रमाणपत्रे',
    certificateDetails: 'प्रमाणपत्र तपशील',
    certificateDetailsPh: 'लाइफगार्ड, कोचिंग, प्रथमोपचार प्रमाणपत्रे इ.',
    certificateUploadHint: 'पर्यायी — जास्तीत जास्त ३ प्रमाणपत्र फोटो (प्रत्येकी कमाल २०० KB)',
    certificateN: 'प्रमाणपत्र',
  },
  hi: {
    mainMenu: '← वापस',
    title: 'स्टाफ पंजीकरण',
    editTitle: 'स्टाफ विवरण',
    saveChanges: 'परिवर्तन सहेजें',
    updateSuccess: 'स्टाफ विवरण सफलतापूर्वक अपडेट हो गया।',
    active: 'सक्रिय',
    inactive: 'निष्क्रिय',
    backToList: '← स्टाफ सूची',
    requiredNote: 'आवश्यक जानकारी।',
    registrationFor: 'पंजीकरण किसके लिए',
    coach: 'कोच',
    lifeguard: 'लाइफगार्ड',
    otherRole: 'अन्य',
    postDetails: 'पद विवरण',
    postName: 'पद का नाम',
    postNamePh: 'उदा. प्रबंधक, लेखाकार',
    salary: 'वेतन',
    salaryPh: 'उदा. 15000',
    personal: 'व्यक्तिगत विवरण',
    fullName: 'पूरा नाम',
    fullNamePh: 'पहचान पत्र के अनुसार',
    fullAddress: 'पूरा पता',
    fullAddressPh: 'मकान नं., गली, शहर, राज्य, पिन',
    whatsapp: 'WhatsApp मोबाइल नं.',
    otherMobile: 'अन्य मोबाइल नं.',
    mobilePh: '10 अंकों का मोबाइल नंबर',
    otherMobilePh: 'वैकल्पिक 10 अंकों का मोबाइल नंबर',
    email: 'ईमेल',
    emailPh: 'name@example.com',
    birthdate: 'जन्म तिथि',
    underAge: 'स्टाफ की आयु 18 वर्ष से अधिक होनी चाहिए',
    sex: 'लिंग',
    selectSex: 'लिंग चुनें',
    bloodGroup: 'रक्त समूह',
    selectBlood: 'रक्त समूह चुनें',
    emergency: 'आपातकालीन संपर्क',
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
    staffPhoto: 'फोटो',
    staffPhotoHint: 'अधिकतम 200 KB — पहचान के लिए हाल का पासपोर्ट-साइज़ फोटो',
    takePhoto: 'फोटो लें',
    upload: 'अपलोड',
    terms: 'मैं स्वीकार करता/करती हूँ',
    termsLink: 'नियम एवं शर्तें और नियम व विनियम',
    submit: 'सबमिट',
    submitting: 'सबमिट हो रहा है…',
    success: 'स्टाफ पंजीकरण सफलतापूर्वक सबमिट हो गया।',
    errorCountOne: '1 त्रुटि',
    errorCountMany: '{count} त्रुटियाँ',
    ok: 'ठीक है',
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
    batchSlot: 'उपयुक्त बैच स्लॉट',
    noBatches: 'अभी कोई बैच सेट अप नहीं है।',
    setupBatches: 'पहले बैच सेट अप करें',
    selectBatches: 'एक या अधिक उपयुक्त बैच स्लॉट चुनें',
    interestedTeach: 'सिखाने में रुचि',
    freeStyle: 'फ्री स्टाइल',
    backStroke: 'बैक स्ट्रोक',
    breastStroke: 'ब्रेस्ट स्ट्रोक',
    butterfly: 'बटरफ्लाई',
    competitive: 'प्रतिस्पर्धी',
    advanceNeedsCompetitive: 'एडवांस बैच के लिए Interested to teach में प्रतिस्पर्धी चुनना आवश्यक है।',
    ladiesFemaleOnly: 'लेडीज बैच केवल महिला कोच के लिए उपलब्ध है।',
    achievements: 'उपलब्धियाँ',
    achievementsPh: 'प्रतियोगिता परिणाम, पदक, रिकॉर्ड, कोचिंग अनुभव आदि',
    lifeguardCert: 'लाइफ गार्ड प्रमाणपत्र',
    hasLifeguard: 'क्या आपके पास लाइफ गार्ड प्रमाणपत्र है?',
    expiringOn: 'समाप्ति तिथि',
    lifeguardPhoto: 'लाइफ गार्ड प्रमाणपत्र फोटो',
    lifeguardPhotoHint: 'अधिकतम 200 KB — लाइफ गार्ड प्रमाणपत्र का स्पष्ट फोटो अपलोड करें या लें',
    certificates: 'प्रमाणपत्र',
    certificateDetails: 'प्रमाणपत्र विवरण',
    certificateDetailsPh: 'लाइफगार्ड, कोचिंग, प्राथमिक चिकित्सा प्रमाणपत्र आदि',
    certificateUploadHint: 'वैकल्पिक — अधिकतम 3 प्रमाणपत्र फोटो (प्रत्येक अधिकतम 200 KB)',
    certificateN: 'प्रमाणपत्र',
  },
} as const;

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
      <Label required={required && !existingUrl}>{label}</Label>
      {hint ? <p className="hint">{hint}</p> : null}
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

function uploadUrl(filename: string | null | undefined) {
  if (!filename) return null;
  return `/uploads/${filename}`;
}

export function StaffRegistration() {
  const { id: editIdParam } = useParams();
  const navigate = useNavigate();
  const editId = editIdParam ? Number(editIdParam) : null;
  const isEdit = Number.isFinite(editId) && editId !== null && editId > 0;

  const [lang, setLang] = useState<Lang>('en');
  const t = copy[isEdit ? 'en' : lang];
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
    if (!isEdit || !editId) return;
    setLoadingEdit(true);
    setError('');
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
  }, [editId, isEdit]);

  useEffect(() => {
    if (form.registrationFor !== 'Coach') return;
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
  }, [form.registrationFor]);

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
    if (!identityPhoto && !existingPhotos.identity) fields.add('identityPhoto');
    if (!staffPhoto && !existingPhotos.staff) fields.add('staffPhoto');

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
      if (!lifeguardPhoto && !existingPhotos.lifeguard) fields.add('lifeguardPhoto');
    }

    if (isEdit && form.registrationFor === 'Other') {
      if (!form.postName.trim()) fields.add('postName');
      if (form.salary === '' || Number.isNaN(Number(form.salary))) fields.add('salary');
    }

    if (!isEdit && !form.acceptedTerms) fields.add('acceptedTerms');

    return fields;
  }

  async function onToggleActive(nextActive: boolean) {
    if (!isEdit || !editId) {
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
        setSuccess(t.updateSuccess);
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
      <PlatformPage title={isEdit ? t.editTitle : t.title}>
        <p className="pass-empty">Loading…</p>
      </PlatformPage>
    );
  }

  if (submitted) {
    return (
      <PlatformPage
        title={t.title}
        actions={
          <>
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
          </>
        }
      >
        <div className="registration-success-panel">
          <p className="success">{t.success}</p>
          <button type="button" className="submit" onClick={onSuccessOk}>
            {t.ok}
          </button>
        </div>
      </PlatformPage>
    );
  }

  return (
    <PlatformPage
      title={isEdit ? t.editTitle : t.title}
      actions={
        <>
          {isEdit ? (
            <Link className="menu-link" to={tenantPath('/coaches')}>
              {t.backToList}
            </Link>
          ) : null}
          {isEdit ? (
            <label className="status-switch">
              <span className={isActive ? 'status-on' : 'status-off'}>
                {isActive ? t.active : t.inactive}
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
          {isEdit ? null : (
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
          )}
        </>
      }
    >
      <p className="required-note">
        <span className="req">*</span> {t.requiredNote}
      </p>

      <form onSubmit={onSubmit} noValidate>
        <section className={`card role-card${isInvalid('registrationFor') ? ' field-box-invalid' : ''}`}>
          <div className="role-row" role="radiogroup" aria-label={t.registrationFor}>
            <span className="role-label">
              {t.registrationFor}
              <span className="req"> *</span>
            </span>
            <div className="role-choices">
              {(
                [
                  ['Coach', t.coach],
                  ['Lifeguard', t.lifeguard],
                  ['Other', t.otherRole],
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
              <Label required>{t.email}</Label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
                placeholder={t.emailPh}
                required
                aria-invalid={isInvalid('email') || Boolean(emailHint(form.email))}
              />
              {emailHint(form.email) ? <span className="field-error">{emailHint(form.email)}</span> : null}
            </label>
            <label className="field">
              <Label required>{t.birthdate}</Label>
              <input
                type="date"
                value={form.birthdate}
                max={maxBirthdateForOver18()}
                onChange={(e) => setField('birthdate', e.target.value)}
                required
                aria-invalid={isInvalid('birthdate')}
              />
              {form.birthdate &&
              getAgeYears(form.birthdate) !== null &&
              (getAgeYears(form.birthdate) as number) <= 18 ? (
                <span className="field-error">{t.underAge}</span>
              ) : null}
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

        <section className="card emergency">
          <h2>{t.emergency}</h2>
          <label className="field">
            <Label required>{t.emergencyName}</Label>
            <input
              value={form.emergencyName}
              onChange={(e) => setField('emergencyName', e.target.value)}
              placeholder={t.emergencyNamePh}
              required
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
                aria-invalid={isInvalid('emergencyMobile') || Boolean(mobileHint(form.emergencyMobile))}
              />
              {mobileHint(form.emergencyMobile) ? (
                <span className="field-error">{mobileHint(form.emergencyMobile)}</span>
              ) : emergencyMatchesApplicant({
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
              existingUrl={existingPhotos.identity}
              takeLabel={t.takePhoto}
              uploadLabel={t.upload}
              invalid={isInvalid('identityPhoto')}
              onPick={(file) => {
                clearInvalid('identityPhoto');
                setIdentityPhoto(file);
              }}
            />
            <PhotoField
              label={t.staffPhoto}
              hint={t.staffPhotoHint}
              required
              file={staffPhoto}
              preview={staffPreview}
              existingUrl={existingPhotos.staff}
              takeLabel={t.takePhoto}
              uploadLabel={t.upload}
              invalid={isInvalid('staffPhoto')}
              onPick={(file) => {
                clearInvalid('staffPhoto');
                setStaffPhoto(file);
              }}
            />
          </div>
        </section>

        {form.registrationFor === 'Coach' ? (
          <>
            <section className={`card coach-card${isInvalid('suitableBatchIds') ? ' field-box-invalid' : ''}`}>
              <h2>{t.batchSlot}</h2>
              {batchesLoading ? (
                <p className="batch-empty">Loading batches…</p>
              ) : availableBatches.length === 0 ? (
                <p className="batch-empty">
                  {t.noBatches}{' '}
                  <Link className="terms-link" to={tenantPath('/batches')}>
                    {t.setupBatches}
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
              {!isFemaleCoach ? <p className="hint">{t.ladiesFemaleOnly}</p> : null}
              {advanceNeedsCompetitive ? (
                <p className="field-error">{t.advanceNeedsCompetitive}</p>
              ) : null}
            </section>

            <section className={`card coach-card${isInvalid('teachStrokes') ? ' field-box-invalid' : ''}`}>
              <h2>
                {t.interestedTeach}
                <span className="req"> *</span>
              </h2>
              <div className="check-row">
                {(
                  [
                    ['Free Style', t.freeStyle],
                    ['Back Stroke', t.backStroke],
                    ['Breast Stroke', t.breastStroke],
                    ['Butterfly', t.butterfly],
                    ['Competitive', t.competitive],
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
            </section>

            <section className="card">
              <h2>{t.achievements}</h2>
              <label className="field">
                <textarea
                  value={form.achievements}
                  onChange={(e) => setField('achievements', e.target.value)}
                  placeholder={t.achievementsPh}
                  rows={4}
                />
              </label>
            </section>
          </>
        ) : null}

        {isEdit && form.registrationFor === 'Other' ? (
          <section className="card">
            <h2>{t.postDetails}</h2>
            <div className="grid-2">
              <label className="field">
                <Label required>{t.postName}</Label>
                <input
                  value={form.postName}
                  onChange={(e) => setField('postName', e.target.value)}
                  placeholder={t.postNamePh}
                  required
                  aria-invalid={isInvalid('postName')}
                />
              </label>
              <label className="field">
                <Label required>{t.salary}</Label>
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
                    placeholder={t.salaryPh}
                    required
                    aria-label={t.salary}
                    aria-invalid={isInvalid('salary')}
                  />
                </div>
              </label>
            </div>
          </section>
        ) : null}

        {form.registrationFor === 'Coach' || form.registrationFor === 'Lifeguard' ? (
          <section className="card lifeguard-card">
            <h2>{t.lifeguardCert}</h2>
            <div className="lifeguard-row">
              <span className="lifeguard-question">{t.hasLifeguard}</span>
              <div className="lifeguard-choices">
                <label className={`choice-chip ${form.hasLifeguardCert === 'Yes' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="hasLifeguardCert"
                    checked={form.hasLifeguardCert === 'Yes'}
                    onChange={() => setField('hasLifeguardCert', 'Yes')}
                  />
                  {t.yes}
                </label>
                <label className={`choice-chip ${form.hasLifeguardCert === 'No' ? 'selected' : ''}`}>
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
                  {t.no}
                </label>
              </div>
              {form.hasLifeguardCert === 'Yes' ? (
                <label className="lifeguard-expiry">
                  <span>
                    {t.expiringOn}
                    <span className="req"> *</span>
                  </span>
                  <input
                    type="date"
                    value={form.lifeguardExpiry}
                    onChange={(e) => setField('lifeguardExpiry', e.target.value)}
                    required
                    aria-invalid={isInvalid('lifeguardExpiry')}
                  />
                </label>
              ) : null}
            </div>

            {form.hasLifeguardCert === 'Yes' ? (
              <div className="lifeguard-photo">
                <PhotoField
                  label={t.lifeguardPhoto}
                  hint={t.lifeguardPhotoHint}
                  required
                  file={lifeguardPhoto}
                  preview={lifeguardPreview}
                  existingUrl={existingPhotos.lifeguard}
                  takeLabel={t.takePhoto}
                  uploadLabel={t.upload}
                  invalid={isInvalid('lifeguardPhoto')}
                  onPick={(file) => {
                    clearInvalid('lifeguardPhoto');
                    setLifeguardPhoto(file);
                  }}
                />
              </div>
            ) : null}
          </section>
        ) : null}

        {form.registrationFor === 'Coach' ? (
          <section className="card">
            <h2>{t.certificates}</h2>
            <label className="field">
              <Label>{t.certificateDetails}</Label>
              <textarea
                value={form.certificateDetails}
                onChange={(e) => setField('certificateDetails', e.target.value)}
                placeholder={t.certificateDetailsPh}
                rows={4}
              />
            </label>
            <p className="hint">{t.certificateUploadHint}</p>
            <div className="grid-3 photos">
              {[0, 1, 2].map((i) => (
                <PhotoField
                  key={i}
                  label={`${t.certificateN} ${i + 1}`}
                  hint=""
                  file={certPhotos[i]}
                  preview={certPreviews[i]}
                  existingUrl={existingPhotos.certs[i]}
                  takeLabel={t.takePhoto}
                  uploadLabel={t.upload}
                  onPick={(file) => setCertPhoto(i, file)}
                />
              ))}
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

        {error ? <p className="error">{error}</p> : null}
        {success ? <p className="success">{success}</p> : null}
      </form>

      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} variant="staff" />
    </PlatformPage>
  );
}
