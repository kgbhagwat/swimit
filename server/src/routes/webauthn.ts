import { Router } from 'express';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { pool } from '../db/pool.js';
import { enforceLoginLocation } from '../remoteLogin.js';
import {
  challengeKey,
  expectedOriginFromRequest,
  normalizeTransports,
  rpIDFromRequest,
  rpName,
  storeChallenge,
  takeChallenge,
} from '../webauthn.js';

const ACCOUNT_CODE_RE = /^[a-z0-9]{6}$/;

function normalizeAccountCode(value: string) {
  return value.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toLowerCase();
}

async function loadAccountByCode(code: string) {
  const { rows } = await pool.query<{
    id: number;
    account_name: string;
    account_code: string;
    status: string;
  }>(
    `SELECT id, account_name, account_code, status
     FROM saas_accounts
     WHERE LOWER(account_code) = $1
     LIMIT 1`,
    [code],
  );
  return rows[0] ?? null;
}

function mapLoginUser(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    userName: String(row.user_name),
    mobile: String(row.mobile ?? ''),
    mustChangePassword: row.must_change_password === true,
    isAccountAdmin: row.is_account_admin === true,
    menuAccess: Array.isArray(row.menu_access) ? row.menu_access.map(String) : [],
  };
}

export const webauthnRouter = Router();

/** Whether biometric (platform authenticator) can be offered for this account code. */
webauthnRouter.get('/by-code/:code/webauthn/available', async (req, res) => {
  try {
    const code = normalizeAccountCode(req.params.code);
    if (!ACCOUNT_CODE_RE.test(code)) {
      res.status(400).json({ error: 'Invalid account code' });
      return;
    }
    const account = await loadAccountByCode(code);
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    if (String(account.status) === 'Suspended') {
      res.status(403).json({ error: 'This account is suspended' });
      return;
    }
    const { rows } = await pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM webauthn_credentials WHERE saas_account_id = $1`,
      [account.id],
    );
    res.json({
      ok: true,
      hasCredentials: Number(rows[0]?.n ?? 0) > 0,
      rpID: rpIDFromRequest(req),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to check biometric availability' });
  }
});

webauthnRouter.post('/by-code/:code/webauthn/register/options', async (req, res) => {
  try {
    const code = normalizeAccountCode(req.params.code);
    if (!ACCOUNT_CODE_RE.test(code)) {
      res.status(400).json({ error: 'Invalid account code' });
      return;
    }
    const userId = Number((req.body as { userId?: number | string }).userId);
    if (!Number.isFinite(userId) || userId <= 0) {
      res.status(400).json({ error: 'User id is required' });
      return;
    }

    const account = await loadAccountByCode(code);
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    if (String(account.status) === 'Suspended') {
      res.status(403).json({ error: 'This account is suspended' });
      return;
    }

    const { rows: userRows } = await pool.query(
      `SELECT id, user_name, must_change_password
       FROM app_users
       WHERE id = $1 AND saas_account_id = $2
       LIMIT 1`,
      [userId, account.id],
    );
    if (!userRows[0]) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (userRows[0].must_change_password === true) {
      res.status(400).json({ error: 'Change your password before enabling biometric login' });
      return;
    }

    const { rows: existing } = await pool.query<{ credential_id: string }>(
      `SELECT credential_id FROM webauthn_credentials WHERE user_id = $1`,
      [userId],
    );

    const options = await generateRegistrationOptions({
      rpName: rpName(),
      rpID: rpIDFromRequest(req),
      userName: String(userRows[0].user_name),
      userDisplayName: String(userRows[0].user_name),
      userID: new TextEncoder().encode(`swimIT:${account.id}:${userId}`),
      attestationType: 'none',
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
        requireResidentKey: false,
      },
      excludeCredentials: existing.map((row) => ({
        id: row.credential_id,
        transports: ['internal'] as const,
      })),
    });

    storeChallenge(challengeKey('reg', account.id, userId), options.challenge, userId);
    res.json(options);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to start biometric enrollment' });
  }
});

webauthnRouter.post('/by-code/:code/webauthn/register/verify', async (req, res) => {
  try {
    const code = normalizeAccountCode(req.params.code);
    if (!ACCOUNT_CODE_RE.test(code)) {
      res.status(400).json({ error: 'Invalid account code' });
      return;
    }
    const body = req.body as {
      userId?: number | string;
      response?: RegistrationResponseJSON;
      deviceLabel?: string;
    };
    const userId = Number(body.userId);
    if (!Number.isFinite(userId) || userId <= 0 || !body.response) {
      res.status(400).json({ error: 'User id and attestation response are required' });
      return;
    }

    const account = await loadAccountByCode(code);
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const expected = takeChallenge(challengeKey('reg', account.id, userId));
    if (!expected) {
      res.status(400).json({ error: 'Biometric enrollment expired. Try again.' });
      return;
    }

    const { rows: userRows } = await pool.query(
      `SELECT id, user_name FROM app_users WHERE id = $1 AND saas_account_id = $2 LIMIT 1`,
      [userId, account.id],
    );
    if (!userRows[0]) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: expected.challenge,
      expectedOrigin: expectedOriginFromRequest(req),
      expectedRPID: rpIDFromRequest(req),
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      res.status(400).json({ error: 'Biometric enrollment failed verification' });
      return;
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    const credentialId = credential.id;
    const publicKey = Buffer.from(credential.publicKey);
    const transports = normalizeTransports(body.response.response.transports);
    const deviceLabel = String(body.deviceLabel ?? '').trim().slice(0, 120) || 'This device';

    await pool.query(
      `INSERT INTO webauthn_credentials
         (user_id, saas_account_id, credential_id, public_key, counter, transports,
          device_label, device_type, backed_up)
       VALUES ($1, $2, $3, $4, $5, $6::text[], $7, $8, $9)
       ON CONFLICT (credential_id) DO UPDATE
         SET public_key = EXCLUDED.public_key,
             counter = EXCLUDED.counter,
             transports = EXCLUDED.transports,
             device_label = EXCLUDED.device_label,
             device_type = EXCLUDED.device_type,
             backed_up = EXCLUDED.backed_up,
             last_used_at = NOW()`,
      [
        userId,
        account.id,
        credentialId,
        publicKey,
        credential.counter,
        transports,
        deviceLabel,
        credentialDeviceType,
        credentialBackedUp,
      ],
    );

    res.json({
      ok: true,
      credentialId,
      userName: String(userRows[0].user_name),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save biometric login' });
  }
});

webauthnRouter.post('/by-code/:code/webauthn/login/options', async (req, res) => {
  try {
    const code = normalizeAccountCode(req.params.code);
    if (!ACCOUNT_CODE_RE.test(code)) {
      res.status(400).json({ error: 'Invalid account code' });
      return;
    }
    const userName = String((req.body as { userName?: string }).userName ?? '').trim();
    const credentialIdHint = String(
      (req.body as { credentialId?: string }).credentialId ?? '',
    ).trim();

    const account = await loadAccountByCode(code);
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    if (String(account.status) === 'Suspended') {
      res.status(403).json({ error: 'This account is suspended' });
      return;
    }

    let allowCredentials: { id: string; transports?: ('internal' | 'hybrid' | 'usb' | 'ble' | 'nfc')[] }[] =
      [];

    if (credentialIdHint) {
      const { rows } = await pool.query<{
        credential_id: string;
        transports: string[] | null;
      }>(
        `SELECT credential_id, transports
         FROM webauthn_credentials
         WHERE saas_account_id = $1 AND credential_id = $2
         LIMIT 1`,
        [account.id, credentialIdHint],
      );
      if (rows[0]) {
        allowCredentials = [
          {
            id: rows[0].credential_id,
            transports: normalizeTransports(rows[0].transports) as (
              | 'internal'
              | 'hybrid'
              | 'usb'
              | 'ble'
              | 'nfc'
            )[],
          },
        ];
      }
    } else if (userName) {
      const { rows } = await pool.query<{
        credential_id: string;
        transports: string[] | null;
      }>(
        `SELECT c.credential_id, c.transports
         FROM webauthn_credentials c
         JOIN app_users u ON u.id = c.user_id
         WHERE c.saas_account_id = $1 AND LOWER(u.user_name) = LOWER($2)`,
        [account.id, userName],
      );
      allowCredentials = rows.map((row) => ({
        id: row.credential_id,
        transports: normalizeTransports(row.transports) as (
          | 'internal'
          | 'hybrid'
          | 'usb'
          | 'ble'
          | 'nfc'
        )[],
      }));
    } else {
      const { rows } = await pool.query<{
        credential_id: string;
        transports: string[] | null;
      }>(
        `SELECT credential_id, transports
         FROM webauthn_credentials
         WHERE saas_account_id = $1`,
        [account.id],
      );
      allowCredentials = rows.map((row) => ({
        id: row.credential_id,
        transports: normalizeTransports(row.transports) as (
          | 'internal'
          | 'hybrid'
          | 'usb'
          | 'ble'
          | 'nfc'
        )[],
      }));
    }

    if (allowCredentials.length === 0) {
      res.status(400).json({ error: 'No biometric login is set up for this account on a registered device' });
      return;
    }

    const options = await generateAuthenticationOptions({
      rpID: rpIDFromRequest(req),
      userVerification: 'required',
      allowCredentials,
    });

    storeChallenge(challengeKey('auth', account.id), options.challenge, null);
    res.json(options);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to start biometric login' });
  }
});

webauthnRouter.post('/by-code/:code/webauthn/login/verify', async (req, res) => {
  try {
    const code = normalizeAccountCode(req.params.code);
    if (!ACCOUNT_CODE_RE.test(code)) {
      res.status(400).json({ error: 'Invalid account code' });
      return;
    }
    const body = req.body as {
      response?: AuthenticationResponseJSON;
      latitude?: number | string | null;
      longitude?: number | string | null;
      accuracyM?: number | string | null;
    };
    const response = body.response;
    if (!response?.id) {
      res.status(400).json({ error: 'Authentication response is required' });
      return;
    }

    const account = await loadAccountByCode(code);
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    if (String(account.status) === 'Suspended') {
      res.status(403).json({ error: 'This account is suspended' });
      return;
    }

    const expected = takeChallenge(challengeKey('auth', account.id));
    if (!expected) {
      res.status(400).json({ error: 'Biometric login expired. Try again.' });
      return;
    }

    const { rows: credRows } = await pool.query<{
      id: number;
      user_id: number;
      credential_id: string;
      public_key: Buffer;
      counter: string | number;
      transports: string[] | null;
    }>(
      `SELECT id, user_id, credential_id, public_key, counter, transports
       FROM webauthn_credentials
       WHERE saas_account_id = $1 AND credential_id = $2
       LIMIT 1`,
      [account.id, response.id],
    );
    if (!credRows[0]) {
      res.status(401).json({ error: 'Biometric credential not recognized' });
      return;
    }

    const cred = credRows[0];
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: expected.challenge,
      expectedOrigin: expectedOriginFromRequest(req),
      expectedRPID: rpIDFromRequest(req),
      credential: {
        id: cred.credential_id,
        publicKey: new Uint8Array(cred.public_key),
        counter: Number(cred.counter ?? 0),
        transports: normalizeTransports(cred.transports),
      },
      requireUserVerification: true,
    });

    if (!verification.verified) {
      res.status(401).json({ error: 'Biometric verification failed' });
      return;
    }

    const newCounter = verification.authenticationInfo.newCounter;
    await pool.query(
      `UPDATE webauthn_credentials
       SET counter = $1, last_used_at = NOW()
       WHERE id = $2`,
      [newCounter, cred.id],
    );

    const { rows: userRows } = await pool.query(
      `SELECT id, user_name, mobile, email, menu_access, must_change_password,
              is_account_admin, saas_account_id, created_at
       FROM app_users
       WHERE id = $1 AND saas_account_id = $2
       LIMIT 1`,
      [cred.user_id, account.id],
    );
    if (!userRows[0]) {
      res.status(401).json({ error: 'User not found for this biometric login' });
      return;
    }

    const locationGate = await enforceLoginLocation({
      req,
      accountId: account.id,
      accountCode: String(account.account_code),
      accountName: String(account.account_name),
      user: {
        id: Number(userRows[0].id),
        user_name: String(userRows[0].user_name),
        mobile: String(userRows[0].mobile ?? ''),
        email: userRows[0].email == null ? null : String(userRows[0].email),
        is_account_admin: userRows[0].is_account_admin === true,
      },
      location: {
        latitude: body.latitude,
        longitude: body.longitude,
        accuracyM: body.accuracyM,
      },
    });
    if (!locationGate.ok) {
      res.status(locationGate.statusCode).json(locationGate.body);
      return;
    }

    res.json({
      account: {
        id: account.id,
        accountName: String(account.account_name),
        accountCode: String(account.account_code),
        status: String(account.status),
      },
      user: mapLoginUser(userRows[0]),
      credentialId: cred.credential_id,
      locationStatus: locationGate.locationStatus,
      distanceKm: locationGate.distanceKm,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to complete biometric login' });
  }
});

webauthnRouter.get('/by-code/:code/webauthn/credentials', async (req, res) => {
  try {
    const code = normalizeAccountCode(req.params.code);
    const userId = Number(req.query.userId);
    if (!ACCOUNT_CODE_RE.test(code) || !Number.isFinite(userId) || userId <= 0) {
      res.status(400).json({ error: 'Account code and user id are required' });
      return;
    }
    const account = await loadAccountByCode(code);
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    const { rows } = await pool.query(
      `SELECT credential_id, device_label, created_at, last_used_at
       FROM webauthn_credentials
       WHERE saas_account_id = $1 AND user_id = $2
       ORDER BY created_at DESC`,
      [account.id, userId],
    );
    res.json(
      rows.map((row) => ({
        credentialId: String(row.credential_id),
        deviceLabel: String(row.device_label ?? 'This device'),
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at,
      })),
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load biometric credentials' });
  }
});

webauthnRouter.delete('/by-code/:code/webauthn/credentials/:credentialId', async (req, res) => {
  try {
    const code = normalizeAccountCode(req.params.code);
    const userId = Number((req.body as { userId?: number | string }).userId ?? req.query.userId);
    const credentialId = String(req.params.credentialId ?? '').trim();
    if (!ACCOUNT_CODE_RE.test(code) || !Number.isFinite(userId) || userId <= 0 || !credentialId) {
      res.status(400).json({ error: 'Account code, user id, and credential id are required' });
      return;
    }
    const account = await loadAccountByCode(code);
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    const result = await pool.query(
      `DELETE FROM webauthn_credentials
       WHERE saas_account_id = $1 AND user_id = $2 AND credential_id = $3`,
      [account.id, userId, credentialId],
    );
    if ((result.rowCount ?? 0) === 0) {
      res.status(404).json({ error: 'Biometric credential not found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove biometric login' });
  }
});
