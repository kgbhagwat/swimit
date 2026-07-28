import { Router } from 'express';
import { pool } from '../db/pool.js';
import { tenantId } from '../middleware/tenant.js';

export const holidaysRouter = Router();

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

function formatDate(value: unknown) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function mapHoliday(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    holidayType: String(row.holiday_type),
    name: String(row.name ?? ''),
    startDate: formatDate(row.start_date),
    endDate: formatDate(row.end_date),
    notes: String(row.notes ?? ''),
    extendPassHolders: row.extend_pass_holders === true,
    createdAt: row.created_at,
  };
}

async function ensureSettings(accountId: number) {
  await pool.query(
    `INSERT INTO holiday_settings (saas_account_id)
     SELECT $1 WHERE NOT EXISTS (
       SELECT 1 FROM holiday_settings WHERE saas_account_id = $1
     )`,
    [accountId],
  );
  const { rows } = await pool.query(
    `SELECT * FROM holiday_settings WHERE saas_account_id = $1`,
    [accountId],
  );
  return rows[0];
}

holidaysRouter.get('/', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const year = Number(req.query.year) || new Date().getFullYear();
    const settings = await ensureSettings(accountId);
    const { rows } = await pool.query(
      `SELECT *
       FROM holidays
       WHERE saas_account_id = $1
         AND (
           EXTRACT(YEAR FROM start_date) = $2
           OR EXTRACT(YEAR FROM end_date) = $2
         )
       ORDER BY start_date ASC, id ASC`,
      [accountId, year],
    );

    res.json({
      year,
      weeklyHolidays: Array.isArray(settings.weekly_holidays)
        ? settings.weekly_holidays.map(String)
        : [],
      holidays: rows.map((row) => mapHoliday(row)),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load holidays' });
  }
});

holidaysRouter.put('/weekly', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const body = req.body as { weeklyHolidays?: string[] };
    const weekly = Array.isArray(body.weeklyHolidays) ? body.weeklyHolidays.map(String) : [];
    const invalid = weekly.filter((day) => !(WEEKDAYS as readonly string[]).includes(day));
    if (invalid.length > 0) {
      res.status(400).json({ error: 'Invalid weekday in weekly holidays' });
      return;
    }

    await ensureSettings(accountId);
    const { rows } = await pool.query(
      `UPDATE holiday_settings
       SET weekly_holidays = $1, updated_at = NOW()
       WHERE saas_account_id = $2
       RETURNING weekly_holidays`,
      [weekly, accountId],
    );

    res.json({
      weeklyHolidays: Array.isArray(rows[0].weekly_holidays)
        ? rows[0].weekly_holidays.map(String)
        : [],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save weekly holidays' });
  }
});

holidaysRouter.post('/', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const body = req.body as {
      holidayType?: string;
      name?: string;
      startDate?: string;
      endDate?: string;
      notes?: string;
      extendPassHolders?: boolean;
    };

    const holidayType = String(body.holidayType ?? '').trim();
    const name = String(body.name ?? '').trim();
    const startDate = String(body.startDate ?? '').trim();
    const endDate = String(body.endDate ?? body.startDate ?? '').trim();
    const notes = String(body.notes ?? '').trim();
    const extendPassHolders = holidayType === 'surprise' && Boolean(body.extendPassHolders);

    if (holidayType !== 'annual' && holidayType !== 'surprise') {
      res.status(400).json({ error: 'Holiday type must be annual or surprise' });
      return;
    }
    if (!name) {
      res.status(400).json({ error: 'Holiday name is required' });
      return;
    }
    if (!startDate || !endDate) {
      res.status(400).json({ error: 'Start and end dates are required' });
      return;
    }
    if (endDate < startDate) {
      res.status(400).json({ error: 'End date cannot be before start date' });
      return;
    }

    const { rows } = await pool.query(
      `INSERT INTO holidays (saas_account_id, holiday_type, name, start_date, end_date, notes, extend_pass_holders)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [accountId, holidayType, name, startDate, endDate, notes, extendPassHolders],
    );

    let extendedPassHolders = 0;
    if (extendPassHolders) {
      const updated = await pool.query(
        `UPDATE registrations
         SET pass_valid_until = pass_valid_until + INTERVAL '1 day'
         WHERE saas_account_id = $1
           AND is_active = TRUE
           AND pass_valid_until IS NOT NULL
           AND pass_valid_until >= CURRENT_DATE`,
        [accountId],
      );
      extendedPassHolders = updated.rowCount ?? 0;
    }

    res.status(201).json({
      ...mapHoliday(rows[0]),
      extendedPassHolders,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add holiday' });
  }
});

holidaysRouter.delete('/:id', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid holiday id' });
      return;
    }
    const result = await pool.query(
      `DELETE FROM holidays WHERE id = $1 AND saas_account_id = $2`,
      [id, accountId],
    );
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Holiday not found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete holiday' });
  }
});
