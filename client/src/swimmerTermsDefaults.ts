/** Built-in swimmer membership terms shown when Pool Core Info has no custom text. */

export const DEFAULT_SWIMMER_TERMS_EN = `1) Membership once taken cannot be cancelled for any reason. Please note that no refund of the full amount or any part of it will be given. Membership also cannot be transferred to another person.
2) Management reserves the right to accept or reject any membership application, and that decision shall be final.
3) Members and persons accompanying them must enter the club premises at their own risk and responsibility.
4) Membership shall commence from the date the membership pass is issued. Such pass must be shown at every entry. Entry will not be permitted without an identity card/pass.
5) No extension of validity will be granted for a member's absence or for any other reason.
6) Management reserves the right to change the rules, introduce new rules, or increase fees without any prior notice.
7) Management shall not be responsible for any risk, fall/injury, or loss of valuables while using the pool.
8) Management shall not be responsible if a club member or persons accompanying them suffer any loss, incur any expense, or require any medical treatment within the club premises.
9) Consumption of alcohol and smoking are strictly prohibited within the club premises.
10) Members should use the parking area properly and park vehicles at their own responsibility.
11) Through this application I declare that I do not have any health complaint, illness, or similar disease, and that I have not undergone any major operation. I am fit and able to learn swimming or come for swimming.
12) There is no doctor attendant at the pool.
13) In an emergency, I authorize the club to give me first aid and take me to a doctor at my own responsibility.
14) I have read all notices and conditions on the notice board and will abide by them.
15) The club or management shall not be responsible for any loss of life of any kind.
16) Members who wish to apply for swimming passes must pass the swimming test — this is mandatory.`;

export const DEFAULT_SWIMMER_TERMS_MR = `१) एकदा घेतलेले सभासदत्व कोणत्याही कारणास्तव रद्द करता येणार नाही. त्यातील पूर्ण किंवा काही भागातील पैसे परत मिळणार नाहीत, ह्याची नोंद घ्यावी. तसेच सभासदत्व परस्पर दुसऱ्या व्यक्तीच्या नावे करता येणार नाही.
२) सदस्यात्वासाठीचा अर्ज स्विकारण्याचा अथवा नाकारण्याचा अधिकार व्यवस्थापनाला राहील व तो निर्णय अंतिम असेल.
३) क्लबच्या आवारात सदस्यांनी व त्यांच्याबरोबरच्या लोकांनी स्वतःच्या जबाबदारीवर प्रवेश करावा.
४) सभासदाचे सभासदत्व पास दिल्याच्या तारखेपासून सुरू होईल, असा पास प्रत्येक प्रवेशाच्या वेळी दाखवणे आवश्यक आहे. ओळखपत्राशिवाय प्रवेश मिळणार नाही.
५) सभासदास गैरहजर राहिल्याबद्दल किंवा इतर कुठल्याही कारणाने मुदतवाढ मिळणार नाही.
६) कोणत्याही पूर्वसूचनेशिवाय मॅनेजमेंट नियमात बदल किंवा नवीन नियम करण्याचे अधिकार किंवा फी वाढीचे अधिकार राखून ठेवत आहे.
७) तलावाचा वापर करताना कुठल्याही प्रकारच्या धोक्याला, पडझडीला तसेच मौल्यवान वस्तू हरवण्याला व्यवस्थापन जबाबदार राहणार नाही.
८) क्लबचा सदस्य किंवा त्याच्या बरोबरच्या लोकांचे क्लबच्या आवारात जर कोणत्याही प्रकारचे नुकसान झाले, खर्च झाला किंवा कुठलेही उपचार करावे लागले तर त्यास व्यवस्थापन जबाबदार रहाणार नाही.
९) मद्यपान व धुम्रपान करण्यास क्लबच्या आवारात सक्त मनाई आहे.
१०) सदस्यांनी पार्किंगच्या जागेचा योग्य वापर करून स्वतःच्या जबाबदारीवर वाहने ठेवावीत.
११) ह्या अर्जाद्वारे मी असे जाहीर करतो की, माझी कोणतीही प्रकृतीची तक्रार किंवा आजार, तत्सम रोग मला नाहीत किंवा माझे कोणतेही मोठे ऑपरेशन झालेले नाही. मी तंदुरूस्त असून पोहणे शिकू शकतो किंवा पोहण्यास येऊ शकतो.
१२) तलावावर कोणत्याही डॉक्टर अटेंडंट नाही.
१३) आणीबाणीच्या परिस्थितीत माझ्यावर माझ्या जबाबदारीने मी प्रथमोपचार करण्याची व मला डॉक्टरकडे घेऊन जाण्याची मी क्लबला परवानगी देतो.
१४) सूचना फलकावरच्या सर्व सूचनांचे व अटींचे मी वाचन केले आहे व त्याचे पालन करीन.
१५) कोणत्याही प्रकारच्या जीवित हानीला क्लब किंवा व्यवस्थापन जबाबदार राहणार नाही.
१६) ज्या सभासदांना पोहण्याच्या पासेस साठी अर्ज करावयाचा आहे, अशा सभासदांना जलतरण चाचणी-उत्तीर्ण होणे अनिवार्य आहे.`;

export function defaultSwimmerTerms(lang: 'en' | 'mr') {
  return lang === 'mr' ? DEFAULT_SWIMMER_TERMS_MR : DEFAULT_SWIMMER_TERMS_EN;
}

/** True when text is empty or matches a built-in default (either language / older drafts). */
export function isDefaultSwimmerTerms(stored: string) {
  const text = String(stored ?? '').trim();
  if (!text) return true;
  if (text === DEFAULT_SWIMMER_TERMS_EN || text === DEFAULT_SWIMMER_TERMS_MR) return true;
  if (
    text.startsWith('सभासदत्त्वाचे नियम व अटी') ||
    text.startsWith('Membership Terms & Conditions')
  ) {
    return true;
  }
  // Older built-in drafts that still use clause 17 instead of 16.
  if (/(?:^|\n)(?:१७|17)\)\s/.test(text) && !/(?:^|\n)(?:१६|16)\)\s/.test(text)) {
    return true;
  }
  return false;
}

/** Use saved custom terms; empty / built-in default → current language built-in text. */
export function resolveSwimmerTerms(stored: string, lang: 'en' | 'mr') {
  if (isDefaultSwimmerTerms(stored)) return defaultSwimmerTerms(lang);
  return String(stored ?? '').trim();
}
