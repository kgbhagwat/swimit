import { randomBytes } from 'node:crypto';
import type { Request } from 'express';
import { recordAudit, recordPlatformAudit } from './auditLog.js';
import { pool } from './db/pool.js';
import { sendRemoteLoginAlertEmail } from './email.js';
import {
  asLatLng,
  haversineKm,
  loginGeoFromRow,
  parseCoordinate,
  REMOTE_ACCESS_GRANT_HOURS,
} from './geo.js';
import { notifyRemoteLoginAlert } from './whatsapp/notify.js';

export type LoginLocationInput = {
  latitude?: unknown;
  longitude?: unknown;
  accuracyM?: unknown;
};

export type LoginUserRow = {
  id: number;
  user_name: string;
  mobile: string;
  email?: string | null;
  is_account_admin?: boolean;
};

function publicAppBase(req: Request) {
  const raw =
    req.get('origin') ||
    process.env.PUBLIC_APP_URL ||
    process.env.CORS_ORIGIN ||
    'http://localhost:5173';
  return String(raw).replace(/\/$/, '');
}

function newToken() {
  return randomBytes(24).toString('hex');
}

async function loadPoolGeo(accountId: number) {
  const { rows } = await pool.query<{
    latitude: string | number | null;
    longitude: string | number | null;
  }>(
    `SELECT latitude, longitude
     FROM pool_core_info
     WHERE saas_account_id = $1
     LIMIT 1`,
    [accountId],
  );
  if (!rows[0]) return null;
  return asLatLng(parseCoordinate(rows[0].latitude), parseCoordinate(rows[0].longitude));
}

async function hasActiveRemoteGrant(userId: number, accountId: number) {
  const { rows } = await pool.query<{ remote_access_until: Date | string | null }>(
    `SELECT remote_access_until
     FROM app_users
     WHERE id = $1 AND saas_account_id = $2`,
    [userId, accountId],
  );
  const until = rows[0]?.remote_access_until;
  if (!until) return false;
  const ts = until instanceof Date ? until.getTime() : new Date(until).getTime();
  return Number.isFinite(ts) && ts > Date.now();
}

type AdminContact = {
  mobile: string;
  email: string;
  userName: string;
  kind: 'account' | 'platform';
};

async function loadNotifyAdmins(accountId: number, excludeUserId?: number) {
  const contacts: AdminContact[] = [];
  const { rows: accountAdmins } = await pool.query<{
    mobile: string;
    email: string | null;
    user_name: string;
    id: number;
  }>(
    `SELECT id, mobile, email, user_name
     FROM app_users
     WHERE saas_account_id = $1
       AND COALESCE(is_account_admin, FALSE) = TRUE
     ORDER BY id ASC`,
    [accountId],
  );
  for (const row of accountAdmins) {
    if (excludeUserId && Number(row.id) === excludeUserId) continue;
    contacts.push({
      mobile: String(row.mobile ?? ''),
      email: String(row.email ?? ''),
      userName: String(row.user_name ?? 'Admin'),
      kind: 'account',
    });
  }

  const { rows: platformAdmins } = await pool.query<{
    mobile: string;
    email: string | null;
    user_name: string;
  }>(
    `SELECT u.mobile, u.email, u.user_name
     FROM app_users u
     JOIN saas_accounts a ON a.id = u.saas_account_id
     WHERE LOWER(a.account_code) = 'swimit'
       AND COALESCE(u.is_account_admin, FALSE) = TRUE
     ORDER BY u.id ASC
     LIMIT 5`,
  );
  for (const row of platformAdmins) {
    contacts.push({
      mobile: String(row.mobile ?? ''),
      email: String(row.email ?? ''),
      userName: String(row.user_name ?? 'Platform admin'),
      kind: 'platform',
    });
  }

  // If the only account admin is the remote user, still notify them so they can approve themselves.
  if (!contacts.some((c) => c.kind === 'account') && accountAdmins[0]) {
    const row = accountAdmins[0];
    contacts.push({
      mobile: String(row.mobile ?? ''),
      email: String(row.email ?? ''),
      userName: String(row.user_name ?? 'Admin'),
      kind: 'account',
    });
  }

  return contacts;
}

async function notifyAdmins(params: {
  req: Request;
  accountId: number;
  accountName: string;
  accountCode: string;
  userName: string;
  distanceKm: number | null;
  latitude: number | null;
  longitude: number | null;
  approvalToken: string;
  excludeUserId?: number;
}) {
  const base = publicAppBase(params.req);
  const approveUrl = `${base}/remote-access?token=${encodeURIComponent(params.approvalToken)}&decision=approve`;
  const denyUrl = `${base}/remote-access?token=${encodeURIComponent(params.approvalToken)}&decision=deny`;
  const distanceLabel =
    params.distanceKm == null
      ? 'unknown (location unavailable)'
      : `${params.distanceKm.toFixed(1)} km from pool`;
  const when = new Date().toLocaleString('en-GB', { hour12: false });
  const contacts = await loadNotifyAdmins(params.accountId, params.excludeUserId);

  await Promise.all(
    contacts.map(async (contact) => {
      if (contact.email.trim()) {
        await sendRemoteLoginAlertEmail({
          to: contact.email.trim(),
          adminName: contact.userName,
          accountName: params.accountName,
          accountCode: params.accountCode,
          userName: params.userName,
          distanceLabel,
          whenLabel: when,
          approveUrl,
          denyUrl,
        });
      }
      const mobileDigits = contact.mobile.replace(/\D/g, '').slice(-10);
      if (mobileDigits.length === 10) {
        await notifyRemoteLoginAlert({
          mobile: mobileDigits,
          adminName: contact.userName,
          accountName: params.accountName,
          accountCode: params.accountCode,
          userName: params.userName,
          distanceLabel,
          whenLabel: when,
          approveUrl,
          denyUrl,
          saasAccountId: params.accountId,
        });
      }
    }),
  );
}

export type LoginLocationResult =
  | {
      ok: true;
      locationStatus: 'near' | 'skipped' | 'granted';
      distanceKm: number | null;
    }
  | {
      ok: false;
      statusCode: 403;
      body: {
        error: string;
        code: 'REMOTE_ACCESS_REQUIRED';
        requestId: number;
        statusToken: string;
        distanceKm: number | null;
        thresholdKm: number;
      };
    };

/**
 * After credentials succeed: allow near-pool / granted remote logins;
 * otherwise create a pending remote request and notify admins.
 */
export async function enforceLoginLocation(params: {
  req: Request;
  accountId: number;
  accountCode: string;
  accountName: string;
  user: LoginUserRow;
  location: LoginLocationInput;
}): Promise<LoginLocationResult> {
  const code = String(params.accountCode ?? '').toLowerCase();
  if (code === 'swimit') {
    return { ok: true, locationStatus: 'skipped', distanceKm: null };
  }

  const poolGeo = await loadPoolGeo(params.accountId);
  if (!poolGeo) {
    await recordAudit(params.req, {
      saasAccountId: params.accountId,
      actorUserId: params.user.id,
      actorUserName: params.user.user_name,
      action: 'login',
      entityType: 'remote_login',
      entityId: params.user.id,
      entityLabel: params.user.user_name,
      summary: `Login by ${params.user.user_name} (pool location not set — distance check skipped)`,
      details: { locationStatus: 'skipped' },
    });
    return { ok: true, locationStatus: 'skipped', distanceKm: null };
  }

  const { rows: geoRows } = await pool.query<{
    login_geo_mode: string | null;
    login_radius_km: number | null;
  }>(
    `SELECT login_geo_mode, login_radius_km
     FROM app_users
     WHERE id = $1 AND saas_account_id = $2
     LIMIT 1`,
    [params.user.id, params.accountId],
  );
  const geoPolicy = loginGeoFromRow(geoRows[0] ?? {});
  const allowedKm = geoPolicy?.radiusKm ?? null;

  if (allowedKm == null) {
    await recordAudit(params.req, {
      saasAccountId: params.accountId,
      actorUserId: params.user.id,
      actorUserName: params.user.user_name,
      action: 'login',
      entityType: 'remote_login',
      entityId: params.user.id,
      entityLabel: params.user.user_name,
      summary: `Login by ${params.user.user_name} (user login distance not set — distance check skipped)`,
      details: {
        locationStatus: 'skipped',
        reason: 'user_login_radius_unset',
      },
    });
    return { ok: true, locationStatus: 'skipped', distanceKm: null };
  }

  const fix = asLatLng(
    parseCoordinate(params.location.latitude),
    parseCoordinate(params.location.longitude),
  );
  const accuracyM = parseCoordinate(params.location.accuracyM);
  const hasFix = Boolean(fix);
  const lat = fix?.lat ?? null;
  const lng = fix?.lng ?? null;
  const distanceKm = fix
    ? Math.round(haversineKm(fix.lat, fix.lng, poolGeo.lat, poolGeo.lng) * 10) / 10
    : null;

  if (hasFix && distanceKm != null && distanceKm <= allowedKm) {
    await recordAudit(params.req, {
      saasAccountId: params.accountId,
      actorUserId: params.user.id,
      actorUserName: params.user.user_name,
      action: 'login',
      entityType: 'remote_login',
      entityId: params.user.id,
      entityLabel: params.user.user_name,
      summary: `Login by ${params.user.user_name} within allowed distance (${distanceKm.toFixed(1)} km / ${allowedKm} km)`,
      details: {
        locationStatus: 'near',
        distanceKm,
        latitude: lat,
        longitude: lng,
        accuracyM,
        thresholdKm: allowedKm,
        loginRadiusKm: allowedKm,
      },
    });
    return { ok: true, locationStatus: 'near', distanceKm };
  }

  if (await hasActiveRemoteGrant(params.user.id, params.accountId)) {
    await recordAudit(params.req, {
      saasAccountId: params.accountId,
      actorUserId: params.user.id,
      actorUserName: params.user.user_name,
      action: 'login',
      entityType: 'remote_login',
      entityId: params.user.id,
      entityLabel: params.user.user_name,
      summary: `Remote login by ${params.user.user_name} (admin-approved access)${
        distanceKm == null ? '' : ` · ${distanceKm.toFixed(1)} km`
      }`,
      details: {
        locationStatus: 'granted',
        distanceKm,
        latitude: hasFix ? lat : null,
        longitude: hasFix ? lng : null,
        accuracyM,
        thresholdKm: allowedKm,
        loginRadiusKm: allowedKm,
      },
    });
    return { ok: true, locationStatus: 'granted', distanceKm };
  }

  // Reuse an existing pending request for this user when still open.
  const { rows: pendingRows } = await pool.query<{
    id: number;
    status_token: string;
    approval_token: string;
  }>(
    `SELECT id, status_token, approval_token
     FROM remote_login_requests
     WHERE saas_account_id = $1
       AND user_id = $2
       AND status = 'pending'
       AND created_at > NOW() - INTERVAL '12 hours'
     ORDER BY id DESC
     LIMIT 1`,
    [params.accountId, params.user.id],
  );

  let requestId: number;
  let statusToken: string;
  let approvalToken: string;
  if (pendingRows[0]) {
    requestId = Number(pendingRows[0].id);
    statusToken = String(pendingRows[0].status_token);
    approvalToken = String(pendingRows[0].approval_token);
    await pool.query(
      `UPDATE remote_login_requests
       SET latitude = $1,
           longitude = $2,
           accuracy_m = $3,
           distance_km = $4,
           pool_latitude = $5,
           pool_longitude = $6
       WHERE id = $7`,
      [
        hasFix ? lat : null,
        hasFix ? lng : null,
        accuracyM,
        distanceKm,
        poolGeo.lat,
        poolGeo.lng,
        requestId,
      ],
    );
  } else {
    statusToken = newToken();
    approvalToken = newToken();
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO remote_login_requests
         (saas_account_id, user_id, latitude, longitude, accuracy_m, distance_km,
          pool_latitude, pool_longitude, status, status_token, approval_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10)
       RETURNING id`,
      [
        params.accountId,
        params.user.id,
        hasFix ? lat : null,
        hasFix ? lng : null,
        accuracyM,
        distanceKm,
        poolGeo.lat,
        poolGeo.lng,
        statusToken,
        approvalToken,
      ],
    );
    requestId = Number(rows[0].id);
  }

  const summary =
    distanceKm == null
      ? `Remote login pending for ${params.user.user_name} (location unavailable)`
      : `Remote login pending for ${params.user.user_name} (${distanceKm.toFixed(1)} km from pool)`;

  const details = {
    requestId,
    status: 'pending',
    locationStatus: 'remote',
    distanceKm,
    latitude: hasFix ? lat : null,
    longitude: hasFix ? lng : null,
    accuracyM,
        thresholdKm: allowedKm,
        loginRadiusKm: allowedKm,
        canDecide: true,
      };

  await recordAudit(params.req, {
    saasAccountId: params.accountId,
    actorUserId: params.user.id,
    actorUserName: params.user.user_name,
    action: 'login',
    entityType: 'remote_login',
    entityId: requestId,
    entityLabel: params.user.user_name,
    summary,
    details,
  });
  await recordPlatformAudit(params.req, {
    actorUserId: params.user.id,
    actorUserName: params.user.user_name,
    action: 'login',
    entityType: 'remote_login',
    entityId: requestId,
    entityLabel: `${params.accountCode} · ${params.user.user_name}`,
    summary: `${params.accountName}: ${summary}`,
    details: { ...details, accountId: params.accountId, accountCode: params.accountCode },
  });

  if (!pendingRows[0]) {
    await notifyAdmins({
      req: params.req,
      accountId: params.accountId,
      accountName: params.accountName,
      accountCode: params.accountCode,
      userName: params.user.user_name,
      distanceKm,
      latitude: hasFix ? lat : null,
      longitude: hasFix ? lng : null,
      approvalToken,
      excludeUserId: undefined,
    });
  }

  return {
    ok: false,
    statusCode: 403,
    body: {
      error:
        'You are signing in far from the pool. An admin must approve remote access before you can continue.',
      code: 'REMOTE_ACCESS_REQUIRED',
      requestId,
      statusToken,
      distanceKm,
      thresholdKm: allowedKm,
    },
  };
}

export async function decideRemoteLoginRequest(params: {
  req: Request;
  requestId?: number;
  approvalToken?: string;
  decision: 'approve' | 'deny';
  decidedByUserId?: number | null;
  decidedByUserName?: string | null;
}) {
  const decision = params.decision;
  if (decision !== 'approve' && decision !== 'deny') {
    return { ok: false as const, statusCode: 400, error: 'decision must be approve or deny' };
  }

  const { rows } = await pool.query<{
    id: number;
    saas_account_id: number;
    user_id: number;
    status: string;
    distance_km: string | number | null;
    user_name: string;
    account_name: string;
    account_code: string;
  }>(
    params.approvalToken
      ? `SELECT r.id, r.saas_account_id, r.user_id, r.status, r.distance_km,
                u.user_name, a.account_name, a.account_code
         FROM remote_login_requests r
         JOIN app_users u ON u.id = r.user_id
         JOIN saas_accounts a ON a.id = r.saas_account_id
         WHERE r.approval_token = $1
         LIMIT 1`
      : `SELECT r.id, r.saas_account_id, r.user_id, r.status, r.distance_km,
                u.user_name, a.account_name, a.account_code
         FROM remote_login_requests r
         JOIN app_users u ON u.id = r.user_id
         JOIN saas_accounts a ON a.id = r.saas_account_id
         WHERE r.id = $1
         LIMIT 1`,
    [params.approvalToken ?? params.requestId],
  );
  if (!rows[0]) {
    return { ok: false as const, statusCode: 404, error: 'Remote login request not found' };
  }
  const row = rows[0];
  if (row.status !== 'pending') {
    return {
      ok: true as const,
      alreadyDecided: true,
      status: row.status,
      requestId: Number(row.id),
      userName: String(row.user_name),
    };
  }

  const newStatus = decision === 'approve' ? 'approved' : 'denied';
  const grantHours = REMOTE_ACCESS_GRANT_HOURS;
  await pool.query(
    `UPDATE remote_login_requests
     SET status = $1,
         decided_by_user_id = $2,
         decided_at = NOW(),
         remote_access_until = CASE
           WHEN $1 = 'approved' THEN NOW() + ($3::text || ' hours')::interval
           ELSE NULL
         END
     WHERE id = $4`,
    [newStatus, params.decidedByUserId ?? null, String(grantHours), row.id],
  );

  if (decision === 'approve') {
    await pool.query(
      `UPDATE app_users
       SET remote_access_until = NOW() + ($1::text || ' hours')::interval
       WHERE id = $2 AND saas_account_id = $3`,
      [String(grantHours), row.user_id, row.saas_account_id],
    );
  }

  const actorName = params.decidedByUserName?.trim() || 'Admin';
  const distanceKm =
    row.distance_km == null || row.distance_km === ''
      ? null
      : Number(row.distance_km);
  const summary =
    decision === 'approve'
      ? `Approved remote access for ${row.user_name} (${grantHours}h)`
      : `Denied remote access for ${row.user_name}`;

  await recordAudit(params.req, {
    saasAccountId: Number(row.saas_account_id),
    actorUserId: params.decidedByUserId ?? null,
    actorUserName: actorName,
    action: decision === 'approve' ? 'approve' : 'deny',
    entityType: 'remote_login',
    entityId: row.id,
    entityLabel: String(row.user_name),
    summary,
    details: {
      requestId: Number(row.id),
      status: newStatus,
      distanceKm: Number.isFinite(distanceKm as number) ? distanceKm : null,
      grantHours: decision === 'approve' ? grantHours : null,
      canDecide: false,
    },
  });
  await recordPlatformAudit(params.req, {
    actorUserId: params.decidedByUserId ?? null,
    actorUserName: actorName,
    action: decision === 'approve' ? 'approve' : 'deny',
    entityType: 'remote_login',
    entityId: row.id,
    entityLabel: `${row.account_code} · ${row.user_name}`,
    summary: `${row.account_name}: ${summary}`,
    details: {
      requestId: Number(row.id),
      status: newStatus,
      accountId: Number(row.saas_account_id),
      accountCode: String(row.account_code),
      canDecide: false,
    },
  });

  return {
    ok: true as const,
    alreadyDecided: false,
    status: newStatus,
    requestId: Number(row.id),
    userName: String(row.user_name),
    grantHours: decision === 'approve' ? grantHours : null,
  };
}

export async function getRemoteLoginStatus(requestId: number, statusToken: string) {
  const { rows } = await pool.query<{
    id: number;
    status: string;
    distance_km: string | number | null;
    remote_access_until: Date | string | null;
  }>(
    `SELECT id, status, distance_km, remote_access_until
     FROM remote_login_requests
     WHERE id = $1 AND status_token = $2
     LIMIT 1`,
    [requestId, statusToken],
  );
  if (!rows[0]) return null;
  const distanceKm =
    rows[0].distance_km == null || rows[0].distance_km === ''
      ? null
      : Number(rows[0].distance_km);
  return {
    requestId: Number(rows[0].id),
    status: String(rows[0].status),
    distanceKm: Number.isFinite(distanceKm as number) ? distanceKm : null,
    remoteAccessUntil:
      rows[0].remote_access_until instanceof Date
        ? rows[0].remote_access_until.toISOString()
        : rows[0].remote_access_until
          ? String(rows[0].remote_access_until)
          : null,
  };
}
