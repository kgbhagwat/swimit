import { Router } from 'express';
import { recordAudit } from '../auditLog.js';
import { pool } from '../db/pool.js';
import { tenantId } from '../middleware/tenant.js';

type PassBody = {
  passName?: string;
  forAudience?: string;
  prerequisite?: string;
  duration?: string;
  passCharges?: number;
  coachingCharges?: number;
  coach?: string;
  testRequired?: boolean;
  maxSwimmersPerCoach?: number | null;
  exceedingLimitAllowed?: boolean;
  isOffer?: boolean;
  offerStartDate?: string | null;
  offerEndDate?: string | null;
  verificationMode?: string;
};

type VerificationMode = 'ok_not_ok' | 'face';
type CoachPaymentBasis = 'pass' | 'month' | 'day';

function parseVerificationMode(value: unknown): VerificationMode {
  return String(value ?? '').trim() === 'face' ? 'face' : 'ok_not_ok';
}

function parseCoachPaymentBasis(value: unknown): CoachPaymentBasis {
  const basis = String(value ?? '').trim().toLowerCase();
  return basis === 'pass' || basis === 'day' ? basis : 'month';
}

function parseMaxSwimmers(value: unknown): number | null | 'invalid' {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string' && /^no\s*limit$/i.test(value.trim())) return null;
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) return 'invalid';
  return num;
}

function mapRow(row: {
  id: number;
  pass_name: string;
  for_audience: string;
  prerequisite: string;
  duration: string;
  pass_charges: string | number;
  coaching_charges: string | number;
  coach: string | null;
  test_required?: boolean | null;
  max_swimmers_per_coach?: number | null;
  exceeding_limit_allowed?: boolean | null;
  is_offer?: boolean | null;
  offer_start_date?: string | Date | null;
  offer_end_date?: string | Date | null;
  verification_mode?: string | null;
}) {
  const dateOnly = (value: string | Date | null | undefined) =>
    value ? new Date(value).toISOString().slice(0, 10) : null;
  return {
    id: row.id,
    passName: row.pass_name,
    forAudience: row.for_audience,
    prerequisite: row.prerequisite,
    duration: row.duration,
    passCharges: Number(row.pass_charges),
    coachingCharges: Number(row.coaching_charges),
    coach: row.coach ?? '',
    testRequired: Boolean(row.test_required),
    maxSwimmersPerCoach:
      row.max_swimmers_per_coach == null ? null : Number(row.max_swimmers_per_coach),
    exceedingLimitAllowed: row.exceeding_limit_allowed !== false,
    isOffer: Boolean(row.is_offer),
    offerStartDate: dateOnly(row.offer_start_date),
    offerEndDate: dateOnly(row.offer_end_date),
    verificationMode: parseVerificationMode(row.verification_mode),
  };
}

function isBlankAmount(value: unknown) {
  return value === undefined || value === null || value === '';
}

function coachIsRequired(value: unknown) {
  const coach = String(value ?? '').trim() || 'Not Required';
  return coach !== 'Not Required';
}

function validate(body: PassBody) {
  if (!body.passName?.trim()) return 'Pass name is required';
  if (!body.forAudience?.trim()) return 'For is required';
  if (!body.duration?.trim()) return 'Duration is required';
  if (isBlankAmount(body.passCharges) || Number.isNaN(Number(body.passCharges))) {
    return 'Pass charges are required';
  }
  const passCharges = Number(body.passCharges);
  if (passCharges < 0) return 'Pass charges must be a valid amount';
  const coachRequired = coachIsRequired(body.coach);
  const coachingCharges = Number(body.coachingCharges || 0);
  if (Number.isNaN(coachingCharges) || coachingCharges < 0) {
    return 'Coaching charges must be a valid amount';
  }
  if (coachRequired && coachingCharges >= passCharges && !(passCharges === 0 && coachingCharges === 0)) {
    return 'Coaching charges must be less than pass charges';
  }
  if (parseMaxSwimmers(body.maxSwimmersPerCoach) === 'invalid') {
    return 'Max swimmers must be a positive number or No Limit';
  }
  if (body.isOffer) {
    const start = String(body.offerStartDate ?? '').trim();
    const end = String(body.offerEndDate ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return 'Offer start date is required';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return 'Offer end date is required';
    if (end < start) return 'Offer end date must be on or after the start date';
  }
  return null;
}

function writeErrorMessage(err: unknown, fallback: string) {
  const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: string }).code) : '';
  if (code === '23505') return 'A pass type with this name already exists';
  if (code === '42703') return 'Could not save this pass type. Please try again.';
  if (code === '23502' || code === '23514') return 'Could not save this pass type. Please check the values and try again.';
  if (code === '23503') return 'Could not save this pass type (account not found).';
  return fallback;
}

async function passNameTaken(accountId: number, passName: string, exceptId?: number) {
  const { rows } = await pool.query(
    `SELECT id
       FROM pass_types
      WHERE saas_account_id = $1
        AND LOWER(TRIM(pass_name)) = LOWER(TRIM($2))
        AND ($3::int IS NULL OR id <> $3)
      LIMIT 1`,
    [accountId, passName, exceptId ?? null],
  );
  return Boolean(rows[0]);
}

export const passTypesRouter = Router();

passTypesRouter.get('/payment-calculation', async (req, res) => {
  try {
    const accountId = tenantId(req);
    await pool.query(
      `INSERT INTO pool_core_info (saas_account_id)
       SELECT $1 WHERE NOT EXISTS (
         SELECT 1 FROM pool_core_info WHERE saas_account_id = $1
       )`,
      [accountId],
    );
    const { rows } = await pool.query(
      `SELECT COALESCE(coach_payment_basis, 'month') AS basis
       FROM pool_core_info
       WHERE saas_account_id = $1`,
      [accountId],
    );
    res.json({ basis: parseCoachPaymentBasis(rows[0]?.basis) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load payment calculation' });
  }
});

passTypesRouter.put('/payment-calculation', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const basis = parseCoachPaymentBasis((req.body as { basis?: string })?.basis);
    await pool.query(
      `INSERT INTO pool_core_info (saas_account_id)
       SELECT $1 WHERE NOT EXISTS (
         SELECT 1 FROM pool_core_info WHERE saas_account_id = $1
       )`,
      [accountId],
    );
    const previous = await pool.query(
      `SELECT COALESCE(coach_payment_basis, 'month') AS basis
       FROM pool_core_info
       WHERE saas_account_id = $1`,
      [accountId],
    );
    await pool.query(
      `UPDATE pool_core_info
       SET coach_payment_basis = $2, updated_at = NOW()
       WHERE saas_account_id = $1`,
      [accountId, basis],
    );
    await recordAudit(req, {
      action: 'update',
      entityType: 'coach_payment_calculation',
      entityId: 'coach_payment_calculation',
      entityLabel: 'Coach payment calculation',
      summary: `Set coach payment calculation to ${basis} basis`,
      details: {
        basis,
        previous: parseCoachPaymentBasis(previous.rows[0]?.basis),
      },
    });
    res.json({ basis });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save payment calculation' });
  }
});

passTypesRouter.get('/verification', async (req, res) => {
  try {
    const accountId = tenantId(req);
    await pool.query(
      `INSERT INTO pool_core_info (saas_account_id)
       SELECT $1 WHERE NOT EXISTS (
         SELECT 1 FROM pool_core_info WHERE saas_account_id = $1
       )`,
      [accountId],
    );
    const { rows } = await pool.query(
      `SELECT COALESCE(pass_verification_mode, 'ok_not_ok') AS verification_mode,
              COALESCE(pass_verification_configured, FALSE) AS configured
       FROM pool_core_info
       WHERE saas_account_id = $1`,
      [accountId],
    );
    res.json({
      verificationMode: parseVerificationMode(rows[0]?.verification_mode),
      configured: Boolean(rows[0]?.configured),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load pass verification' });
  }
});

passTypesRouter.put('/verification', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const verificationMode = parseVerificationMode(
      (req.body as { verificationMode?: string })?.verificationMode,
    );
    await pool.query(
      `INSERT INTO pool_core_info (saas_account_id)
       SELECT $1 WHERE NOT EXISTS (
         SELECT 1 FROM pool_core_info WHERE saas_account_id = $1
       )`,
      [accountId],
    );
    const previous = await pool.query(
      `SELECT COALESCE(pass_verification_mode, 'ok_not_ok') AS verification_mode
       FROM pool_core_info
       WHERE saas_account_id = $1`,
      [accountId],
    );
    await pool.query(
      `UPDATE pool_core_info
          SET pass_verification_mode = $2,
              pass_verification_configured = TRUE,
              updated_at = NOW()
        WHERE saas_account_id = $1`,
      [accountId, verificationMode],
    );
    await recordAudit(req, {
      action: 'update',
      entityType: 'pass_verification',
      entityId: 'pass_verification',
      entityLabel: 'Pass verification',
      summary:
        verificationMode === 'face'
          ? 'Set pass verification to face verification required'
          : 'Set pass verification to OK / Not OK enough',
      details: {
        verificationMode,
        previous: parseVerificationMode(previous.rows[0]?.verification_mode),
      },
    });
    res.json({ verificationMode, configured: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save pass verification' });
  }
});

passTypesRouter.get('/', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const { rows } = await pool.query(
      `SELECT id, pass_name, for_audience, prerequisite, duration, pass_charges, coaching_charges, coach,
              test_required, max_swimmers_per_coach, exceeding_limit_allowed, is_offer, offer_start_date,
              offer_end_date, verification_mode
       FROM pass_types
       WHERE saas_account_id = $1
       ORDER BY id ASC`,
      [accountId],
    );
    res.json(rows.map(mapRow));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: writeErrorMessage(err, 'Failed to load pass types') });
  }
});

passTypesRouter.post('/', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const body = req.body as PassBody;
    const error = validate(body);
    if (error) {
      res.status(400).json({ error });
      return;
    }

    const passName = body.passName!.trim();
    if (await passNameTaken(accountId, passName)) {
      res.status(400).json({ error: 'A pass type with this name already exists' });
      return;
    }

    const coach = body.coach?.trim() || 'Not Required';
    const maxSwimmers = parseMaxSwimmers(body.maxSwimmersPerCoach);
    const exceedingAllowed = body.exceedingLimitAllowed !== false;
    const isOffer = Boolean(body.isOffer);
    const verificationMode = parseVerificationMode(body.verificationMode);
    const { rows } = await pool.query(
      `INSERT INTO pass_types
       (saas_account_id, pass_name, for_audience, prerequisite, duration, pass_charges, coaching_charges, coach,
        test_required, max_swimmers_per_coach, exceeding_limit_allowed, is_offer, offer_start_date, offer_end_date,
        verification_mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id, pass_name, for_audience, prerequisite, duration, pass_charges, coaching_charges, coach,
                 test_required, max_swimmers_per_coach, exceeding_limit_allowed, is_offer, offer_start_date,
                 offer_end_date, verification_mode`,
      [
        accountId,
        passName,
        body.forAudience!.trim(),
        body.prerequisite?.trim() || 'None',
        body.duration!.trim(),
        Number(body.passCharges),
        coachIsRequired(coach) ? Number(body.coachingCharges || 0) : 0,
        coach,
        !coachIsRequired(coach) && Boolean(body.testRequired),
        maxSwimmers === 'invalid' ? null : maxSwimmers,
        exceedingAllowed,
        isOffer,
        isOffer ? body.offerStartDate : null,
        isOffer ? body.offerEndDate : null,
        verificationMode,
      ],
    );
    const created = mapRow(rows[0]);
    await recordAudit(req, {
      action: 'create',
      entityType: 'pass_type',
      entityId: created.id,
      entityLabel: created.passName,
      summary: 'Created pass type',
      details: created,
    });
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: writeErrorMessage(err, 'Failed to create pass type') });
  }
});

passTypesRouter.put('/:id', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const id = Number(req.params.id);
    const body = req.body as PassBody;
    const error = validate(body);
    if (error) {
      res.status(400).json({ error });
      return;
    }

    const passName = body.passName!.trim();
    if (await passNameTaken(accountId, passName, id)) {
      res.status(400).json({ error: 'A pass type with this name already exists' });
      return;
    }

    const coach = body.coach?.trim() || 'Not Required';
    const maxSwimmers = parseMaxSwimmers(body.maxSwimmersPerCoach);
    const exceedingAllowed = body.exceedingLimitAllowed !== false;
    const isOffer = Boolean(body.isOffer);
    const verificationMode = parseVerificationMode(body.verificationMode);
    const { rows } = await pool.query(
      `UPDATE pass_types
       SET pass_name = $1,
           for_audience = $2,
           prerequisite = $3,
           duration = $4,
           pass_charges = $5,
           coaching_charges = $6,
           coach = $7,
           test_required = $8,
           max_swimmers_per_coach = $9,
           exceeding_limit_allowed = $10,
           is_offer = $11,
           offer_start_date = $12,
           offer_end_date = $13,
           verification_mode = $14,
           updated_at = NOW()
       WHERE id = $15 AND saas_account_id = $16
       RETURNING id, pass_name, for_audience, prerequisite, duration, pass_charges, coaching_charges, coach,
                 test_required, max_swimmers_per_coach, exceeding_limit_allowed, is_offer, offer_start_date,
                 offer_end_date, verification_mode`,
      [
        passName,
        body.forAudience!.trim(),
        body.prerequisite?.trim() || 'None',
        body.duration!.trim(),
        Number(body.passCharges),
        coachIsRequired(coach) ? Number(body.coachingCharges || 0) : 0,
        coach,
        !coachIsRequired(coach) && Boolean(body.testRequired),
        maxSwimmers === 'invalid' ? null : maxSwimmers,
        exceedingAllowed,
        isOffer,
        isOffer ? body.offerStartDate : null,
        isOffer ? body.offerEndDate : null,
        verificationMode,
        id,
        accountId,
      ],
    );

    if (!rows[0]) {
      res.status(404).json({ error: 'Pass type not found' });
      return;
    }
    const updated = mapRow(rows[0]);
    await recordAudit(req, {
      action: 'update',
      entityType: 'pass_type',
      entityId: updated.id,
      entityLabel: updated.passName,
      summary: 'Updated pass type',
      details: updated,
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: writeErrorMessage(err, 'Failed to update pass type') });
  }
});

passTypesRouter.delete('/:id', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const id = Number(req.params.id);
    const existing = await pool.query(
      `SELECT id, pass_name, for_audience, prerequisite, duration, pass_charges, coaching_charges, coach,
              max_swimmers_per_coach, exceeding_limit_allowed, verification_mode
       FROM pass_types WHERE id = $1 AND saas_account_id = $2`,
      [id, accountId],
    );
    if (!existing.rows[0]) {
      res.status(404).json({ error: 'Pass type not found' });
      return;
    }
    await pool.query(`DELETE FROM pass_types WHERE id = $1 AND saas_account_id = $2`, [
      id,
      accountId,
    ]);
    const deleted = mapRow(existing.rows[0]);
    await recordAudit(req, {
      action: 'delete',
      entityType: 'pass_type',
      entityId: deleted.id,
      entityLabel: deleted.passName,
      summary: 'Deleted pass type',
      details: deleted,
    });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete pass type' });
  }
});
