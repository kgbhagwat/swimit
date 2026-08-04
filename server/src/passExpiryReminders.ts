import { pool } from './db/pool.js';
import { getWhatsAppConfig } from './whatsapp/config.js';
import { notifyPassExpiring } from './whatsapp/notify.js';

const REMINDER_KIND = 'pass_expiry';

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let lastCheckedDate: string | null = null;

/** Daily morning pass-expiry WhatsApp notices for accounts that enabled the setting. */
export function startPassExpiryReminders() {
  const cfg = getWhatsAppConfig();
  if (!cfg.enabled) {
    console.log('[pass-expiry-reminders] WhatsApp not configured — skipping scheduled reminders');
    return;
  }

  if (intervalHandle) return;

  void runOncePerDay();
  // Check hourly so a restart late in the day still runs once; only sends once per calendar day.
  intervalHandle = setInterval(() => {
    void runOncePerDay();
  }, 60 * 60 * 1000);
}

async function runOncePerDay() {
  const { rows } = await pool.query<{ today: string; hour: number }>(
    `SELECT CURRENT_DATE::text AS "today", EXTRACT(HOUR FROM NOW())::int AS "hour"`,
  );
  const today = rows[0]?.today ?? '';
  const hour = Number(rows[0]?.hour ?? 0);
  if (!today) return;
  // Morning window: run from 06:00 local DB time onward, once per day.
  if (hour < 6) return;
  if (lastCheckedDate === today) return;
  lastCheckedDate = today;

  await sendPassExpiryReminders();
}

async function sendPassExpiryReminders() {
  const { rows: accounts } = await pool.query<{
    saasAccountId: number;
    days: number;
  }>(
    `
    SELECT
      saas_account_id AS "saasAccountId",
      GREATEST(1, LEAST(9, COALESCE(pass_expiry_notice_days, 3))) AS "days"
    FROM pool_core_info
    WHERE saas_account_id IS NOT NULL
      AND COALESCE(pass_expiry_notice_enabled, FALSE) = TRUE
    `,
  );

  if (!accounts.length) return;

  for (const account of accounts) {
    const { rows: swimmers } = await pool.query<{
      id: number;
      fullName: string;
      mobile: string;
      passType: string;
      passValidUntil: string;
    }>(
      `
      SELECT
        id,
        full_name AS "fullName",
        whatsapp_mobile AS "mobile",
        COALESCE(pass_type, '') AS "passType",
        pass_valid_until::text AS "passValidUntil"
      FROM registrations
      WHERE saas_account_id = $1
        AND is_active = TRUE
        AND pass_valid_until IS NOT NULL
        AND pass_valid_until = (CURRENT_DATE + ($2::int || ' days')::interval)::date
      `,
      [account.saasAccountId, account.days],
    );

    for (const swimmer of swimmers) {
      const mobile = String(swimmer.mobile ?? '')
        .replace(/\D/g, '')
        .slice(-10);
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
        [account.saasAccountId, REMINDER_KIND, mobile],
      );
      if (alreadySent.rows[0]?.exists) continue;

      const result = await notifyPassExpiring({
        saasAccountId: account.saasAccountId,
        mobile,
        fullName: String(swimmer.fullName ?? '').trim() || 'Swimmer',
        passType: String(swimmer.passType ?? ''),
        passValidUntil: String(swimmer.passValidUntil ?? '').slice(0, 10),
      });

      const error = 'error' in result ? result.error : undefined;
      if (result.skipped && error) {
        console.warn('[pass-expiry-reminders] send failed', {
          saasAccountId: account.saasAccountId,
          registrationId: swimmer.id,
          mobile,
          error,
        });
      }
    }
  }
}
