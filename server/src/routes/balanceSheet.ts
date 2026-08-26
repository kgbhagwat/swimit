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
  paymentMode: string;
  credit: number;
  debit: number;
  type: 'credit' | 'debit';
  source: 'pass' | 'expense';
};

function ledgerPaymentMode(raw: unknown) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return '';
  return value === 'cash' ? 'Cash' : 'Online';
}

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
      `SELECT id, swimmer_name, pass_type, amount, payment_date, payment_mode
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
        paymentMode: ledgerPaymentMode(row.payment_mode),
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
        particulars: String(row.description ?? '').trim() || 'Expense',
        paymentMode: ledgerPaymentMode(row.mode),
        credit: 0,
        debit: roundMoney(Number(row.amount)),
        type: 'debit',
        source: 'expense',
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
