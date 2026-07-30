import { pool } from './db/pool.js';
import { notifyPackageCapacityWarning } from './whatsapp/notify.js';

const CAPACITY_THRESHOLDS = [90, 95, 98] as const;

function reminderKind(thresholdPct: number, packageId: number) {
  return `saas_swimmer_capacity_${thresholdPct}_${packageId}`;
}

/**
 * When active swimmers reach 90% / 95% / 98% of the package max,
 * WhatsApp the account admin a capacity warning + renewal link (once per threshold per package).
 */
export async function maybeNotifyPackageSwimmerCapacity(saasAccountId: number) {
  if (!Number.isFinite(saasAccountId) || saasAccountId <= 0) return;

  const { rows } = await pool.query<{
    accountName: string;
    accountCode: string;
    status: string;
    packageId: number | null;
    packageName: string | null;
    maxActiveSwimmers: number | null;
    activeSwimmers: number;
    adminMobile: string | null;
    adminName: string | null;
  }>(
    `
    SELECT
      a.account_name AS "accountName",
      a.account_code AS "accountCode",
      a.status,
      a.service_package_id AS "packageId",
      p.package_name AS "packageName",
      p.max_active_swimmers AS "maxActiveSwimmers",
      (
        SELECT COUNT(*)::int
        FROM registrations r
        WHERE r.saas_account_id = a.id
          AND COALESCE(r.is_active, TRUE) = TRUE
      ) AS "activeSwimmers",
      u.mobile AS "adminMobile",
      u.user_name AS "adminName"
    FROM saas_accounts a
    LEFT JOIN service_packages p ON p.id = a.service_package_id
    LEFT JOIN app_users u
      ON u.saas_account_id = a.id
     AND COALESCE(u.is_account_admin, FALSE) = TRUE
    WHERE a.id = $1
    ORDER BY u.id ASC
    LIMIT 1
    `,
    [saasAccountId],
  );

  const row = rows[0];
  if (!row) return;
  if (String(row.status ?? '') === 'Suspended') return;

  const packageId = row.packageId == null ? 0 : Number(row.packageId);
  const maxActive = row.maxActiveSwimmers == null ? null : Number(row.maxActiveSwimmers);
  if (!packageId || maxActive == null || !Number.isFinite(maxActive) || maxActive <= 0) {
    return; // unlimited or no package
  }

  const active = Number(row.activeSwimmers ?? 0);
  if (!Number.isFinite(active) || active <= 0) return;

  const mobile = String(row.adminMobile ?? '')
    .replace(/\D/g, '')
    .slice(-10);
  if (mobile.length !== 10) return;

  const crossed = CAPACITY_THRESHOLDS.filter((pct) => {
    const limit = Math.floor((maxActive * pct) / 100);
    return limit > 0 && active >= limit;
  });
  if (!crossed.length) return;

  const pending: number[] = [];
  for (const pct of crossed) {
    const kind = reminderKind(pct, packageId);
    const already = await pool.query<{ exists: boolean }>(
      `
      SELECT EXISTS (
        SELECT 1
        FROM whatsapp_outbound
        WHERE saas_account_id = $1
          AND kind = $2
        LIMIT 1
      ) AS "exists"
      `,
      [saasAccountId, kind],
    );
    if (!already.rows[0]?.exists) pending.push(pct);
  }

  if (!pending.length) return;

  // One WhatsApp for the highest newly crossed threshold; mark all newly crossed as sent.
  const thresholdPct = Math.max(...pending);
  const result = await notifyPackageCapacityWarning({
    saasAccountId,
    mobile,
    adminName: String(row.adminName ?? '').trim() || 'Pool Admin',
    accountName: String(row.accountName ?? '').trim() || 'SwimIT',
    accountCode: String(row.accountCode ?? '').trim(),
    packageName: String(row.packageName ?? '').trim() || 'current package',
    activeSwimmers: active,
    maxActiveSwimmers: maxActive,
    thresholdPct,
    reminderKind: reminderKind(thresholdPct, packageId),
  });

  if (!result.ok) {
    console.warn('[package-capacity] notify failed', {
      saasAccountId,
      thresholdPct,
      error: result.error,
    });
    return;
  }

  // Record lower newly-crossed thresholds so they are not sent later after this jump.
  for (const pct of pending) {
    if (pct === thresholdPct) continue;
    const kind = reminderKind(pct, packageId);
    try {
      await pool.query(
        `INSERT INTO whatsapp_outbound
         (saas_account_id, to_mobile, kind, body, status, error)
         VALUES ($1, $2, $3, $4, 'sent', $5)`,
        [
          saasAccountId,
          mobile,
          kind,
          `Marked covered by ${thresholdPct}% capacity warning`,
          null,
        ],
      );
    } catch (err) {
      console.warn('[package-capacity] failed to mark threshold', pct, err);
    }
  }
}
