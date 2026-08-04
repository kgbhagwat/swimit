export type HolidayScope = 'national' | 'state';

export type NationalHolidayOption = {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  scope: HolidayScope;
};

type HolidayDef = {
  id: string;
  name: string;
  month: number;
  day: number;
  scope: HolidayScope;
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function ymd(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Fixed-date holidays observed every year. */
const FIXED: HolidayDef[] = [
  { id: 'republic-day', name: 'Republic Day', month: 1, day: 26, scope: 'national' },
  { id: 'shivaji-jayanti', name: 'Chhatrapati Shivaji Maharaj Jayanti', month: 2, day: 19, scope: 'state' },
  { id: 'ambedkar-jayanti', name: 'Dr. Babasaheb Ambedkar Jayanti', month: 4, day: 14, scope: 'state' },
  { id: 'maharashtra-day', name: 'Maharashtra Day', month: 5, day: 1, scope: 'state' },
  { id: 'independence-day', name: 'Independence Day', month: 8, day: 15, scope: 'national' },
  { id: 'gandhi-jayanti', name: "Mahatma Gandhi's Birthday", month: 10, day: 2, scope: 'national' },
  { id: 'christmas', name: 'Christmas Day', month: 12, day: 25, scope: 'national' },
];

/**
 * Year-specific national + Maharashtra state public holidays.
 * Prefer Maharashtra GAD / central gazetted lists where available.
 */
const YEAR_SPECIFIC: Record<number, HolidayDef[]> = {
  2025: [
    { id: 'maha-shivaratri', name: 'Maha Shivaratri', month: 2, day: 26, scope: 'national' },
    { id: 'holi', name: 'Holi', month: 3, day: 14, scope: 'national' },
    { id: 'gudi-padwa', name: 'Gudi Padwa', month: 3, day: 30, scope: 'state' },
    { id: 'id-ul-fitr', name: 'Id-ul-Fitr', month: 3, day: 31, scope: 'national' },
    { id: 'ram-navami', name: 'Ram Navami', month: 4, day: 6, scope: 'national' },
    { id: 'mahavir-jayanti', name: 'Mahavir Jayanti', month: 4, day: 10, scope: 'national' },
    { id: 'good-friday', name: 'Good Friday', month: 4, day: 18, scope: 'national' },
    { id: 'buddha-purnima', name: 'Buddha Purnima', month: 5, day: 12, scope: 'national' },
    { id: 'id-ul-zuha', name: 'Id-ul-Zuha (Bakrid)', month: 6, day: 7, scope: 'national' },
    { id: 'muharram', name: 'Muharram', month: 7, day: 6, scope: 'national' },
    { id: 'janmashtami', name: 'Janmashtami', month: 8, day: 16, scope: 'national' },
    { id: 'parsi-new-year', name: 'Parsi New Year', month: 8, day: 15, scope: 'state' },
    { id: 'milad-un-nabi', name: 'Milad-un-Nabi (Id-e-Milad)', month: 9, day: 5, scope: 'national' },
    { id: 'ganesh-chaturthi', name: 'Ganesh Chaturthi', month: 8, day: 27, scope: 'state' },
    { id: 'dussehra', name: 'Dussehra (Vijaya Dashami)', month: 10, day: 2, scope: 'national' },
    { id: 'diwali', name: 'Diwali (Deepavali)', month: 10, day: 20, scope: 'national' },
    { id: 'diwali-bali-pratipada', name: 'Diwali (Bali Pratipada)', month: 10, day: 22, scope: 'state' },
    { id: 'bhaubeej', name: 'Bhaubeej', month: 10, day: 23, scope: 'state' },
    { id: 'guru-nanak', name: "Guru Nanak's Birthday", month: 11, day: 5, scope: 'national' },
  ],
  2026: [
    { id: 'maha-shivaratri', name: 'Maha Shivaratri', month: 2, day: 15, scope: 'national' },
    { id: 'holi', name: 'Holi (Dhulivandan)', month: 3, day: 3, scope: 'national' },
    { id: 'gudi-padwa', name: 'Gudi Padwa', month: 3, day: 19, scope: 'state' },
    { id: 'id-ul-fitr', name: 'Id-ul-Fitr (Ramzan Id)', month: 3, day: 21, scope: 'national' },
    { id: 'ram-navami', name: 'Ram Navami', month: 3, day: 26, scope: 'national' },
    { id: 'mahavir-jayanti', name: 'Mahavir Jayanti', month: 3, day: 31, scope: 'national' },
    { id: 'good-friday', name: 'Good Friday', month: 4, day: 3, scope: 'national' },
    { id: 'buddha-purnima', name: 'Buddha Purnima', month: 5, day: 1, scope: 'national' },
    { id: 'id-ul-zuha', name: 'Id-ul-Zuha (Bakrid)', month: 5, day: 28, scope: 'national' },
    { id: 'muharram', name: 'Muharram', month: 6, day: 26, scope: 'national' },
    { id: 'parsi-new-year', name: 'Parsi New Year (Shahenshahi)', month: 8, day: 15, scope: 'state' },
    { id: 'milad-un-nabi', name: 'Milad-un-Nabi (Id-e-Milad)', month: 8, day: 26, scope: 'national' },
    { id: 'ganesh-chaturthi', name: 'Ganesh Chaturthi', month: 9, day: 14, scope: 'state' },
    { id: 'dussehra', name: 'Dussehra (Vijaya Dashami)', month: 10, day: 20, scope: 'national' },
    { id: 'diwali', name: 'Diwali (Laxmi Pujan)', month: 11, day: 8, scope: 'national' },
    { id: 'diwali-bali-pratipada', name: 'Diwali (Bali Pratipada)', month: 11, day: 10, scope: 'state' },
    { id: 'bhaubeej', name: 'Bhaubeej', month: 11, day: 11, scope: 'state' },
    { id: 'guru-nanak', name: "Guru Nanak's Birthday", month: 11, day: 24, scope: 'national' },
  ],
  2027: [
    { id: 'maha-shivaratri', name: 'Maha Shivaratri', month: 3, day: 6, scope: 'national' },
    { id: 'holi', name: 'Holi (Dhulivandan)', month: 3, day: 23, scope: 'national' },
    { id: 'gudi-padwa', name: 'Gudi Padwa', month: 3, day: 29, scope: 'state' },
    { id: 'id-ul-fitr', name: 'Id-ul-Fitr (Ramzan Id)', month: 3, day: 10, scope: 'national' },
    { id: 'good-friday', name: 'Good Friday', month: 3, day: 26, scope: 'national' },
    { id: 'ram-navami', name: 'Ram Navami', month: 4, day: 15, scope: 'national' },
    { id: 'mahavir-jayanti', name: 'Mahavir Jayanti', month: 4, day: 19, scope: 'national' },
    { id: 'id-ul-zuha', name: 'Id-ul-Zuha (Bakrid)', month: 5, day: 17, scope: 'national' },
    { id: 'buddha-purnima', name: 'Buddha Purnima', month: 5, day: 20, scope: 'national' },
    { id: 'muharram', name: 'Muharram', month: 6, day: 16, scope: 'national' },
    { id: 'milad-un-nabi', name: 'Milad-un-Nabi (Id-e-Milad)', month: 8, day: 15, scope: 'national' },
    { id: 'janmashtami', name: 'Janmashtami', month: 8, day: 25, scope: 'national' },
    { id: 'ganesh-chaturthi', name: 'Ganesh Chaturthi', month: 9, day: 4, scope: 'state' },
    { id: 'dussehra', name: 'Dussehra (Vijaya Dashami)', month: 10, day: 9, scope: 'national' },
    { id: 'diwali', name: 'Diwali (Laxmi Pujan)', month: 10, day: 29, scope: 'national' },
    { id: 'diwali-bali-pratipada', name: 'Diwali (Bali Pratipada)', month: 10, day: 31, scope: 'state' },
    { id: 'bhaubeej', name: 'Bhaubeej', month: 11, day: 1, scope: 'state' },
    { id: 'guru-nanak', name: "Guru Nanak's Birthday", month: 11, day: 14, scope: 'national' },
  ],
};

export function nationalHolidaysForYear(year: number): NationalHolidayOption[] {
  const fixed = FIXED.map((item) => ({
    id: item.id,
    name: item.name,
    date: ymd(year, item.month, item.day),
    scope: item.scope,
  }));

  const extras = (YEAR_SPECIFIC[year] ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    date: ymd(year, item.month, item.day),
    scope: item.scope,
  }));

  const byId = new Map<string, NationalHolidayOption>();
  for (const item of [...fixed, ...extras]) {
    byId.set(item.id, item);
  }

  return [...byId.values()].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    return a.name.localeCompare(b.name);
  });
}
