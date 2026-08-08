import { pool } from './db/pool.js';
import { computeRenewalAmount } from './paymentAmount.js';

/** Default India GST on SaaS subscription. Override with SWIMIT_GST_PERCENT. */
export function gstPercent() {
  const n = Number(process.env.SWIMIT_GST_PERCENT ?? 18);
  if (!Number.isFinite(n) || n < 0) return 18;
  return Math.min(40, n);
}

export const BROADCAST_RATE_INR = 0.25;

export type RenewQuote = {
  packageId: number;
  packageName: string;
  billingPeriod: string;
  months: number;
  packageAmount: number;
  gstPercent: number;
  gstAmount: number;
  broadcastCount: number;
  broadcastAmount: number;
  broadcastMonthLabel: string;
  totalAmount: number;
};

function money(n: number) {
  return Math.round(Number(n) * 100) / 100;
}

function formatInr(n: number) {
  return `₹${money(n).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function formatInrAmount(n: number) {
  return formatInr(n);
}

/** Previous calendar month bounds (UTC date parts via Postgres). */
export async function previousMonthBroadcastStats(saasAccountId: number) {
  const { rows } = await pool.query<{
    count: number;
    month_label: string;
  }>(
    `SELECT
       COUNT(*)::int AS count,
       TO_CHAR(date_trunc('month', CURRENT_DATE) - INTERVAL '1 month', 'Mon YYYY') AS month_label
     FROM whatsapp_outbound
     WHERE saas_account_id = $1
       AND kind = 'broadcast'
       AND status = 'sent'
       AND created_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'
       AND created_at < date_trunc('month', CURRENT_DATE)`,
    [saasAccountId],
  );
  const count = Number(rows[0]?.count ?? 0);
  return {
    count,
    amount: money(count * BROADCAST_RATE_INR),
    monthLabel: String(rows[0]?.month_label ?? 'previous month'),
  };
}

export async function buildRenewQuote(params: {
  saasAccountId: number;
  packageId: number;
  months?: number;
}): Promise<RenewQuote | null> {
  const months = Math.max(1, Math.min(36, Math.floor(params.months ?? 1)));
  const { rows } = await pool.query<{
    id: number;
    package_name: string;
    price: string | number;
    discounted_rate: string | number | null;
    billing_period: string;
    is_active: boolean;
    trial_days: number;
  }>(
    `SELECT id, package_name, price, discounted_rate, billing_period, is_active, trial_days
     FROM service_packages WHERE id = $1`,
    [params.packageId],
  );
  const pkg = rows[0];
  if (!pkg || pkg.is_active === false) return null;
  const name = String(pkg.package_name ?? '').trim();
  if (name.toLowerCase() === 'trial' || Number(pkg.trial_days ?? 0) > 0) return null;

  const listPrice = Number(pkg.price);
  const discounted =
    pkg.discounted_rate != null && Number(pkg.discounted_rate) > 0
      ? Number(pkg.discounted_rate)
      : null;
  const packageAmount = computeRenewalAmount({
    price: discounted ?? listPrice,
    billingPeriod: String(pkg.billing_period ?? 'Month'),
    months,
  });
  const pct = gstPercent();
  const gstAmount = money((packageAmount * pct) / 100);
  const broadcast = await previousMonthBroadcastStats(params.saasAccountId);
  const totalAmount = money(packageAmount + gstAmount + broadcast.amount);

  return {
    packageId: Number(pkg.id),
    packageName: name,
    billingPeriod: String(pkg.billing_period ?? 'Month'),
    months,
    packageAmount,
    gstPercent: pct,
    gstAmount,
    broadcastCount: broadcast.count,
    broadcastAmount: broadcast.amount,
    broadcastMonthLabel: broadcast.monthLabel,
    totalAmount,
  };
}

export function formatRenewQuoteMessage(quote: RenewQuote) {
  return [
    `Renewal quote for ${quote.packageName} (${quote.months} month${quote.months === 1 ? '' : 's'}):`,
    '',
    `Package: ${formatInr(quote.packageAmount)}`,
    `GST (${quote.gstPercent}%): ${formatInr(quote.gstAmount)}`,
    `Broadcast messages (${quote.broadcastMonthLabel}): ${quote.broadcastCount} × ₹${BROADCAST_RATE_INR} = ${formatInr(quote.broadcastAmount)}`,
    '─────────────────',
    `Total payable: ${formatInr(quote.totalAmount)}`,
    '',
    'Reply:',
    '1. Confirm & pay',
    '2. Cancel',
  ].join('\n');
}

export async function listPaidPackages() {
  const { rows } = await pool.query<{
    id: number;
    package_name: string;
    price: string | number;
    discounted_rate: string | number | null;
    billing_period: string;
  }>(
    `SELECT id, package_name, price, discounted_rate, billing_period
     FROM service_packages
     WHERE COALESCE(is_active, TRUE) = TRUE
       AND LOWER(package_name) <> 'trial'
       AND COALESCE(trial_days, 0) = 0
     ORDER BY price ASC, id ASC`,
  );
  return rows.map((row) => {
    const listPrice = Number(row.price);
    const discounted =
      row.discounted_rate != null && Number(row.discounted_rate) > 0
        ? Number(row.discounted_rate)
        : null;
    return {
      id: Number(row.id),
      packageName: String(row.package_name ?? ''),
      price: discounted ?? listPrice,
      listPrice,
      discountedRate: discounted,
      billingPeriod: String(row.billing_period ?? 'Month'),
    };
  });
}
