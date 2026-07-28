import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pool } from '../db/pool.js';
import { tenantId } from '../middleware/tenant.js';
import {
  notifyPassIssued,
  notifyRegistrationConfirmation,
} from '../whatsapp/notify.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.resolve(__dirname, '../../uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are allowed'));
      return;
    }
    cb(null, true);
  },
});

export const registrationsRouter = Router();

async function deactivateExpiredPasses(accountId: number) {
  await pool.query(
    `UPDATE registrations
     SET is_active = FALSE
     WHERE saas_account_id = $1
       AND pass_valid_until IS NOT NULL
       AND pass_valid_until < (CURRENT_DATE - INTERVAL '3 days')
       AND is_active = TRUE`,
    [accountId],
  );
  // Unpaid / no pass yet should not appear as active
  await pool.query(
    `UPDATE registrations
     SET is_active = FALSE
     WHERE saas_account_id = $1
       AND pass_valid_until IS NULL
       AND is_active = TRUE`,
    [accountId],
  );
}

function mapRegistrationRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    whatsapp_mobile: row.whatsapp_mobile,
    birthdate: row.birthdate,
    sex: row.sex,
    blood_group: row.blood_group,
    is_active: row.is_active,
    pass_type: row.pass_type,
    batch: row.batch,
    coach: row.coach,
    pass_valid_until: row.pass_valid_until,
    created_at: row.created_at,
    pending_type: row.pending_type,
  };
}

registrationsRouter.get('/', async (req, res) => {
  try {
    const accountId = tenantId(req);
    await deactivateExpiredPasses(accountId);
    const { rows } = await pool.query(
      `SELECT id, full_name, email, whatsapp_mobile, birthdate, sex, blood_group,
              is_active, pass_type, batch, coach, pass_valid_until, created_at
       FROM registrations
       WHERE saas_account_id = $1
       ORDER BY created_at DESC`,
      [accountId],
    );
    res.json(rows.map(mapRegistrationRow));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load swimmers' });
  }
});

registrationsRouter.get('/pending-payment', async (req, res) => {
  try {
    const accountId = tenantId(req);
    await deactivateExpiredPasses(accountId);
    const { rows } = await pool.query(
      `SELECT id, full_name, email, whatsapp_mobile, birthdate, sex, blood_group,
              is_active, pass_type, batch, coach, pass_valid_until, created_at,
              CASE
                WHEN pass_valid_until IS NULL THEN 'New'
                ELSE 'Expired'
              END AS pending_type
       FROM registrations
       WHERE saas_account_id = $1
         AND (
           pass_valid_until IS NULL
           OR (
             pass_valid_until < CURRENT_DATE
             AND pass_valid_until >= (CURRENT_DATE - INTERVAL '3 days')
           )
         )
       ORDER BY
         CASE WHEN pass_valid_until IS NULL THEN 0 ELSE 1 END,
         created_at DESC`,
      [accountId],
    );
    res.json(rows.map(mapRegistrationRow));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load pending payments' });
  }
});

function formatDateValue(value: unknown) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

registrationsRouter.get('/:id', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid swimmer id' });
      return;
    }

    const { rows } = await pool.query(
      `SELECT r.id, r.full_name, r.whatsapp_mobile, r.email, r.birthdate, r.sex, r.blood_group,
              r.is_active, r.pass_type, r.batch, r.coach, r.pass_valid_until,
              r.swimmer_photo_path, r.emergency_name, r.emergency_relation, r.emergency_mobile,
              r.parent_name, r.parent_relation, r.parent_mobile,
              pt.duration AS pass_duration
       FROM registrations r
       LEFT JOIN pass_types pt
         ON LOWER(TRIM(pt.pass_name)) = LOWER(TRIM(COALESCE(r.pass_type, '')))
        AND pt.saas_account_id = r.saas_account_id
       WHERE r.id = $1 AND r.saas_account_id = $2`,
      [id, accountId],
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'Swimmer not found' });
      return;
    }

    const row = rows[0];
    const passValidUntil = formatDateValue(row.pass_valid_until);
    res.json({
      id: row.id,
      fullName: row.full_name,
      contact: row.whatsapp_mobile ?? '',
      email: row.email ?? '',
      birthdate: formatDateValue(row.birthdate),
      sex: row.sex ?? '',
      bloodGroup: row.blood_group ?? '',
      isActive: row.is_active !== false,
      passType: row.pass_type ?? '',
      duration: row.pass_duration ?? '',
      batch: row.batch ?? '',
      coach: row.coach ?? '',
      passValidUntil,
      photoUrl: row.swimmer_photo_path ? `/uploads/${row.swimmer_photo_path}` : null,
      emergencyName: row.emergency_name ?? '',
      emergencyRelation: row.emergency_relation ?? '',
      emergencyMobile: row.emergency_mobile ?? '',
      parentName: row.parent_name ?? '',
      parentRelation: row.parent_relation ?? '',
      parentMobile: row.parent_mobile ?? '',
      qrCode: `SWIMIT:${row.id}`,
      hasPass: Boolean(row.pass_type && passValidUntil),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load swimmer' });
  }
});

registrationsRouter.patch('/:id', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const id = Number(req.params.id);
    const body = req.body as {
      batch?: string | null;
      isActive?: boolean;
      passType?: string | null;
      coach?: string | null;
      passValidUntil?: string | null;
      paymentMode?: string | null;
      transactionId?: string | null;
    };

    const existing = await pool.query(
      `SELECT id FROM registrations WHERE id = $1 AND saas_account_id = $2`,
      [id, accountId],
    );
    if (!existing.rows[0]) {
      res.status(404).json({ error: 'Swimmer not found' });
      return;
    }

    const isPassPayment =
      body.passType !== undefined &&
      body.passValidUntil !== undefined &&
      Boolean(String(body.passType ?? '').trim()) &&
      Boolean(body.passValidUntil);

    const paymentMode = String(body.paymentMode ?? '').trim();
    if (isPassPayment && paymentMode !== 'Cash' && paymentMode !== 'Online') {
      res.status(400).json({ error: 'Payment mode must be Cash or Online' });
      return;
    }

    const transactionId = String(body.transactionId ?? '').trim();
    if (isPassPayment && paymentMode === 'Online' && !transactionId) {
      res.status(400).json({ error: 'Enter transaction ID for online payment' });
      return;
    }

    const updates: string[] = [];
    const values: unknown[] = [];

    if (body.batch !== undefined) {
      values.push(body.batch?.trim() || null);
      updates.push(`batch = $${values.length}`);
    }
    if (body.isActive !== undefined) {
      values.push(Boolean(body.isActive));
      updates.push(`is_active = $${values.length}`);
    }
    if (body.passType !== undefined) {
      values.push(body.passType?.trim() || null);
      updates.push(`pass_type = $${values.length}`);
    }
    if (body.coach !== undefined) {
      values.push(body.coach?.trim() || null);
      updates.push(`coach = $${values.length}`);
    }
    if (body.passValidUntil !== undefined) {
      values.push(body.passValidUntil || null);
      updates.push(`pass_valid_until = $${values.length}`);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'Nothing to update' });
      return;
    }

    values.push(id);
    values.push(accountId);
    const { rows } = await pool.query(
      `UPDATE registrations SET ${updates.join(', ')}
       WHERE id = $${values.length - 1} AND saas_account_id = $${values.length}
       RETURNING id, full_name, email, whatsapp_mobile, is_active, pass_type, batch, coach, pass_valid_until`,
      values,
    );

    const updated = rows[0];

    if (isPassPayment) {
      const passName = String(body.passType).trim();
      const passRes = await pool.query(
        `SELECT pass_charges, coaching_charges
         FROM pass_types
         WHERE saas_account_id = $1
           AND LOWER(TRIM(pass_name)) = LOWER(TRIM($2))
         LIMIT 1`,
        [accountId, passName],
      );
      const passCharges = Number(passRes.rows[0]?.pass_charges ?? 0);
      const coachingCharges = Number(passRes.rows[0]?.coaching_charges ?? 0);
      const amount = passCharges + coachingCharges;
      await pool.query(
        `INSERT INTO pass_payments
         (saas_account_id, registration_id, swimmer_name, pass_type, pass_charges, coaching_charges, amount, payment_date, payment_mode, transaction_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE, $8, $9)`,
        [
          accountId,
          updated.id,
          updated.full_name,
          passName,
          passCharges,
          coachingCharges,
          amount,
          paymentMode,
          paymentMode === 'Online' ? transactionId : null,
        ],
      );

      const account = await pool.query(
        `SELECT account_code FROM saas_accounts WHERE id = $1`,
        [accountId],
      );
      void notifyPassIssued({
        mobile: String(updated.whatsapp_mobile),
        fullName: String(updated.full_name),
        passType: passName,
        passValidUntil: String(updated.pass_valid_until).slice(0, 10),
        registrationId: Number(updated.id),
        accountCode: String(account.rows[0]?.account_code ?? ''),
        saasAccountId: accountId,
      }).catch((err) => console.warn('[whatsapp] pass notify failed', err));
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update swimmer' });
  }
});

registrationsRouter.post(
  '/',
  upload.fields([
    { name: 'identityPhoto', maxCount: 1 },
    { name: 'swimmerPhoto', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const accountId = tenantId(req);
      const body = req.body as Record<string, string>;
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;

      const required = [
        'fullName',
        'fullAddress',
        'whatsappMobile',
        'email',
        'birthdate',
        'sex',
        'bloodGroup',
        'emergencyName',
        'emergencyRelation',
        'emergencyMobile',
        'hasHealthIssue',
        'identityDocument',
      ] as const;

      for (const key of required) {
        if (!String(body[key] ?? '').trim()) {
          res.status(400).json({ error: `${key} is required` });
          return;
        }
      }

      if (body.acceptedTerms !== 'true') {
        res.status(400).json({ error: 'You must accept the Terms & Conditions' });
        return;
      }

      const identityPhoto = files?.identityPhoto?.[0];
      const swimmerPhoto = files?.swimmerPhoto?.[0];

      if (!identityPhoto || !swimmerPhoto) {
        res.status(400).json({ error: 'Identity proof and swimmer photo are required' });
        return;
      }

      const mobileRe = /^\d{10}$/;
      if (!mobileRe.test(body.whatsappMobile) || !mobileRe.test(body.emergencyMobile)) {
        res.status(400).json({ error: 'Mobile numbers must be a valid 10-digit number' });
        return;
      }
      if (body.otherMobile && !mobileRe.test(body.otherMobile)) {
        res.status(400).json({ error: 'Other mobile number must be a valid 10-digit number' });
        return;
      }
      if (body.doctorNo && !mobileRe.test(body.doctorNo)) {
        res.status(400).json({ error: 'Doctor number must be a valid 10-digit number' });
        return;
      }
      const email = String(body.email ?? '').trim();
      if (!email.includes('@') || !email.includes('.') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ error: 'Email must include @ and .' });
        return;
      }
      if (body.hasHealthIssue === 'Yes' && !String(body.healthIssueDetails ?? '').trim()) {
        res.status(400).json({ error: 'Disease / health issue is required' });
        return;
      }

      const birth = new Date(`${body.birthdate}T00:00:00`);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
      const needsParent = !Number.isNaN(birth.getTime()) && age < 18;
      if (needsParent) {
        if (!String(body.parentName ?? '').trim() || !String(body.parentRelation ?? '').trim()) {
          res.status(400).json({ error: 'Parent information is required for swimmers under 18' });
          return;
        }
        if (!mobileRe.test(String(body.parentMobile ?? ''))) {
          res.status(400).json({ error: 'Parent contact number must be 10 digits' });
          return;
        }
      }

      const { rows } = await pool.query(
        `INSERT INTO registrations (
          saas_account_id, full_name, full_address, whatsapp_mobile, other_mobile, email, birthdate,
          sex, blood_group, emergency_name, emergency_relation, emergency_mobile,
          has_health_issue, health_issue_details, doctor_name, doctor_no, identity_document,
          identity_photo_path, swimmer_photo_path, accepted_terms, is_active,
          parent_name, parent_relation, parent_mobile
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,TRUE,FALSE,$20,$21,$22
        )
        RETURNING id, full_name, email, created_at`,
        [
          accountId,
          body.fullName.trim(),
          body.fullAddress.trim(),
          body.whatsappMobile.trim(),
          body.otherMobile?.trim() || null,
          body.email.trim().toLowerCase(),
          body.birthdate,
          body.sex,
          body.bloodGroup,
          body.emergencyName.trim(),
          body.emergencyRelation,
          body.emergencyMobile.trim(),
          body.hasHealthIssue,
          body.hasHealthIssue === 'Yes' ? body.healthIssueDetails?.trim() || null : null,
          body.hasHealthIssue === 'Yes' ? body.doctorName?.trim() || null : null,
          body.hasHealthIssue === 'Yes' ? body.doctorNo?.trim() || null : null,
          body.identityDocument,
          identityPhoto.filename,
          swimmerPhoto.filename,
          needsParent ? body.parentName.trim() : null,
          needsParent ? body.parentRelation.trim() : null,
          needsParent ? body.parentMobile.trim() : null,
        ],
      );

      res.status(201).json(rows[0]);

      void notifyRegistrationConfirmation({
        mobile: body.whatsappMobile.trim(),
        fullName: body.fullName.trim(),
        saasAccountId: accountId,
      }).catch((err) => console.warn('[whatsapp] registration notify failed', err));
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Registration failed';
      if (message.includes('File too large')) {
        res.status(400).json({ error: 'Each photo must be 200 KB or less' });
        return;
      }
      res.status(500).json({ error: message });
    }
  },
);
