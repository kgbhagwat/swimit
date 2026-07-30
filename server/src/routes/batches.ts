import { Router } from 'express';
import { pool } from '../db/pool.js';
import { tenantId } from '../middleware/tenant.js';

const SESSIONS = ['Morning', 'Afternoon', 'Evening', 'Complete Day'] as const;
type Session = (typeof SESSIONS)[number];

type SlotInput = {
  id?: string;
  name: string;
  type: string;
  startTime: string;
  endTime: string;
};

type ScheduleInput = {
  session?: string;
  batchMinutes: number;
  breakMinutes: number;
  firstStart: string;
  lastEnd: string;
};

function parseSession(value: unknown): Session {
  return SESSIONS.includes(value as Session) ? (value as Session) : 'Complete Day';
}

function timeToMinutes(value: string) {
  const [h, m] = value.slice(0, 5).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return NaN;
  return h * 60 + m;
}

function schedulesOverlap(a: ScheduleInput, b: ScheduleInput) {
  const aStart = timeToMinutes(a.firstStart);
  const aEnd = timeToMinutes(a.lastEnd);
  const bStart = timeToMinutes(b.firstStart);
  const bEnd = timeToMinutes(b.lastEnd);
  if ([aStart, aEnd, bStart, bEnd].some((n) => Number.isNaN(n))) return false;
  return aStart < bEnd && bStart < aEnd;
}

function formatTimeValue(value: unknown) {
  if (typeof value === 'string') {
    return value.slice(0, 5);
  }
  if (value instanceof Date) {
    const h = String(value.getUTCHours()).padStart(2, '0');
    const m = String(value.getUTCMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
  return String(value ?? '').slice(0, 5);
}

function mapSchedule(row: {
  id: number;
  session?: string | null;
  batch_minutes: number;
  break_minutes: number;
  first_start: unknown;
  last_end: unknown;
}) {
  return {
    id: String(row.id),
    session: parseSession(row.session),
    batchMinutes: row.batch_minutes,
    breakMinutes: row.break_minutes,
    firstStart: formatTimeValue(row.first_start),
    lastEnd: formatTimeValue(row.last_end),
  };
}

export const batchesRouter = Router();

batchesRouter.get('/', async (req, res) => {
  const accountId = tenantId(req);
  const settingsResult = await pool.query(
    `SELECT id, session, batch_minutes, break_minutes, first_start, last_end
     FROM batch_schedule_settings
     WHERE saas_account_id = $1
     ORDER BY sort_order ASC, id ASC`,
    [accountId],
  );

  const slotsResult = await pool.query(
    `SELECT id, name, type, start_time, end_time
     FROM batch_slots
     WHERE saas_account_id = $1
     ORDER BY start_time ASC, name ASC, id ASC`,
    [accountId],
  );

  const schedules = settingsResult.rows.map(mapSchedule);
  res.json({
    schedules:
      schedules.length > 0
        ? schedules
        : [
            {
              id: 'default',
              session: 'Complete Day',
              batchMinutes: 60,
              breakMinutes: 15,
              firstStart: '06:00',
              lastEnd: '20:00',
            },
          ],
    settings: schedules[0] ?? {
      session: 'Complete Day',
      batchMinutes: 60,
      breakMinutes: 15,
      firstStart: '06:00',
      lastEnd: '20:00',
    },
    slots: slotsResult.rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      type: row.type,
      startTime: formatTimeValue(row.start_time),
      endTime: formatTimeValue(row.end_time),
    })),
  });
});

batchesRouter.put('/', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const schedules = (req.body?.schedules ??
      (req.body?.settings ? [req.body.settings] : [])) as ScheduleInput[];
    const slots = (req.body?.slots ?? []) as SlotInput[];

    if (!Array.isArray(schedules) || schedules.length === 0) {
      res.status(400).json({ error: 'At least one schedule is required' });
      return;
    }

    for (const settings of schedules) {
      if (
        !settings.batchMinutes ||
        settings.batchMinutes <= 0 ||
        settings.breakMinutes < 0 ||
        !settings.firstStart ||
        !settings.lastEnd
      ) {
        res.status(400).json({ error: 'Invalid schedule settings' });
        return;
      }
      const start = timeToMinutes(settings.firstStart);
      const end = timeToMinutes(settings.lastEnd);
      if (Number.isNaN(start) || Number.isNaN(end) || start >= end) {
        res.status(400).json({ error: 'Each schedule must have start time before end time' });
        return;
      }
    }

    for (let i = 0; i < schedules.length; i += 1) {
      for (let j = i + 1; j < schedules.length; j += 1) {
        if (schedulesOverlap(schedules[i], schedules[j])) {
          const left = parseSession(schedules[i].session);
          const right = parseSession(schedules[j].session);
          res.status(400).json({ error: `${left} and ${right} session times overlap` });
          return;
        }
      }
    }

    await pool.query('BEGIN');

    await pool.query('DELETE FROM batch_schedule_settings WHERE saas_account_id = $1', [accountId]);
    for (let i = 0; i < schedules.length; i += 1) {
      const settings = schedules[i];
      await pool.query(
        `INSERT INTO batch_schedule_settings
         (saas_account_id, session, batch_minutes, break_minutes, first_start, last_end, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          accountId,
          parseSession(settings.session),
          settings.batchMinutes,
          settings.breakMinutes,
          settings.firstStart,
          settings.lastEnd,
          i + 1,
        ],
      );
    }

    await pool.query('DELETE FROM batch_slots WHERE saas_account_id = $1', [accountId]);
    const orderedSlots = [...slots].sort((a, b) => {
      const startDiff = String(a.startTime ?? '').localeCompare(String(b.startTime ?? ''));
      if (startDiff !== 0) return startDiff;
      return String(a.name ?? '').localeCompare(String(b.name ?? ''), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    });
    for (let i = 0; i < orderedSlots.length; i += 1) {
      const slot = orderedSlots[i];
      if (!slot.name || !slot.type || !slot.startTime || !slot.endTime) {
        throw new Error('Each slot needs name, type, start time and end time');
      }
      await pool.query(
        `INSERT INTO batch_slots (saas_account_id, name, type, start_time, end_time, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [accountId, slot.name, slot.type, slot.startTime, slot.endTime, i + 1],
      );
    }

    await pool.query('COMMIT');

    const settingsResult = await pool.query(
      `SELECT id, session, batch_minutes, break_minutes, first_start, last_end
       FROM batch_schedule_settings
       WHERE saas_account_id = $1
       ORDER BY sort_order ASC, id ASC`,
      [accountId],
    );
    const slotsResult = await pool.query(
      `SELECT id, name, type, start_time, end_time
       FROM batch_slots
       WHERE saas_account_id = $1
       ORDER BY start_time ASC, name ASC, id ASC`,
      [accountId],
    );

    const savedSchedules = settingsResult.rows.map(mapSchedule);
    res.json({
      schedules: savedSchedules,
      settings: savedSchedules[0],
      slots: slotsResult.rows.map((row) => ({
        id: String(row.id),
        name: row.name,
        type: row.type,
        startTime: formatTimeValue(row.start_time),
        endTime: formatTimeValue(row.end_time),
      })),
    });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to save batches' });
  }
});
