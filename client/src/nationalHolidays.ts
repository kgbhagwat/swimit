export type NationalHolidayOption = {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
};

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function ymd(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Fixed-date national holidays observed every year in India. */
const FIXED_NATIONAL: Array<{ id: string; name: string; month: number; day: number }> = [
  { id: 'republic-day', name: 'Republic Day', month: 1, day: 26 },
  { id: 'independence-day', name: 'Independence Day', month: 8, day: 15 },
  { id: 'gandhi-jayanti', name: "Mahatma Gandhi's Birthday", month: 10, day: 2 },
  { id: 'christmas', name: 'Christmas Day', month: 12, day: 25 },
];

/**
 * Year-specific gazetted / commonly observed holidays (India).
 * Dates follow Central Government gazetted holiday lists where available.
 */
const YEAR_SPECIFIC: Record<number, Array<{ id: string; name: string; month: number; day: number }>> = {
  2025: [
    { id: 'maha-shivaratri', name: 'Maha Shivaratri', month: 2, day: 26 },
    { id: 'holi', name: 'Holi', month: 3, day: 14 },
    { id: 'id-ul-fitr', name: 'Id-ul-Fitr', month: 3, day: 31 },
    { id: 'mahavir-jayanti', name: 'Mahavir Jayanti', month: 4, day: 10 },
    { id: 'good-friday', name: 'Good Friday', month: 4, day: 18 },
    { id: 'buddha-purnima', name: 'Buddha Purnima', month: 5, day: 12 },
    { id: 'id-ul-zuha', name: 'Id-ul-Zuha (Bakrid)', month: 6, day: 7 },
    { id: 'muharram', name: 'Muharram', month: 7, day: 6 },
    { id: 'janmashtami', name: 'Janmashtami', month: 8, day: 16 },
    { id: 'milad-un-nabi', name: 'Milad-un-Nabi (Id-e-Milad)', month: 9, day: 5 },
    { id: 'dussehra', name: 'Dussehra (Vijaya Dashami)', month: 10, day: 2 },
    { id: 'diwali', name: 'Diwali (Deepavali)', month: 10, day: 20 },
    { id: 'guru-nanak', name: "Guru Nanak's Birthday", month: 11, day: 5 },
  ],
  2026: [
    { id: 'holi', name: 'Holi', month: 3, day: 4 },
    { id: 'id-ul-fitr', name: 'Id-ul-Fitr', month: 3, day: 21 },
    { id: 'ram-navami', name: 'Ram Navami', month: 3, day: 26 },
    { id: 'mahavir-jayanti', name: 'Mahavir Jayanti', month: 3, day: 31 },
    { id: 'good-friday', name: 'Good Friday', month: 4, day: 3 },
    { id: 'buddha-purnima', name: 'Buddha Purnima', month: 5, day: 1 },
    { id: 'id-ul-zuha', name: 'Id-ul-Zuha (Bakrid)', month: 5, day: 27 },
    { id: 'muharram', name: 'Muharram', month: 6, day: 26 },
    { id: 'milad-un-nabi', name: 'Milad-un-Nabi (Id-e-Milad)', month: 8, day: 26 },
    { id: 'janmashtami', name: 'Janmashtami', month: 9, day: 4 },
    { id: 'dussehra', name: 'Dussehra (Vijaya Dashami)', month: 10, day: 20 },
    { id: 'diwali', name: 'Diwali (Deepavali)', month: 11, day: 8 },
    { id: 'guru-nanak', name: "Guru Nanak's Birthday", month: 11, day: 24 },
  ],
  2027: [
    { id: 'id-ul-fitr', name: 'Id-ul-Fitr', month: 3, day: 10 },
    { id: 'holi', name: 'Holi', month: 3, day: 23 },
    { id: 'good-friday', name: 'Good Friday', month: 3, day: 26 },
    { id: 'ram-navami', name: 'Ram Navami', month: 4, day: 15 },
    { id: 'mahavir-jayanti', name: 'Mahavir Jayanti', month: 4, day: 19 },
    { id: 'id-ul-zuha', name: 'Id-ul-Zuha (Bakrid)', month: 5, day: 17 },
    { id: 'buddha-purnima', name: 'Buddha Purnima', month: 5, day: 20 },
    { id: 'muharram', name: 'Muharram', month: 6, day: 16 },
    { id: 'milad-un-nabi', name: 'Milad-un-Nabi (Id-e-Milad)', month: 8, day: 15 },
    { id: 'janmashtami', name: 'Janmashtami', month: 8, day: 25 },
    { id: 'dussehra', name: 'Dussehra (Vijaya Dashami)', month: 10, day: 9 },
    { id: 'diwali', name: 'Diwali (Deepavali)', month: 10, day: 29 },
    { id: 'guru-nanak', name: "Guru Nanak's Birthday", month: 11, day: 14 },
  ],
};

export function nationalHolidaysForYear(year: number): NationalHolidayOption[] {
  const fixed = FIXED_NATIONAL.map((item) => ({
    id: item.id,
    name: item.name,
    date: ymd(year, item.month, item.day),
  }));

  const extras = (YEAR_SPECIFIC[year] ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    date: ymd(year, item.month, item.day),
  }));

  const byId = new Map<string, NationalHolidayOption>();
  for (const item of [...fixed, ...extras]) {
    byId.set(item.id, item);
  }

  return [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));
}
