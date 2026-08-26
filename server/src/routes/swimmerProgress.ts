import type { Request } from 'express';
import { Router } from 'express';
import { recordAudit } from '../auditLog.js';
import { pool } from '../db/pool.js';
import { tenantId } from '../middleware/tenant.js';
import { last10Digits, normalizeEmail } from '../mobileUniqueness.js';
import { parseLoginType } from '../menuAccess.js';

const STROKES = [
  'Free Style',
  'Back Stroke',
  'Breast Stroke',
  'Butterfly',
] as const;
const DISTANCES = [25, 50, 100, 200, 400, 800] as const;

function todayIsoLocal() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateValue(value: unknown) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function twoDigitMs(raw: string) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length <= 2) return digits.padStart(2, '0');
  return String(Math.min(99, Math.floor(Number(digits.slice(0, 3)) / 10))).padStart(2, '0');
}

function normalizeTimeText(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const full = raw.match(/^(\d{1,2}):([0-5]\d):(\d{1,3})$/);
  if (full) {
    return `${String(Number(full[1])).padStart(2, '0')}:${full[2]}:${twoDigitMs(full[3])}`;
  }
  const legacy = raw.match(/^(\d{1,2}):([0-5]\d)$/);
  if (legacy) {
    return `${String(Number(legacy[1])).padStart(2, '0')}:${legacy[2]}:00`;
  }
  return null;
}

function parseEventName(raw: unknown) {
  return String(raw ?? '').trim().slice(0, 80);
}

type StrokeDistanceOk = { stroke: string; distanceM: number };
type ParseErr = { error: string };

function parseStrokeDistance(query: Record<string, unknown>): StrokeDistanceOk | ParseErr {
  const stroke = String(query.stroke ?? STROKES[0]).trim();
  const distanceM = Number(query.distanceM ?? query.distance ?? 50);
  if (!(STROKES as readonly string[]).includes(stroke)) return { error: 'Select a stroke' };
  if (!DISTANCES.includes(distanceM as (typeof DISTANCES)[number])) {
    return { error: 'Select a distance' };
  }
  return { stroke, distanceM };
}

function parseFilters(
  query: Record<string, unknown>,
): (StrokeDistanceOk & { recordDate: string }) | ParseErr {
  const recordDate = String(query.recordDate ?? query.date ?? todayIsoLocal()).trim().slice(0, 10);
  const strokeDistance = parseStrokeDistance(query);
  if ('error' in strokeDistance) return strokeDistance;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(recordDate)) return { error: 'Enter a valid date' };
  return { recordDate, ...strokeDistance };
}

const COMPETITIVE_WHERE = `
  r.is_active = TRUE
  AND (
    EXISTS (
      SELECT 1 FROM batch_slots b
      WHERE b.saas_account_id = r.saas_account_id
        AND b.type = 'Advance'
        AND (
          TRIM(COALESCE(r.batch, '')) = b.name
          OR r.batch ILIKE '% — Advance — %'
          OR r.batch ILIKE b.name || ' — %'
        )
    )
    OR EXISTS (
      SELECT 1 FROM pass_types t
      WHERE t.saas_account_id = r.saas_account_id
        AND t.pass_name = r.pass_type
        AND t.for_audience ILIKE '%Competitive%'
    )
  )
`;

/** Coach logins are scoped to swimmers assigned to them. Admins and other roles see all. */
async function assignedCoachNames(req: Request, accountId: number): Promise<string[] | null> {
  const auth = req.auth;
  if (!auth?.userId || auth.isAccountAdmin || auth.kind !== 'account') return null;

  const { rows: users } = await pool.query<{
    email: string;
    mobile: string;
    user_name: string;
    login_type: string;
  }>(
    `SELECT email, mobile, user_name, login_type FROM app_users WHERE id = $1 AND saas_account_id = $2`,
    [auth.userId, accountId],
  );
  const user = users[0];
  if (!user || parseLoginType(user.login_type) !== 'coach') return null;

  const email = normalizeEmail(user.email);
  const mobile = last10Digits(user.mobile);
  const userName = String(user.user_name ?? '').trim().toLowerCase();

  const { rows: coaches } = await pool.query<{ full_name: string }>(
    `SELECT full_name
     FROM staff_registrations
     WHERE saas_account_id = $1
       AND LOWER(TRIM(COALESCE(registration_for, ''))) = 'coach'
       AND (
         ($2 <> '' AND LOWER(TRIM(COALESCE(email, ''))) = $2)
         OR ($3 <> '' AND LENGTH($3) = 10 AND (
              RIGHT(regexp_replace(COALESCE(whatsapp_mobile, ''), '\\D', '', 'g'), 10) = $3
              OR RIGHT(regexp_replace(COALESCE(other_mobile, ''), '\\D', '', 'g'), 10) = $3
            ))
         OR ($4 <> '' AND LOWER(TRIM(COALESCE(full_name, ''))) = $4)
       )`,
    [accountId, email, mobile, userName],
  );
  return [
    ...new Set(
      coaches
        .map((row) => String(row.full_name ?? '').trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

export const swimmerProgressRouter = Router();

swimmerProgressRouter.get('/trend', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const filters = parseStrokeDistance(req.query as Record<string, unknown>);
    if ('error' in filters) {
      res.status(400).json({ error: filters.error });
      return;
    }

    const coachNames = await assignedCoachNames(req, accountId);
    const params: unknown[] = [accountId, filters.stroke, filters.distanceM];
    const coachClause = coachNames
      ? `AND LOWER(TRIM(COALESCE(r.coach, ''))) = ANY($${params.push(coachNames)}::text[])`
      : '';

    const rows = await pool.query(
      `SELECT r.id, r.full_name, r.batch, r.coach, p.record_date, p.time_text
       FROM registrations r
       LEFT JOIN swimmer_progress p
         ON p.saas_account_id = r.saas_account_id
        AND p.registration_id = r.id
        AND p.stroke = $2
        AND p.distance_m = $3
       WHERE r.saas_account_id = $1
         AND ${COMPETITIVE_WHERE}
         ${coachClause}
       ORDER BY r.full_name ASC, r.id ASC, p.record_date ASC`,
      params,
    );

    const dates: string[] = [];
    const dateSet = new Set<string>();
    const swimmers = new Map<
      number,
      { id: number; name: string; batch: string; coach: string; times: Record<string, string> }
    >();

    for (const row of rows.rows) {
      const id = Number(row.id);
      if (!swimmers.has(id)) {
        swimmers.set(id, {
          id,
          name: String(row.full_name ?? ''),
          batch: String(row.batch ?? ''),
          coach: String(row.coach ?? ''),
          times: {},
        });
      }
      const date = formatDateValue(row.record_date);
      const timeText = String(row.time_text ?? '');
      if (!date || !timeText) continue;
      if (!dateSet.has(date)) {
        dateSet.add(date);
        dates.push(date);
      }
      swimmers.get(id)!.times[date] = timeText;
    }

    res.json({
      stroke: filters.stroke,
      distanceM: filters.distanceM,
      dates,
      swimmers: [...swimmers.values()],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load progress trend' });
  }
});

swimmerProgressRouter.get('/', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const filters = parseFilters(req.query as Record<string, unknown>);
    if ('error' in filters) {
      res.status(400).json({ error: filters.error });
      return;
    }

    const coachNames = await assignedCoachNames(req, accountId);
    const params: unknown[] = [accountId, filters.recordDate, filters.stroke, filters.distanceM];
    const coachClause = coachNames
      ? `AND LOWER(TRIM(COALESCE(r.coach, ''))) = ANY($${params.push(coachNames)}::text[])`
      : '';

    const swimmers = await pool.query(
      `SELECT r.id, r.full_name, r.batch, r.coach, p.time_text, p.event_name
       FROM registrations r
       LEFT JOIN swimmer_progress p
         ON p.saas_account_id = r.saas_account_id
        AND p.registration_id = r.id
        AND p.record_date = $2::date
        AND p.stroke = $3
        AND p.distance_m = $4
       WHERE r.saas_account_id = $1
         AND ${COMPETITIVE_WHERE}
         ${coachClause}
       ORDER BY r.full_name ASC, r.id ASC`,
      params,
    );

    const eventName =
      swimmers.rows.map((row) => String(row.event_name ?? '').trim()).find(Boolean) ?? '';

    res.json({
      recordDate: filters.recordDate,
      stroke: filters.stroke,
      distanceM: filters.distanceM,
      eventName,
      swimmers: swimmers.rows.map((row) => ({
        id: Number(row.id),
        name: String(row.full_name ?? ''),
        batch: String(row.batch ?? ''),
        coach: String(row.coach ?? ''),
        timeText: String(row.time_text ?? ''),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load swimmer progress' });
  }
});

swimmerProgressRouter.put('/', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const body = req.body as Record<string, unknown>;
    const filters = parseFilters(body);
    if ('error' in filters) {
      res.status(400).json({ error: filters.error });
      return;
    }
    if (filters.recordDate > todayIsoLocal()) {
      res.status(400).json({ error: 'Date cannot be in the future' });
      return;
    }

    const entries = Array.isArray(body.entries) ? body.entries : [];
    const eventName = parseEventName(body.eventName ?? body.event);
    const saved: Array<{ registrationId: number; timeText: string }> = [];
    const coachNames = await assignedCoachNames(req, accountId);
    for (const item of entries) {
      const row = item as Record<string, unknown>;
      const registrationId = Number(row.registrationId ?? row.id);
      if (!Number.isInteger(registrationId) || registrationId <= 0) continue;
      const timeText = normalizeTimeText(row.timeText ?? row.time);
      if (timeText === null) {
        res.status(400).json({ error: 'Enter timing as mm:ss:msec (e.g. 01:23:45)' });
        return;
      }

      const ownedParams: unknown[] = [registrationId, accountId];
      const coachClause = coachNames
        ? `AND LOWER(TRIM(COALESCE(r.coach, ''))) = ANY($${ownedParams.push(coachNames)}::text[])`
        : '';
      const owned = await pool.query(
        `SELECT r.id FROM registrations r
         WHERE r.id = $1 AND r.saas_account_id = $2
           AND ${COMPETITIVE_WHERE}
           ${coachClause}`,
        ownedParams,
      );
      if (!owned.rows[0]) continue;

      if (!timeText) {
        await pool.query(
          `DELETE FROM swimmer_progress
           WHERE saas_account_id = $1
             AND registration_id = $2
             AND record_date = $3::date
             AND stroke = $4
             AND distance_m = $5`,
          [accountId, registrationId, filters.recordDate, filters.stroke, filters.distanceM],
        );
        saved.push({ registrationId, timeText: '' });
        continue;
      }

      await pool.query(
        `INSERT INTO swimmer_progress
           (saas_account_id, registration_id, record_date, stroke, distance_m, time_text, event_name, updated_at)
         VALUES ($1, $2, $3::date, $4, $5, $6, $7, NOW())
         ON CONFLICT (saas_account_id, registration_id, record_date, stroke, distance_m)
         DO UPDATE SET
           time_text = EXCLUDED.time_text,
           event_name = EXCLUDED.event_name,
           updated_at = NOW()`,
        [
          accountId,
          registrationId,
          filters.recordDate,
          filters.stroke,
          filters.distanceM,
          timeText,
          eventName,
        ],
      );
      saved.push({ registrationId, timeText });
    }

    await pool.query(
      `UPDATE swimmer_progress
          SET event_name = $1, updated_at = NOW()
        WHERE saas_account_id = $2
          AND record_date = $3::date
          AND stroke = $4
          AND distance_m = $5`,
      [eventName, accountId, filters.recordDate, filters.stroke, filters.distanceM],
    );

    await recordAudit(req, {
      action: 'update',
      entityType: 'swimmer_progress',
      entityId: accountId,
      entityLabel: 'Swimmer progress',
      summary: 'Updated competitive swimmer timings',
      details: {
        recordDate: filters.recordDate,
        stroke: filters.stroke,
        distanceM: filters.distanceM,
        eventName,
        count: saved.length,
      },
    });

    res.json({ ok: true, ...filters, eventName, saved });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save swimmer progress' });
  }
});
