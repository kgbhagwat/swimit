import { pool } from './db/pool.js';
import { getWhatsAppConfig } from './whatsapp/config.js';
import { notifySubscriptionExpiring } from './whatsapp/notify.js';

const REMINDER_KIND = 'saas_subscription_expiry_5d';

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let lastCheckedDate: string | null = null;

export function startSubscriptionExpiryReminders() {
  const cfg = getWhatsAppConfig();
  if (!cfg.enabled) {
    console.log('[subscription-reminders] WhatsApp not configured — skipping scheduled reminders');
    return;
  }

  if (intervalHandle) return;

  // Run immediately and then once every 24 hours.
  // We also track lastCheckedDate using Postgres CURRENT_DATE so restarts won't
  // re-query and re-notify for the same day.
  void runOncePerDay();
  intervalHandle = setInterval(() => {
    void runOncePerDay();
  }, 24 * 60 * 60 * 1000);
}

async function runOncePerDay() {
  const { rows } = await pool.query<{ today: string }>(`SELECT CURRENT_DATE::text AS "today"`);
  const today = rows[0]?.today ?? '';
  if (!today) return;
  if (lastCheckedDate === today) return;
  lastCheckedDate = today;

  await sendSubscriptionExpiryReminders();
}

async function sendSubscriptionExpiryReminders() {
  const { rows } = await pool.query<{
    saasAccountId: number;
    accountName: string;
    accountCode: string;
    subscriptionExpiresAt: string | null;
    adminMobile: string;
    adminName: string;
  }>(
    `
    SELECT
      a.id AS "saasAccountId",
      a.account_name AS "accountName",
      a.account_code AS "accountCode",
      a.subscription_expires_at::text AS "subscriptionExpiresAt",
      u.mobile AS "adminMobile",
      u.user_name AS "adminName"
    FROM saas_accounts a
    JOIN app_users u
      ON u.saas_account_id = a.id
     AND COALESCE(u.is_account_admin, FALSE) = TRUE
    WHERE a.status <> 'Suspended'
      AND a.subscription_expires_at IS NOT NULL
      AND a.subscription_expires_at = (CURRENT_DATE + INTERVAL '5 days')::date
    `,
  );

  if (!rows.length) return;

  for (const row of rows) {
    const subscriptionExpiresAt = row.subscriptionExpiresAt ?? '';
    if (!subscriptionExpiresAt) continue;

    const mobile = String(row.adminMobile ?? '').replace(/\D/g, '').slice(-10);
    if (mobile.length !== 10) continue;

    const alreadySent = await pool.query<{ exists: boolean }>(
      `
      SELECT EXISTS (
        SELECT 1
        FROM whatsapp_outbound
        WHERE saas_account_id = $1
          AND kind = $2
          AND to_mobile = $3
          AND created_at::date = CURRENT_DATE
        LIMIT 1
      ) AS "exists"
      `,
      [row.saasAccountId, REMINDER_KIND, mobile],
    );

    if (alreadySent.rows[0]?.exists) continue;

    const result = await notifySubscriptionExpiring({
      saasAccountId: row.saasAccountId,
      mobile,
      fullName: String(row.adminName ?? '').trim() || 'Pool Admin',
      accountName: String(row.accountName ?? '').trim() || 'SwimIT',
      accountCode: String(row.accountCode ?? '').trim(),
      subscriptionExpiresAt,
    });

    if (!result.ok) {
      console.warn('[subscription-reminders] send failed', {
        saasAccountId: row.saasAccountId,
        mobile,
        error: result.error,
      });
    }
  }
}

