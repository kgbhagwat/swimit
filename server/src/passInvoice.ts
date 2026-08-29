import type { PoolClient } from 'pg';
import { pool } from './db/pool.js';
import { INDIA_SQL_TODAY } from './indiaDate.js';

export const DEFAULT_PASS_GST_PERCENT = 18;

export function passGstPercent() {
  const n = Number(
    process.env.SWIMIT_PASS_GST_PERCENT ?? process.env.SWIMIT_GST_PERCENT ?? DEFAULT_PASS_GST_PERCENT,
  );
  if (!Number.isFinite(n) || n < 0) return DEFAULT_PASS_GST_PERCENT;
  return Math.min(40, n);
}

export function money(n: number) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function parsePassDiscount(raw: unknown, listAmount: number): { discount: number } | { error: string } {
  if (raw == null || String(raw).trim() === '') return { discount: 0 };
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return { error: 'Enter a valid discount' };
  const discount = money(n);
  if (discount > money(listAmount) + 0.001) {
    return { error: 'Discount cannot be greater than the pass amount' };
  }
  return { discount };
}

/**
 * Payable = pass charges − discount.
 * Coaching charges are a portion of pass charges (for coach payout), not an add-on.
 */
export function passPayable(passCharges: number, _coachingCharges: number, discountRaw: unknown) {
  const listAmount = money(Number(passCharges));
  const parsed = parsePassDiscount(discountRaw, listAmount);
  if ('error' in parsed) return parsed;
  return {
    listAmount,
    discountAmount: parsed.discount,
    payableAmount: money(listAmount - parsed.discount),
  };
}

export function parseReceivedAmount(raw: unknown, dueAmount: number): { received: number } | { error: string } {
  if (raw === undefined || raw === null) return { received: money(dueAmount) };
  const trimmed = String(raw).trim();
  if (trimmed === '') return { received: 0 };
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return { error: 'Enter a valid received amount' };
  const received = money(n);
  if (received > money(dueAmount) + 0.001) {
    return { error: 'Received amount cannot be greater than the payable amount' };
  }
  return { received };
}

/** Paid amount already includes tax; reverse out GST. */
export function splitInclusiveTax(total: number, percent = passGstPercent()) {
  const amount = money(Math.max(0, Number(total) || 0));
  const gstPercent = Number.isFinite(percent) && percent > 0 ? percent : 0;
  if (gstPercent <= 0 || amount <= 0) {
    return {
      amount,
      gstPercent,
      taxableAmount: amount,
      gstAmount: 0,
      taxInclusive: true as const,
    };
  }
  const taxableAmount = money(amount / (1 + gstPercent / 100));
  const gstAmount = money(amount - taxableAmount);
  return {
    amount,
    gstPercent,
    taxableAmount,
    gstAmount,
    taxInclusive: true as const,
  };
}

export function invoiceNumberForPayment(paymentId: number, paymentDate: string) {
  const year = (paymentDate || '').slice(0, 4) || String(new Date().getFullYear());
  return `INV-${year}-${String(paymentId).padStart(6, '0')}`;
}

export function formatPaymentDate(value: unknown) {
  if (!value) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return value.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  }
  return String(value).slice(0, 10);
}

function num(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function poolLogoUrl(path: unknown) {
  const p = String(path ?? '').trim();
  if (!p) return null;
  if (p.startsWith('/') || p.startsWith('http')) return p;
  return `/uploads/${p}`;
}

export type PassInvoiceDto = {
  id: number;
  invoiceNumber: string;
  paymentDate: string;
  swimmerName: string;
  swimmerContact: string;
  swimmerEmail: string;
  swimmerAddress: string;
  passType: string;
  passDuration: string;
  passCharges: number;
  coachingCharges: number;
  taxableAmount: number;
  gstPercent: number;
  gstAmount: number;
  amount: number;
  taxInclusive: boolean;
  paymentMode: string;
  transactionId: string;
  poolName: string;
  poolAddress: string;
  poolLogoUrl: string | null;
  poolLogoPath: string | null;
};

export function formatInvoiceInr(value: number) {
  return `₹${money(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function mapPassInvoice(row: Record<string, unknown>): PassInvoiceDto {
  const id = num(row.id);
  const paymentDate = formatPaymentDate(row.payment_date);
  const amount = money(num(row.amount));
  const gstPercent = num(row.gst_percent) || passGstPercent();
  let taxableAmount = money(num(row.taxable_amount));
  let gstAmount = money(num(row.gst_amount));
  if (amount > 0 && taxableAmount <= 0 && gstAmount <= 0) {
    const split = splitInclusiveTax(amount, gstPercent);
    taxableAmount = split.taxableAmount;
    gstAmount = split.gstAmount;
  }
  return {
    id,
    invoiceNumber:
      String(row.invoice_number ?? '').trim() || invoiceNumberForPayment(id, paymentDate),
    paymentDate,
    swimmerName: String(row.swimmer_name || row.full_name || '').trim(),
    swimmerContact: String(row.whatsapp_mobile ?? '').trim(),
    swimmerEmail: String(row.email ?? '').trim(),
    swimmerAddress: String(row.full_address ?? '').trim(),
    passType: String(row.pass_type ?? '').trim(),
    passDuration: String(row.pass_duration ?? '').trim(),
    passCharges: money(num(row.pass_charges)),
    coachingCharges: money(num(row.coaching_charges)),
    taxableAmount,
    gstPercent,
    gstAmount,
    amount,
    taxInclusive: row.tax_inclusive !== false,
    paymentMode: String(row.payment_mode ?? '').trim(),
    transactionId: String(row.transaction_id ?? '').trim(),
    poolName: String(row.pool_name ?? '').trim(),
    poolAddress: String(row.pool_address ?? '').trim(),
    poolLogoUrl: poolLogoUrl(row.pool_logo_path),
    poolLogoPath: String(row.pool_logo_path ?? '').trim() || null,
  };
}

const LATEST_INVOICE_SQL = `SELECT p.id, p.invoice_number, p.payment_date, p.pass_type, p.swimmer_name,
        p.pass_charges, p.coaching_charges, p.amount, p.tax_inclusive,
        p.gst_percent, p.gst_amount, p.taxable_amount,
        p.payment_mode, p.transaction_id,
        r.full_name, r.whatsapp_mobile, r.email, r.full_address,
        pt.duration AS pass_duration,
        pci.pool_name, pci.pool_address, pci.pool_logo_path
 FROM pass_payments p
 JOIN registrations r
   ON r.id = p.registration_id AND r.saas_account_id = p.saas_account_id
 LEFT JOIN pass_types pt
   ON LOWER(TRIM(pt.pass_name)) = LOWER(TRIM(COALESCE(p.pass_type, '')))
  AND pt.saas_account_id = p.saas_account_id
 LEFT JOIN pool_core_info pci ON pci.saas_account_id = p.saas_account_id
 WHERE p.registration_id = $1 AND p.saas_account_id = $2
 ORDER BY p.payment_date DESC, p.id DESC
 LIMIT 1`;

export async function loadLatestPassInvoice(accountId: number, registrationId: number) {
  const { rows } = await pool.query(LATEST_INVOICE_SQL, [registrationId, accountId]);
  if (!rows[0]) return null;
  return mapPassInvoice(rows[0] as Record<string, unknown>);
}

export async function resolvePassPaymentScreenshotPath(
  db: { query: PoolClient['query'] },
  params: { accountId: number; registrationId: number; transactionId?: string | null },
): Promise<string | null> {
  const txn = String(params.transactionId ?? '').trim();
  if (txn) {
    const byTxn = await db.query<{ file_path: string | null }>(
      `SELECT file_path
         FROM whatsapp_inbound
        WHERE saas_account_id = $1
          AND NULLIF(TRIM(file_path), '') IS NOT NULL
          AND LOWER(TRIM(ocr_transaction_id)) = LOWER(TRIM($2))
        ORDER BY created_at DESC
        LIMIT 1`,
      [params.accountId, txn],
    );
    const path = String(byTxn.rows[0]?.file_path ?? '').trim();
    if (path) return path;
  }
  const byIntent = await db.query<{ file_path: string | null }>(
    `SELECT w.file_path
       FROM pass_payment_intents i
       JOIN whatsapp_inbound w ON w.id = i.inbound_id
      WHERE i.saas_account_id = $1
        AND i.registration_id = $2
        AND NULLIF(TRIM(w.file_path), '') IS NOT NULL
        AND (
          $3 = ''
          OR LOWER(TRIM(COALESCE(i.transaction_id, ''))) = LOWER(TRIM($3))
        )
      ORDER BY i.verified_at DESC NULLS LAST, i.id DESC
      LIMIT 1`,
    [params.accountId, params.registrationId, txn],
  );
  const intentPath = String(byIntent.rows[0]?.file_path ?? '').trim();
  return intentPath || null;
}

export async function insertPassPayment(params: {
  accountId: number;
  registrationId: number;
  swimmerName: string;
  passType: string;
  passCharges: number;
  coachingCharges: number;
  amount: number;
  discountAmount?: number;
  remark?: string;
  paymentMode: string;
  transactionId: string | null;
  upgradeSourcePaymentId: number | null;
  paymentDate?: string | null;
  screenshotPath?: string | null;
  client?: PoolClient;
}) {
  const db = params.client ?? pool;
  const tax = splitInclusiveTax(params.amount);
  const discountAmount = money(Math.max(0, Number(params.discountAmount ?? 0) || 0));
  const remark = String(params.remark ?? '').trim();
  const paymentDate =
    params.paymentDate && /^\d{4}-\d{2}-\d{2}$/.test(params.paymentDate)
      ? params.paymentDate
      : null;
  const online = /^(online|upi)$/i.test(String(params.paymentMode ?? '').trim());
  let screenshotPath = String(params.screenshotPath ?? '').trim() || null;
  if (online && !screenshotPath) {
    screenshotPath = await resolvePassPaymentScreenshotPath(db, {
      accountId: params.accountId,
      registrationId: params.registrationId,
      transactionId: params.transactionId,
    });
  }
  const { rows } = await db.query(
    `INSERT INTO pass_payments
     (saas_account_id, registration_id, swimmer_name, pass_type, pass_charges, coaching_charges,
      amount, discount_amount, payment_date, payment_mode, transaction_id, upgrade_source_payment_id,
      tax_inclusive, gst_percent, gst_amount, taxable_amount, screenshot_path, remark)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::date, ${INDIA_SQL_TODAY}), $10, $11, $12, TRUE, $13, $14, $15, $16, $17)
     RETURNING id, payment_date`,
    [
      params.accountId,
      params.registrationId,
      params.swimmerName,
      params.passType,
      params.passCharges,
      params.coachingCharges,
      tax.amount,
      discountAmount,
      paymentDate,
      params.paymentMode,
      params.transactionId,
      params.upgradeSourcePaymentId,
      tax.gstPercent,
      tax.gstAmount,
      tax.taxableAmount,
      screenshotPath,
      remark,
    ],
  );
  const id = Number(rows[0].id);
  const storedPaymentDate = formatPaymentDate(rows[0].payment_date);
  const invoiceNumber = invoiceNumberForPayment(id, storedPaymentDate);
  await db.query(
    `UPDATE pass_payments
     SET invoice_number = $1
     WHERE id = $2 AND saas_account_id = $3`,
    [invoiceNumber, id, params.accountId],
  );
  return { id, invoiceNumber, paymentDate: storedPaymentDate };
}
