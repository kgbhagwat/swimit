import { Router } from 'express';
import { pool } from '../db/pool.js';
import { tenantId } from '../middleware/tenant.js';

type ExpenseBody = {
  expenseDate?: string;
  description?: string;
  amount?: number | string;
  mode?: string;
  hasBill?: string | boolean;
};

const MODES = ['Cash', 'UPI', 'Card', 'Bank transfer'] as const;

function formatDateValue(value: unknown) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function mapRow(row: {
  id: number;
  expense_date: unknown;
  description: string;
  amount: string | number;
  mode: string;
  has_bill: boolean;
}) {
  return {
    id: row.id,
    expenseDate: formatDateValue(row.expense_date),
    description: row.description,
    amount: Number(row.amount),
    mode: row.mode,
    hasBill: Boolean(row.has_bill),
  };
}

function validate(body: ExpenseBody) {
  if (!body.expenseDate?.trim()) return 'Date is required';
  if (!body.description?.trim()) return 'Expense description is required';
  const amount = Number(body.amount);
  if (Number.isNaN(amount) || amount < 0) return 'Amount is required';
  if (!body.mode?.trim() || !(MODES as readonly string[]).includes(body.mode)) {
    return 'Valid payment mode is required';
  }
  return null;
}

function parseHasBill(value: string | boolean | undefined) {
  if (typeof value === 'boolean') return value;
  if (value === undefined) return false;
  return value === 'true' || value === 'Bill';
}

export const poolExpensesRouter = Router();

poolExpensesRouter.get('/', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const month = String(req.query.month ?? '').trim(); // YYYY-MM
    const params: unknown[] = [accountId];
    let where = 'WHERE saas_account_id = $1';
    if (/^\d{4}-\d{2}$/.test(month)) {
      params.push(`${month}-01`);
      where += ` AND date_trunc('month', expense_date) = date_trunc('month', $2::date)`;
    }
    const { rows } = await pool.query(
      `SELECT id, expense_date, description, amount, mode, has_bill
       FROM pool_expenses
       ${where}
       ORDER BY expense_date DESC, id DESC`,
      params,
    );
    res.json(rows.map(mapRow));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load expenses' });
  }
});

poolExpensesRouter.post('/', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const body = req.body as ExpenseBody;
    const error = validate(body);
    if (error) {
      res.status(400).json({ error });
      return;
    }
    const { rows } = await pool.query(
      `INSERT INTO pool_expenses (saas_account_id, expense_date, description, amount, mode, has_bill)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, expense_date, description, amount, mode, has_bill`,
      [
        accountId,
        body.expenseDate!.trim(),
        body.description!.trim(),
        Number(body.amount),
        body.mode!.trim(),
        parseHasBill(body.hasBill),
      ],
    );
    res.status(201).json(mapRow(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save expense' });
  }
});

poolExpensesRouter.put('/:id', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const id = Number(req.params.id);
    const body = req.body as ExpenseBody;
    const error = validate(body);
    if (error) {
      res.status(400).json({ error });
      return;
    }
    const { rows } = await pool.query(
      `UPDATE pool_expenses
       SET expense_date = $1,
           description = $2,
           amount = $3,
           mode = $4,
           has_bill = $5,
           updated_at = NOW()
       WHERE id = $6 AND saas_account_id = $7
       RETURNING id, expense_date, description, amount, mode, has_bill`,
      [
        body.expenseDate!.trim(),
        body.description!.trim(),
        Number(body.amount),
        body.mode!.trim(),
        parseHasBill(body.hasBill),
        id,
        accountId,
      ],
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'Expense not found' });
      return;
    }
    res.json(mapRow(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update expense' });
  }
});

poolExpensesRouter.delete('/:id', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const id = Number(req.params.id);
    const result = await pool.query(
      `DELETE FROM pool_expenses WHERE id = $1 AND saas_account_id = $2`,
      [id, accountId],
    );
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Expense not found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});
