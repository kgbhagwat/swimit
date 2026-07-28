import { Router } from 'express';
import { pool } from '../db/pool.js';
import { tenantId } from '../middleware/tenant.js';

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function formatDateValue(value: unknown) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

type LedgerEntry = {
  id: string;
  entryDate: string;
  particulars: string;
  credit: number;
  debit: number;
  type: 'credit' | 'debit';
  source: 'pass' | 'expense' | 'coach';
};

export const balanceSheetRouter = Router();

balanceSheetRouter.get('/', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const month = String(req.query.month ?? '').trim();
    if (!/^\d{4}-\d{2}$/.test(month)) {
      res.status(400).json({ error: 'month must be YYYY-MM' });
      return;
    }

    const [year, monthNum] = month.split('-').map(Number);
    const monthIndex = monthNum - 1;
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-${String(daysInMonth(year, monthIndex)).padStart(2, '0')}`;
    const entries: LedgerEntry[] = [];

    const payments = await pool.query(
      `SELECT id, swimmer_name, pass_type, amount, payment_date
       FROM pass_payments
       WHERE saas_account_id = $1
         AND payment_date >= $2::date AND payment_date <= $3::date
       ORDER BY payment_date ASC, id ASC`,
      [accountId, monthStart, monthEnd],
    );
    for (const row of payments.rows) {
      entries.push({
        id: `pass-${row.id}`,
        entryDate: formatDateValue(row.payment_date),
        particulars: `Pass payment — ${row.swimmer_name} (${row.pass_type})`,
        credit: roundMoney(Number(row.amount)),
        debit: 0,
        type: 'credit',
        source: 'pass',
      });
    }

    const expenses = await pool.query(
      `SELECT id, expense_date, description, amount, mode
       FROM pool_expenses
       WHERE saas_account_id = $1
         AND expense_date >= $2::date AND expense_date <= $3::date
       ORDER BY expense_date ASC, id ASC`,
      [accountId, monthStart, monthEnd],
    );
    for (const row of expenses.rows) {
      entries.push({
        id: `expense-${row.id}`,
        entryDate: formatDateValue(row.expense_date),
        particulars: `${row.description}${row.mode ? ` (${row.mode})` : ''}`,
        credit: 0,
        debit: roundMoney(Number(row.amount)),
        type: 'debit',
        source: 'expense',
      });
    }

    // Coach payouts for the month (month-basis), as calculated debits
    const coaches = await pool.query(
      `SELECT full_name
       FROM staff_registrations
       WHERE saas_account_id = $1
         AND registration_for = 'Coach'
         AND COALESCE(is_active, TRUE) = TRUE
       ORDER BY full_name ASC`,
      [accountId],
    );
    const swimmers = await pool.query(
      `SELECT r.id, r.coach, pt.coaching_charges
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
    const coachTotals = new Map<string, number>();
    for (const coach of coaches.rows) {
      coachTotals.set(String(coach.full_name).trim().toLowerCase(), 0);
    }
    for (const row of swimmers.rows) {
      const key = String(row.coach ?? '')
        .trim()
        .toLowerCase();
      if (!coachTotals.has(key)) continue;
      const amount = roundMoney(Number(row.coaching_charges ?? 0));
      coachTotals.set(key, roundMoney((coachTotals.get(key) ?? 0) + amount));
    }
    for (const coach of coaches.rows) {
      const key = String(coach.full_name).trim().toLowerCase();
      const total = coachTotals.get(key) ?? 0;
      if (total <= 0) continue;
      entries.push({
        id: `coach-${key}`,
        entryDate: monthEnd,
        particulars: `Coach payment — ${coach.full_name}`,
        credit: 0,
        debit: total,
        type: 'debit',
        source: 'coach',
      });
    }

    entries.sort((a, b) => {
      const byDate = a.entryDate.localeCompare(b.entryDate);
      if (byDate !== 0) return byDate;
      return a.id.localeCompare(b.id);
    });

    let running = 0;
    const items = entries.map((entry) => {
      running = roundMoney(running + entry.credit - entry.debit);
      return { ...entry, balance: running };
    });

    const totalCredit = roundMoney(items.reduce((sum, item) => sum + item.credit, 0));
    const totalDebit = roundMoney(items.reduce((sum, item) => sum + item.debit, 0));
    const closingBalance = roundMoney(totalCredit - totalDebit);

    res.json({
      month,
      monthStart,
      monthEnd,
      items,
      totalCredit,
      totalDebit,
      closingBalance,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load balance sheet' });
  }
});
