/** Built-in coach/staff terms shown when Pool Core Info has no custom text. */

export const DEFAULT_COACH_TERMS_EN = `1) Punctuality & Attendance – I will report on time for all assigned batches and maintain accurate attendance.
2) Training Responsibility – I will conduct swimming sessions professionally and according to the assigned batch, timing, and training requirements.
3) Swimmer Safety – I will give the highest priority to swimmer safety and immediately report any accident, injury, or unsafe situation to management.
4) Professional Conduct – I will behave respectfully and professionally with swimmers, parents, coaches, staff, and management.
5) Pool Rules – I will follow all swimming pool safety, discipline, hygiene, and operational rules.
6) No Unauthorized Collection – I will not collect fees or other payments directly from swimmers/parents unless specifically authorized by management.
7) Leave & Substitution – I will inform management in advance if I am unable to attend and will not arrange a substitute without approval.
8) Confidentiality – I will keep swimmer, parent, staff, payment, attendance, and other pool information confidential.
9) Photography & Social Media – I will not photograph, record, or share swimmer information/photos/videos without proper authorization.
10) Pool Property – I will take proper care of pool equipment, training equipment, access cards, and other property provided to me.
11) Prohibited Conduct – I will not engage in harassment, physical punishment, abusive behaviour, intoxication, or any activity that may compromise swimmer safety.
12) Incident Reporting – I will promptly inform management about injuries, accidents, disciplinary issues, equipment damage, or other significant incidents.
13) Termination – Serious or repeated violation of these terms may result in suspension or termination of my coaching engagement, subject to the applicable agreement and rules.`;

export const DEFAULT_COACH_TERMS_MR = `१) वेळेवर हजेरी व उपस्थिती – मी नेमलेल्या सर्व बॅचसाठी वेळेवर उपस्थित राहीन आणि अचूक हजेरी ठेवीन.
२) प्रशिक्षण जबाबदारी – मी पोहण्याची सत्रे व्यावसायिक पद्धतीने आणि नेमलेल्या बॅच, वेळ व प्रशिक्षण गरजेनुसार घेईन.
३) पोहणाऱ्याची सुरक्षा – मी पोहणाऱ्यांच्या सुरक्षिततेला सर्वोच्च प्राधान्य देईन आणि कोणतीही अपघात, दुखापत किंवा असुरक्षित परिस्थिती व्यवस्थापनाला त्वरित कळवीन.
४) व्यावसायिक वर्तन – मी पोहणारे, पालक, कोच, स्टाफ व व्यवस्थापनासोबत आदरपूर्वक व व्यावसायिक रीतीने वागेन.
५) पूल नियम – मी सर्व पोहण्याच्या तलावाचे सुरक्षा, शिस्त, स्वच्छता व कामकाजाचे नियम पाळीन.
६) अनधिकृत वसुली नाही – व्यवस्थापनाच्या विशिष्ट परवानगीशिवाय मी पोहणारे/पालक यांच्याकडून थेट फी किंवा इतर पेमेंट घेणार नाही.
७) रजा व पर्यायी व्यवस्था – उपस्थित राहता आले नाही तर मी आगाऊ व्यवस्थापनाला कळवीन आणि मंजुरीशिवाय पर्यायी कोच ठेवणार नाही.
८) गोपनीयता – मी पोहणारे, पालक, स्टाफ, पेमेंट, हजेरी व इतर पूल माहिती गोपनीय ठेवीन.
९) छायाचित्रण व सोशल मीडिया – योग्य परवानगीशिवाय मी पोहणाऱ्यांची माहिती/फोटो/व्हिडिओ काढणार किंवा शेअर करणार नाही.
१०) पूल मालमत्ता – मला दिलेली पूल उपकरणे, प्रशिक्षण साधने, अॅक्सेस कार्ड व इतर मालमत्तेची मी योग्य काळजी घेईन.
११) प्रतिबंधित वर्तन – मी छळ, शारीरिक शिक्षा, अपमानास्पद वर्तन, नशा किंवा पोहणाऱ्याच्या सुरक्षिततेला धोका पोहोचवणारी कोणतीही कृती करणार नाही.
१२) घटना कळवणे – दुखापत, अपघात, शिस्तभंग, उपकरण नुकसान किंवा इतर महत्त्वाच्या घटना मी त्वरित व्यवस्थापनाला कळवीन.
१३) सेवा समाप्ती – या अटींचे गंभीर किंवा वारंवार उल्लंघन झाल्यास लागू करार व नियमांनुसार माझ्या कोचिंग सेवेस निलंबन किंवा समाप्ती होऊ शकते.`;

export function defaultCoachTerms(lang: 'en' | 'mr') {
  return lang === 'mr' ? DEFAULT_COACH_TERMS_MR : DEFAULT_COACH_TERMS_EN;
}

/** True when text is empty or matches a built-in coach/staff default (either language / older drafts). */
export function isDefaultCoachTerms(stored: string) {
  const text = String(stored ?? '').trim();
  if (!text) return true;
  if (text === DEFAULT_COACH_TERMS_EN || text === DEFAULT_COACH_TERMS_MR) return true;
  // Older short built-in staff terms
  if (text.startsWith('1. General\nBy registering as staff')) return true;
  if (text.startsWith('१. सामान्य\nस्टाफ म्हणून नोंदणी')) return true;
  return false;
}

/** Use saved custom terms; empty / built-in default → current language built-in text. */
export function resolveCoachTerms(stored: string, lang: 'en' | 'mr') {
  if (isDefaultCoachTerms(stored)) return defaultCoachTerms(lang);
  return String(stored ?? '').trim();
}
