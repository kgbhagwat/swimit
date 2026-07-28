import { Router } from 'express';
import { pool } from '../db/pool.js';
import { tenantId } from '../middleware/tenant.js';

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function formatDateValue(value: unknown) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function toIsoDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Inverse of Pass Payment duration math: end − duration → start date. */
function subtractPassDuration(duration: string, endDate: string) {
  const match = String(duration ?? '')
    .trim()
    .match(/^(\d+)\s*(Day|Week|Month|Year)s?$/i);
  const start = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return endDate;
  if (!match) {
    start.setDate(start.getDate() - 30);
    return toIsoDate(start);
  }
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith('day')) start.setDate(start.getDate() - amount);
  else if (unit.startsWith('week')) start.setDate(start.getDate() - amount * 7);
  else if (unit.startsWith('month')) start.setMonth(start.getMonth() - amount);
  else start.setFullYear(start.getFullYear() - amount);
  return toIsoDate(start);
}

function eachIsoDate(startDate: string, endDate: string) {
  const dates: string[] = [];
  const cur = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(end.getTime()) || end < cur) return dates;
  while (cur <= end) {
    dates.push(toIsoDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

function weekdayName(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return WEEKDAYS[d.getDay()] ?? '';
}

export const attendanceSheetRouter = Router();

attendanceSheetRouter.get('/', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const month = String(req.query.month ?? '').trim();
    const view = String(req.query.view ?? 'standard').trim().toLowerCase();
    if (!/^\d{4}-\d{2}$/.test(month)) {
      res.status(400).json({ error: 'month must be YYYY-MM' });
      return;
    }
    if (view !== 'standard' && view !== 'swimmer') {
      res.status(400).json({ error: 'view must be standard or swimmer' });
      return;
    }

    const [year, monthNum] = month.split('-').map(Number);
    const monthIndex = monthNum - 1;
    const dayCount = daysInMonth(year, monthIndex);
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-${String(dayCount).padStart(2, '0')}`;

    const { rows: swimmers } = await pool.query(
      `SELECT r.id, r.full_name, r.pass_type, r.batch, r.coach, r.is_active, r.pass_valid_until,
              pt.duration
       FROM registrations r
       LEFT JOIN pass_types pt
         ON LOWER(TRIM(pt.pass_name)) = LOWER(TRIM(r.pass_type))
        AND pt.saas_account_id = r.saas_account_id
       WHERE r.saas_account_id = $1
         AND (
           COALESCE(r.is_active, TRUE) = TRUE
           OR r.id IN (
             SELECT DISTINCT registration_id
             FROM swimmer_attendance
             WHERE saas_account_id = $1
               AND attendance_date >= $2::date
               AND attendance_date <= $3::date
           )
         )
       ORDER BY r.full_name ASC`,
      [accountId, monthStart, monthEnd],
    );

    type BuiltSwimmer = {
      registrationId: number;
      fullName: string;
      passType: string;
      batch: string;
      coach: string;
      isActive: boolean;
      passValidUntil: string;
      passStart: string;
      duration: string;
    };

    const built: BuiltSwimmer[] = swimmers.map((row) => {
      const passValidUntil = formatDateValue(row.pass_valid_until);
      const duration = String(row.duration ?? '');
      const passStart = passValidUntil ? subtractPassDuration(duration, passValidUntil) : '';
      return {
        registrationId: Number(row.id),
        fullName: row.full_name,
        passType: row.pass_type ?? '',
        batch: row.batch ?? '',
        coach: row.coach ?? '',
        isActive: row.is_active !== false,
        passValidUntil,
        passStart,
        duration,
      };
    });

    let selected = built;
    if (view === 'swimmer') {
      selected = built.filter((item) => {
        if (!item.passValidUntil || !item.passStart) return false;
        return item.passStart <= monthEnd && item.passValidUntil >= monthStart;
      });
    }

    let rangeStart = monthStart;
    let rangeEnd = monthEnd;
    if (view === 'swimmer' && selected.length > 0) {
      rangeStart = selected.reduce(
        (min, item) => (item.passStart < min ? item.passStart : min),
        selected[0].passStart,
      );
      rangeEnd = selected.reduce(
        (max, item) => (item.passValidUntil > max ? item.passValidUntil : max),
        selected[0].passValidUntil,
      );
    }

    const dateColumns = eachIsoDate(rangeStart, rangeEnd);

    await pool.query(
      `INSERT INTO holiday_settings (saas_account_id)
       SELECT $1 WHERE NOT EXISTS (
         SELECT 1 FROM holiday_settings WHERE saas_account_id = $1
       )`,
      [accountId],
    );
    const [{ rows: settingsRows }, { rows: holidayRows }, attendanceResult] = await Promise.all([
      pool.query(
        `SELECT weekly_holidays FROM holiday_settings WHERE saas_account_id = $1`,
        [accountId],
      ),
      pool.query(
        `SELECT name, start_date, end_date
         FROM holidays
         WHERE saas_account_id = $1
           AND start_date <= $3::date
           AND end_date >= $2::date
         ORDER BY start_date ASC, id ASC`,
        [accountId, rangeStart, rangeEnd],
      ),
      selected.length === 0
        ? Promise.resolve({
            rows: [] as { registration_id: number; attendance_date: unknown }[],
          })
        : pool.query(
            `SELECT registration_id, attendance_date
             FROM swimmer_attendance
             WHERE saas_account_id = $1
               AND attendance_date >= $2::date
               AND attendance_date <= $3::date
               AND registration_id = ANY($4::int[])`,
            [accountId, rangeStart, rangeEnd, selected.map((s) => s.registrationId)],
          ),
    ]);

    const weeklyHolidayNames = new Set(
      Array.isArray(settingsRows[0]?.weekly_holidays)
        ? settingsRows[0].weekly_holidays.map(String)
        : [],
    );

    const holidayNameByDate = new Map<string, string>();
    for (const row of holidayRows) {
      const start = formatDateValue(row.start_date);
      const end = formatDateValue(row.end_date);
      const name = String(row.name ?? 'Holiday');
      for (const date of eachIsoDate(start, end)) {
        if (date < rangeStart || date > rangeEnd) continue;
        if (!holidayNameByDate.has(date)) holidayNameByDate.set(date, name);
      }
    }

    const weeklyOffDays: string[] = [];
    const holidayDays: { date: string; name: string }[] = [];
    for (const date of dateColumns) {
      const holidayName = holidayNameByDate.get(date);
      if (holidayName) {
        holidayDays.push({ date, name: holidayName });
        continue;
      }
      if (weeklyHolidayNames.has(weekdayName(date))) {
        weeklyOffDays.push(date);
      }
    }

    const attendanceRows = attendanceResult.rows;

    const datesBySwimmer = new Map<number, Set<string>>();
    for (const row of attendanceRows) {
      const id = Number(row.registration_id);
      const date = formatDateValue(row.attendance_date);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const set = datesBySwimmer.get(id) ?? new Set<string>();
      set.add(date);
      datesBySwimmer.set(id, set);
    }

    const items = selected.map((row) => {
      const attended = datesBySwimmer.get(row.registrationId) ?? new Set<string>();
      const presentDates =
        view === 'swimmer' && row.passStart && row.passValidUntil
          ? dateColumns.filter(
              (d) => d >= row.passStart && d <= row.passValidUntil && attended.has(d),
            )
          : dateColumns.filter((d) => attended.has(d));

      // Day keys for the grid: ISO dates (stable across both views)
      return {
        registrationId: row.registrationId,
        fullName: row.fullName,
        passType: row.passType,
        batch: row.batch,
        coach: row.coach,
        isActive: row.isActive,
        passValidUntil: row.passValidUntil,
        passStart: row.passStart,
        presentDays: presentDates,
        presentCount: presentDates.length,
      };
    });

    res.json({
      month,
      view,
      monthStart,
      monthEnd,
      rangeStart,
      rangeEnd,
      days: dateColumns,
      weeklyOffDays,
      holidayDays,
      items,
      swimmerCount: items.length,
      totalAttendanceMarks: items.reduce((sum, item) => sum + item.presentCount, 0),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load attendance sheet' });
  }
});
