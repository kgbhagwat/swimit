import { Router } from 'express';
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
};

function mapRow(row: {
  id: number;
  pass_name: string;
  for_audience: string;
  prerequisite: string;
  duration: string;
  pass_charges: string | number;
  coaching_charges: string | number;
  coach: string | null;
}) {
  return {
    id: row.id,
    passName: row.pass_name,
    forAudience: row.for_audience,
    prerequisite: row.prerequisite,
    duration: row.duration,
    passCharges: Number(row.pass_charges),
    coachingCharges: Number(row.coaching_charges),
    coach: row.coach ?? '',
  };
}

function validate(body: PassBody) {
  if (!body.passName?.trim()) return 'Pass name is required';
  if (!body.forAudience?.trim()) return 'For is required';
  if (!body.duration?.trim()) return 'Duration is required';
  if (body.passCharges === undefined || Number.isNaN(Number(body.passCharges))) {
    return 'Pass charges are required';
  }
  return null;
}

export const passTypesRouter = Router();

passTypesRouter.get('/', async (req, res) => {
  const accountId = tenantId(req);
  const { rows } = await pool.query(
    `SELECT id, pass_name, for_audience, prerequisite, duration, pass_charges, coaching_charges, coach
     FROM pass_types
     WHERE saas_account_id = $1
     ORDER BY id ASC`,
    [accountId],
  );
  res.json(rows.map(mapRow));
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

    const { rows } = await pool.query(
      `INSERT INTO pass_types
       (saas_account_id, pass_name, for_audience, prerequisite, duration, pass_charges, coaching_charges, coach)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, pass_name, for_audience, prerequisite, duration, pass_charges, coaching_charges, coach`,
      [
        accountId,
        body.passName!.trim(),
        body.forAudience!.trim(),
        body.prerequisite?.trim() || 'None',
        body.duration!.trim(),
        Number(body.passCharges),
        Number(body.coachingCharges || 0),
        body.coach?.trim() || null,
      ],
    );
    res.status(201).json(mapRow(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create pass type' });
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

    const { rows } = await pool.query(
      `UPDATE pass_types
       SET pass_name = $1,
           for_audience = $2,
           prerequisite = $3,
           duration = $4,
           pass_charges = $5,
           coaching_charges = $6,
           coach = $7,
           updated_at = NOW()
       WHERE id = $8 AND saas_account_id = $9
       RETURNING id, pass_name, for_audience, prerequisite, duration, pass_charges, coaching_charges, coach`,
      [
        body.passName!.trim(),
        body.forAudience!.trim(),
        body.prerequisite?.trim() || 'None',
        body.duration!.trim(),
        Number(body.passCharges),
        Number(body.coachingCharges || 0),
        body.coach?.trim() || null,
        id,
        accountId,
      ],
    );

    if (!rows[0]) {
      res.status(404).json({ error: 'Pass type not found' });
      return;
    }
    res.json(mapRow(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update pass type' });
  }
});

passTypesRouter.delete('/:id', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const id = Number(req.params.id);
    const result = await pool.query(
      `DELETE FROM pass_types WHERE id = $1 AND saas_account_id = $2`,
      [id, accountId],
    );
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Pass type not found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete pass type' });
  }
});
