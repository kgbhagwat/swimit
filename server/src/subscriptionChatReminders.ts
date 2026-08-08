import { pool } from './db/pool.js';
import {
  ensureRenewSessionTable,
  sendPackageExpiryChatReminder,
} from './supportChatRenew.js';

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let lastCheckedDate: string | null = null;

/** Daily job: 7 days before package expiry, message account admin on support chat. */
export function startSubscriptionChatExpiryReminders() {
  if (intervalHandle) return;
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
  await sendSevenDayChatReminders();
}

async function sendSevenDayChatReminders() {
  await ensureRenewSessionTable();
  const { rows } = await pool.query<{
    saasAccountId: number;
    accountName: string;
    subscriptionExpiresAt: string;
  }>(
    `SELECT
       a.id AS "saasAccountId",
       a.account_name AS "accountName",
       a.subscription_expires_at::text AS "subscriptionExpiresAt"
     FROM saas_accounts a
     WHERE a.status <> 'Suspended'
       AND LOWER(COALESCE(a.account_code, '')) <> 'swimit'
       AND a.subscription_expires_at IS NOT NULL
       AND a.subscription_expires_at = (CURRENT_DATE + INTERVAL '7 days')::date`,
  );

  for (const row of rows) {
    try {
      const result = await sendPackageExpiryChatReminder({
        saasAccountId: row.saasAccountId,
        accountName: String(row.accountName ?? 'your pool'),
        subscriptionExpiresAt: String(row.subscriptionExpiresAt).slice(0, 10),
      });
      if (result.sent) {
        console.log('[subscription-chat-reminders] sent', {
          saasAccountId: row.saasAccountId,
          expires: row.subscriptionExpiresAt,
        });
      }
    } catch (err) {
      console.warn('[subscription-chat-reminders] failed', {
        saasAccountId: row.saasAccountId,
        error: err instanceof Error ? err.message : err,
      });
    }
  }
}
