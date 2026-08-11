import { Router } from 'express';
import { recordAudit } from '../auditLog.js';
import { pool } from '../db/pool.js';
import { tenantId } from '../middleware/tenant.js';

type WaterQualityBody = {
  recordDate?: string;
  phLevel?: number | string;
  freeChlorine?: number | string;
  totalAlkalinity?: number | string;
  calciumHardness?: number | string;
  testerName?: string;
};

function formatDateValue(value: unknown) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function mapRow(row: {
  id: number;
  record_date: unknown;
  ph_level: string | number;
  free_chlorine: string | number;
  total_alkalinity: string | number;
  calcium_hardness: string | number;
  tester_name: string;
}) {
  return {
    id: row.id,
    recordDate: formatDateValue(row.record_date),
    phLevel: Number(row.ph_level),
    freeChlorine: Number(row.free_chlorine),
    totalAlkalinity: Number(row.total_alkalinity),
    calciumHardness: Number(row.calcium_hardness),
    testerName: String(row.tester_name ?? ''),
  };
}

function todayIsoLocal() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseNonNegative(value: number | string | undefined, label: string) {
  if (value === undefined || value === '') return `${label} is required`;
  const amount = Number(value);
  if (Number.isNaN(amount) || amount < 0) return `${label} must be a valid number`;
  return null;
}

function validate(body: WaterQualityBody) {
  if (!body.recordDate?.trim()) return 'Date is required';
  const recordDate = body.recordDate.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(recordDate)) return 'Enter a valid date';
  if (recordDate > todayIsoLocal()) return 'Date cannot be in the future';
  return (
    parseNonNegative(body.phLevel, 'pH Level') ||
    parseNonNegative(body.freeChlorine, 'Free Chlorine') ||
    parseNonNegative(body.totalAlkalinity, 'Total Alkalinity') ||
    parseNonNegative(body.calciumHardness, 'Calcium Hardness') ||
    (!body.testerName?.trim() ? 'Tester name is required' : null)
  );
}

export const waterQualityRouter = Router();

waterQualityRouter.get('/', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const month = String(req.query.month ?? '').trim();
    const params: unknown[] = [accountId];
    let where = 'WHERE saas_account_id = $1';
    if (/^\d{4}-\d{2}$/.test(month)) {
      params.push(`${month}-01`);
      where += ` AND date_trunc('month', record_date) = date_trunc('month', $2::date)`;
    }
    const { rows } = await pool.query(
      `SELECT id, record_date, ph_level, free_chlorine, total_alkalinity, calcium_hardness, tester_name
       FROM water_quality
       ${where}
       ORDER BY record_date DESC, id DESC`,
      params,
    );
    res.json(rows.map(mapRow));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load water quality records' });
  }
});

waterQualityRouter.post('/', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const body = req.body as WaterQualityBody;
    const error = validate(body);
    if (error) {
      res.status(400).json({ error });
      return;
    }
    const { rows } = await pool.query(
      `INSERT INTO water_quality
         (saas_account_id, record_date, ph_level, free_chlorine, total_alkalinity, calcium_hardness, tester_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, record_date, ph_level, free_chlorine, total_alkalinity, calcium_hardness, tester_name`,
      [
        accountId,
        body.recordDate!.trim().slice(0, 10),
        Number(body.phLevel),
        Number(body.freeChlorine),
        Number(body.totalAlkalinity),
        Number(body.calciumHardness),
        body.testerName!.trim(),
      ],
    );
    const created = mapRow(rows[0]);
    await recordAudit(req, {
      action: 'create',
      entityType: 'water_quality',
      entityId: created.id,
      entityLabel: created.recordDate,
      summary: 'Created water quality record',
      details: created,
    });
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save water quality record' });
  }
});

waterQualityRouter.put('/:id', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const id = Number(req.params.id);
    const body = req.body as WaterQualityBody;
    const error = validate(body);
    if (error) {
      res.status(400).json({ error });
      return;
    }
    const { rows } = await pool.query(
      `UPDATE water_quality
       SET record_date = $1,
           ph_level = $2,
           free_chlorine = $3,
           total_alkalinity = $4,
           calcium_hardness = $5,
           tester_name = $6,
           updated_at = NOW()
       WHERE id = $7 AND saas_account_id = $8
       RETURNING id, record_date, ph_level, free_chlorine, total_alkalinity, calcium_hardness, tester_name`,
      [
        body.recordDate!.trim().slice(0, 10),
        Number(body.phLevel),
        Number(body.freeChlorine),
        Number(body.totalAlkalinity),
        Number(body.calciumHardness),
        body.testerName!.trim(),
        id,
        accountId,
      ],
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    const updated = mapRow(rows[0]);
    await recordAudit(req, {
      action: 'update',
      entityType: 'water_quality',
      entityId: updated.id,
      entityLabel: updated.recordDate,
      summary: 'Updated water quality record',
      details: updated,
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update water quality record' });
  }
});

waterQualityRouter.delete('/:id', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const id = Number(req.params.id);
    const existing = await pool.query(
      `SELECT id, record_date, ph_level, free_chlorine, total_alkalinity, calcium_hardness, tester_name
       FROM water_quality WHERE id = $1 AND saas_account_id = $2`,
      [id, accountId],
    );
    if (!existing.rows[0]) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    await pool.query(`DELETE FROM water_quality WHERE id = $1 AND saas_account_id = $2`, [
      id,
      accountId,
    ]);
    const deleted = mapRow(existing.rows[0]);
    await recordAudit(req, {
      action: 'delete',
      entityType: 'water_quality',
      entityId: deleted.id,
      entityLabel: deleted.recordDate,
      summary: 'Deleted water quality record',
      details: deleted,
    });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete water quality record' });
  }
});
