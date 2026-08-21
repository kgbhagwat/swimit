import { Router } from 'express';
import { pool } from '../db/pool.js';
import { tenantId } from '../middleware/tenant.js';

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function parseDurationDays(duration: string, year: number, monthIndex: number) {
  const match = String(duration ?? '')
    .trim()
    .match(/^(\d+)\s*(Day|Week|Month|Year)s?$/i);
  if (!match) return 30;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith('day')) return Math.max(1, amount);
  if (unit.startsWith('week')) return Math.max(1, amount * 7);
  if (unit.startsWith('month')) return Math.max(1, amount * daysInMonth(year, monthIndex));
  if (unit.startsWith('year')) return Math.max(1, amount * 365);
  return 30;
}

/** How many months the pass duration covers (for monthly coach charge). */
function parseDurationMonths(duration: string) {
  const match = String(duration ?? '')
    .trim()
    .match(/^(\d+)\s*(Day|Week|Month|Year)s?$/i);
  if (!match) return 1;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith('month')) return Math.max(1, amount);
  if (unit.startsWith('year')) return Math.max(1, amount * 12);
  if (unit.startsWith('week')) return Math.max(1, amount / 4);
  if (unit.startsWith('day')) return Math.max(1, amount / 30);
  return 1;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

type PaymentBasis = 'pass' | 'month' | 'day';

function parseMonthBasis(month: string, basisRaw: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) return { error: 'month must be YYYY-MM' as const };
  const basis = basisRaw.trim().toLowerCase();
  if (basis !== 'pass' && basis !== 'month' && basis !== 'day') {
    return { error: 'basis must be pass, month or day' as const };
  }
  const [year, monthNum] = month.split('-').map(Number);
  const monthIndex = monthNum - 1;
  const monthStart = `${month}-01`;
  const monthEndDay = daysInMonth(year, monthIndex);
  const monthEnd = `${month}-${String(monthEndDay).padStart(2, '0')}`;
  return { month, basis: basis as PaymentBasis, year, monthIndex, monthStart, monthEnd };
}

async function loadAttendanceDays(
  accountId: number,
  monthStart: string,
  monthEnd: string,
  registrationIds: number[],
) {
  const attendanceDays = new Map<number, number>();
  if (registrationIds.length === 0) return attendanceDays;
  const attendance = await pool.query(
    `SELECT registration_id, COUNT(*)::int AS days
     FROM swimmer_attendance
     WHERE saas_account_id = $1
       AND attendance_date >= $2::date
       AND attendance_date <= $3::date
       AND registration_id = ANY($4::int[])
     GROUP BY registration_id`,
    [accountId, monthStart, monthEnd, registrationIds],
  );
  for (const row of attendance.rows) {
    attendanceDays.set(Number(row.registration_id), Number(row.days));
  }
  return attendanceDays;
}

function amountForSwimmer(
  row: {
    coaching_charges?: unknown;
    pass_charges?: unknown;
    duration?: unknown;
    id: number;
  },
  basis: PaymentBasis,
  year: number,
  monthIndex: number,
  attendanceDays: Map<number, number>,
) {
  // Coach payment always uses coaching_charges — never pass_charges (pool fee).
  const passCharges = Number(row.pass_charges ?? 0);
  const coachingCharges = Number(row.coaching_charges ?? 0);
  const duration = String(row.duration ?? '');
  const durationDays = parseDurationDays(duration, year, monthIndex);
  const durationMonths = parseDurationMonths(duration);
  const attendedDays = attendanceDays.get(Number(row.id)) ?? 0;
  const dailyRate = durationDays > 0 ? coachingCharges / durationDays : 0;
  const monthlyRate = durationMonths > 0 ? coachingCharges / durationMonths : coachingCharges;
  let amount = coachingCharges;
  if (basis === 'month') amount = monthlyRate;
  else if (basis === 'day') amount = dailyRate * attendedDays;
  return {
    passCharges,
    coachingCharges,
    duration,
    durationDays,
    attendedDays,
    dailyRate: roundMoney(dailyRate),
    amount: roundMoney(amount),
  };
}

export const coachPaymentRouter = Router();

coachPaymentRouter.get('/settings', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const { rows } = await pool.query(
      `SELECT COALESCE(coach_payment_basis, 'month') AS basis
       FROM pool_core_info
       WHERE saas_account_id = $1`,
      [accountId],
    );
    const basis = String(rows[0]?.basis ?? 'month').trim().toLowerCase();
    res.json({ basis: basis === 'pass' || basis === 'day' ? basis : 'month' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load coach payment settings' });
  }
});

coachPaymentRouter.get('/summary', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const parsed = parseMonthBasis(
      String(req.query.month ?? '').trim(),
      String(req.query.basis ?? 'month'),
    );
    if ('error' in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const { month, basis, year, monthIndex, monthStart, monthEnd } = parsed;

    const { rows: coaches } = await pool.query(
      `SELECT id, full_name
       FROM staff_registrations
       WHERE saas_account_id = $1
         AND registration_for = 'Coach'
         AND COALESCE(is_active, TRUE) = TRUE
       ORDER BY full_name ASC`,
      [accountId],
    );

    const { rows: swimmers } = await pool.query(
      `SELECT r.id, r.full_name, r.pass_type, r.batch, r.coach, r.is_active,
              pt.duration, pt.pass_charges, pt.coaching_charges
       FROM registrations r
       LEFT JOIN pass_types pt
         ON LOWER(TRIM(pt.pass_name)) = LOWER(TRIM(r.pass_type))
        AND pt.saas_account_id = r.saas_account_id
       WHERE r.saas_account_id = $1
         AND COALESCE(TRIM(r.pass_type), '') <> ''
         AND COALESCE(TRIM(r.coach), '') <> ''
         AND LOWER(TRIM(r.coach)) <> 'not required'
         AND LOWER(TRIM(r.coach)) <> 'any'`,
      [accountId],
    );

    const attendanceDays = await loadAttendanceDays(
      accountId,
      monthStart,
      monthEnd,
      swimmers.map((s) => Number(s.id)),
    );

    const byCoachPass = new Map<
      string,
      {
        coachId: number;
        coachName: string;
        passType: string;
        passCharges: number;
        coachingCharges: number;
        swimmerCount: number;
        total: number;
      }
    >();

    const coachMeta = new Map<string, { coachId: number; coachName: string }>();
    for (const coach of coaches) {
      const key = String(coach.full_name).trim().toLowerCase();
      coachMeta.set(key, { coachId: Number(coach.id), coachName: coach.full_name });
    }

    for (const row of swimmers) {
      const coachKey = String(row.coach ?? '')
        .trim()
        .toLowerCase();
      const meta = coachMeta.get(coachKey);
      if (!meta) continue;
      const passType = String(row.pass_type ?? '').trim() || '—';
      const bucketKey = `${coachKey}||${passType.toLowerCase()}`;
      const calc = amountForSwimmer(row, basis, year, monthIndex, attendanceDays);
      const existing = byCoachPass.get(bucketKey) ?? {
        coachId: meta.coachId,
        coachName: meta.coachName,
        passType,
        passCharges: calc.passCharges,
        coachingCharges: calc.coachingCharges,
        swimmerCount: 0,
        total: 0,
      };
      existing.swimmerCount += 1;
      existing.total = roundMoney(existing.total + calc.amount);
      byCoachPass.set(bucketKey, existing);
    }

    const items = [...byCoachPass.values()].sort((a, b) => {
      const byName = a.coachName.localeCompare(b.coachName);
      if (byName !== 0) return byName;
      return a.passType.localeCompare(b.passType);
    });

    for (const coach of coaches) {
      const key = String(coach.full_name).trim().toLowerCase();
      const hasRows = items.some(
        (item) => item.coachName.trim().toLowerCase() === key,
      );
      if (!hasRows) {
        items.push({
          coachId: Number(coach.id),
          coachName: coach.full_name,
          passType: '—',
          passCharges: 0,
          coachingCharges: 0,
          swimmerCount: 0,
          total: 0,
        });
      }
    }

    items.sort((a, b) => {
      const byName = a.coachName.localeCompare(b.coachName);
      if (byName !== 0) return byName;
      return a.passType.localeCompare(b.passType);
    });

    const grandTotal = roundMoney(items.reduce((sum, item) => sum + item.total, 0));
    const totalSwimmers = items.reduce((sum, item) => sum + item.swimmerCount, 0);

    res.json({
      month,
      basis,
      monthStart,
      monthEnd,
      items,
      totalSwimmers,
      grandTotal,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load coach payment summary' });
  }
});

coachPaymentRouter.get('/', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const coach = String(req.query.coach ?? '').trim();
    if (!coach) {
      res.status(400).json({ error: 'Coach is required' });
      return;
    }

    const parsed = parseMonthBasis(
      String(req.query.month ?? '').trim(),
      String(req.query.basis ?? 'month'),
    );
    if ('error' in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const { month, basis, year, monthIndex, monthStart, monthEnd } = parsed;

    const { rows: swimmers } = await pool.query(
      `SELECT r.id, r.full_name, r.pass_type, r.batch, r.coach, r.is_active, r.pass_valid_until,
              pt.duration, pt.pass_charges, pt.coaching_charges
       FROM registrations r
       LEFT JOIN pass_types pt
         ON LOWER(TRIM(pt.pass_name)) = LOWER(TRIM(r.pass_type))
        AND pt.saas_account_id = r.saas_account_id
       WHERE r.saas_account_id = $1
         AND LOWER(TRIM(r.coach)) = LOWER(TRIM($2))
         AND COALESCE(TRIM(r.pass_type), '') <> ''
       ORDER BY r.full_name ASC`,
      [accountId, coach],
    );

    const attendanceDays = await loadAttendanceDays(
      accountId,
      monthStart,
      monthEnd,
      swimmers.map((s) => Number(s.id)),
    );

    const items = swimmers.map((row) => {
      const calc = amountForSwimmer(row, basis, year, monthIndex, attendanceDays);
      return {
        registrationId: Number(row.id),
        fullName: row.full_name,
        passType: row.pass_type ?? '',
        batch: row.batch ?? '',
        isActive: row.is_active !== false,
        ...calc,
      };
    });

    const total = roundMoney(items.reduce((sum, item) => sum + item.amount, 0));

    res.json({
      coach,
      month,
      basis,
      monthStart,
      monthEnd,
      items,
      total,
      swimmerCount: items.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to calculate coach payment' });
  }
});
