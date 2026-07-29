import { pool } from './db/pool.js';
import { notifyAccountAdminBatchOverLimit } from './whatsapp/notify.js';

export type BatchCapacityCheck = {
  overLimit: boolean;
  exceedingAllowed: boolean;
  count: number;
  limit: number | null;
};

export async function checkBatchCoachCapacity(params: {
  saasAccountId: number;
  registrationId: number;
  passType: string;
  batch: string;
  coach: string | null | undefined;
}): Promise<BatchCapacityCheck> {
  const batch = String(params.batch ?? '').trim();
  const coach = String(params.coach ?? '').trim();
  if (!batch || !coach) {
    return { overLimit: false, exceedingAllowed: true, count: 0, limit: null };
  }

  const passRes = await pool.query<{
    max_swimmers_per_coach: number | null;
    exceeding_limit_allowed: boolean | null;
  }>(
    `SELECT max_swimmers_per_coach, exceeding_limit_allowed
     FROM pass_types
     WHERE saas_account_id = $1
       AND LOWER(TRIM(pass_name)) = LOWER(TRIM($2))
     LIMIT 1`,
    [params.saasAccountId, params.passType],
  );
  const limitRaw = passRes.rows[0]?.max_swimmers_per_coach;
  const limit = limitRaw == null ? null : Number(limitRaw);
  const exceedingAllowed = passRes.rows[0]?.exceeding_limit_allowed !== false;
  if (limit == null || !Number.isFinite(limit) || limit <= 0) {
    return { overLimit: false, exceedingAllowed, count: 0, limit: null };
  }

  const countRes = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM registrations
     WHERE saas_account_id = $1
       AND is_active = TRUE
       AND id <> $2
       AND LOWER(TRIM(COALESCE(batch, ''))) = LOWER(TRIM($3::text))
       AND LOWER(TRIM(COALESCE(coach, ''))) = LOWER(TRIM($4::text))`,
    [params.saasAccountId, params.registrationId, batch, coach],
  );
  const count = Number(countRes.rows[0]?.count ?? 0);
  return {
    overLimit: count >= limit,
    exceedingAllowed,
    count,
    limit,
  };
}

export async function maybeNotifyBatchCoachOverLimit(params: {
  saasAccountId: number;
  registrationId: number;
  swimmerName: string;
  passType: string;
  batch: string;
  coach: string | null | undefined;
  source: 'desk_payment' | 'whatsapp_request' | 'whatsapp_verified';
}) {
  const check = await checkBatchCoachCapacity(params);
  if (!check.overLimit || check.limit == null) return;
  if (!check.exceedingAllowed) return;

  const batch = String(params.batch ?? '').trim();
  const coach = String(params.coach ?? '').trim();

  const adminRes = await pool.query<{
    adminMobile: string | null;
    adminName: string | null;
    accountName: string | null;
  }>(
    `SELECT u.mobile AS "adminMobile",
            u.user_name AS "adminName",
            a.account_name AS "accountName"
     FROM saas_accounts a
     JOIN app_users u
       ON u.saas_account_id = a.id
      AND COALESCE(u.is_account_admin, FALSE) = TRUE
     WHERE a.id = $1
     ORDER BY u.id ASC
     LIMIT 1`,
    [params.saasAccountId],
  );
  const admin = adminRes.rows[0];
  if (!admin) return;

  const mobile = String(admin.adminMobile ?? '').replace(/\D/g, '').slice(-10);
  if (mobile.length !== 10) return;

  await notifyAccountAdminBatchOverLimit({
    mobile,
    adminName: String(admin.adminName ?? 'Admin'),
    accountName: String(admin.accountName ?? 'your pool'),
    swimmerName: params.swimmerName,
    passType: params.passType,
    batch,
    coach,
    currentCount: check.count,
    limit: check.limit,
    saasAccountId: params.saasAccountId,
    source: params.source,
  });
}
