import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { recordAudit } from '../auditLog.js';
import { pool } from '../db/pool.js';
import { tenantId } from '../middleware/tenant.js';
import { duplicateEmailMessage, duplicateMobileMessage, isEmailTakenInAccount, isMobileTakenInAccount } from '../mobileUniqueness.js';
import { isValidMobile, MOBILE_INVALID_MSG } from '../mobileValidation.js';
import { isValidPersonName, NAME_INVALID_MSG } from '../nameValidation.js';
import {
  imageOrPdfFileFilter,
  randomUploadFilename,
  UPLOAD_MAX_BYTES,
} from '../uploadFilter.js';
import {
  guessImageContentType,
  normalizeBirthdate,
  openSealedUploadFile,
  maskIdentityNumber,
  identityNumberError,
  revealIdentityDocument,
  revealIdentityNumber,
  sealBirthdate,
  sealIdentityDocument,
  sealIdentityNumber,
  sealUploadFile,
} from '../sensitiveData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.resolve(__dirname, '../../uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    try {
      cb(null, randomUploadFilename(file));
    } catch (err) {
      cb(err instanceof Error ? err : new Error('Unsupported upload file type'), '');
    }
  },
});

const upload = multer({
  storage,
  limits: { fileSize: UPLOAD_MAX_BYTES },
  fileFilter: imageOrPdfFileFilter,
});

function isOver18(birthdate: string, now = new Date()) {
  const birth = String(birthdate ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) return false;
  const pad = (n: number) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (birth > today) return false;
  const by = Number(birth.slice(0, 4));
  const bm = Number(birth.slice(5, 7));
  const bd = Number(birth.slice(8, 10));
  const ty = now.getFullYear();
  const tm = now.getMonth() + 1;
  const td = now.getDate();
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age > 18;
}

function staffEmailError(value: unknown) {
  const email = String(value ?? '').trim();
  if (!email) return null;
  if (!email.includes('@') || !email.includes('.') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Email must include @ and .';
  }
  return null;
}

export const staffRegistrationsRouter = Router();

function formatPlainDate(value: unknown) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') return value.slice(0, 10);
  return String(value).slice(0, 10);
}

function formatBirthdate(value: unknown) {
  if (!value) return '';
  try {
    const normalized = normalizeBirthdate(value);
    if (normalized) return normalized.slice(0, 10);
  } catch (err) {
    console.warn('[pii] birthdate decrypt failed', err);
  }
  return formatPlainDate(value);
}

function mapStaffDetail(row: Record<string, unknown>, accountId?: number) {
  const id = row.id;
  const accountQs =
    accountId && Number.isFinite(accountId) ? `?accountId=${accountId}` : '';
  return {
    id: row.id,
    registrationFor: row.registration_for,
    fullName: row.full_name,
    fullAddress: row.full_address,
    whatsappMobile: row.whatsapp_mobile,
    otherMobile: row.other_mobile ?? '',
    email: row.email,
    birthdate: formatBirthdate(row.birthdate),
    sex: row.sex,
    bloodGroup: row.blood_group,
    emergencyName: row.emergency_name,
    emergencyRelation: row.emergency_relation,
    emergencyMobile: row.emergency_mobile,
    hasHealthIssue: row.has_health_issue,
    healthIssueDetails: row.health_issue_details ?? '',
    doctorName: row.doctor_name ?? '',
    doctorNo: row.doctor_no ?? '',
    identityDocument: revealIdentityDocument(row.identity_document),
    identityNumber: revealIdentityNumber(row.identity_number),
    identityNumberMasked: maskIdentityNumber(revealIdentityNumber(row.identity_number)),
    identityPhotoUrl: row.identity_photo_path
      ? `/api/staff-registrations/${id}/identity-photo${accountQs}`
      : null,
    identityPhotoPath: null,
    staffPhotoPath: row.staff_photo_path,
    teachStrokes: row.teach_strokes ?? [],
    suitableBatchIds: row.suitable_batch_ids ?? [],
    achievements: row.achievements ?? '',
    hasLifeguardCert: row.has_lifeguard_cert ?? 'No',
    lifeguardExpiry: formatPlainDate(row.lifeguard_expiry),
    lifeguardPhotoPath: row.lifeguard_photo_path,
    certificateDetails: row.certificate_details ?? '',
    certificatePhoto1: row.certificate_photo_1,
    certificatePhoto2: row.certificate_photo_2,
    certificatePhoto3: row.certificate_photo_3,
    postName: row.post_name ?? '',
    salary: row.salary === null || row.salary === undefined ? '' : String(row.salary),
    isActive: row.is_active !== false,
    isApproved: row.is_approved === true,
    createdAt: row.created_at,
  };
}

async function validateCoachBatchRules(
  accountId: number,
  suitableBatchIds: string[],
  teachStrokes: string[],
  sex: string,
) {
  if (!Array.isArray(suitableBatchIds) || suitableBatchIds.length === 0) return null;

  const ids = suitableBatchIds
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);
  if (ids.length === 0) return null;

  const { rows } = await pool.query<{ type: string }>(
    `SELECT type FROM batch_slots WHERE id = ANY($1::int[]) AND saas_account_id = $2`,
    [ids, accountId],
  );
  const types = rows.map((row) => row.type);
  if (types.includes('Advance') && !teachStrokes.includes('Competitive')) {
    return 'Advance batch requires Competitive under Interested to teach';
  }
  if (types.includes('Ladies') && sex !== 'Female') {
    return 'Ladies batch is allowed for Female coaches only';
  }
  return null;
}

let approvedColumnReady = false;

async function ensureCoachApprovedColumn() {
  if (approvedColumnReady) return;
  await pool.query(
    `ALTER TABLE staff_registrations
     ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT FALSE`,
  );
  approvedColumnReady = true;
}

staffRegistrationsRouter.get('/', async (req, res) => {
  try {
    await ensureCoachApprovedColumn();
    const accountId = tenantId(req);
    const { rows } = await pool.query(
      `SELECT id, registration_for, full_name, email, whatsapp_mobile, teach_strokes,
              suitable_batch_ids, post_name, salary, is_active, is_approved, created_at,
              has_lifeguard_cert, lifeguard_expiry, lifeguard_photo_path
       FROM staff_registrations
       WHERE saas_account_id = $1
       ORDER BY created_at DESC`,
      [accountId],
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load staff' });
  }
});

staffRegistrationsRouter.get('/:id', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const id = Number(req.params.id);
    const { rows } = await pool.query(
      `SELECT * FROM staff_registrations WHERE id = $1 AND saas_account_id = $2`,
      [id, accountId],
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'Staff registration not found' });
      return;
    }
    res.json(mapStaffDetail(rows[0], accountId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load staff registration' });
  }
});

staffRegistrationsRouter.get('/:id/identity-photo', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid staff id' });
      return;
    }
    const { rows } = await pool.query(
      `SELECT identity_photo_path
       FROM staff_registrations
       WHERE id = $1 AND saas_account_id = $2`,
      [id, accountId],
    );
    const filename = String(rows[0]?.identity_photo_path ?? '').trim();
    if (!filename) {
      res.status(404).json({ error: 'Identity proof not found' });
      return;
    }
    const buffer = await openSealedUploadFile(uploadDir, filename);
    res.setHeader('Cache-Control', 'private, no-store');
    res.type(guessImageContentType(filename));
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load identity proof' });
  }
});

staffRegistrationsRouter.patch('/:id/status', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const id = Number(req.params.id);
    const isActive = Boolean(req.body?.isActive);
    const { rows } = await pool.query(
      `UPDATE staff_registrations SET is_active = $1
       WHERE id = $2 AND saas_account_id = $3
       RETURNING id, is_active`,
      [isActive, id, accountId],
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'Staff registration not found' });
      return;
    }
    const nameRes = await pool.query(
      `SELECT full_name FROM staff_registrations WHERE id = $1 AND saas_account_id = $2`,
      [id, accountId],
    );
    await recordAudit(req, {
      action: isActive ? 'activate' : 'deactivate',
      entityType: 'staff',
      entityId: rows[0].id,
      entityLabel: String(nameRes.rows[0]?.full_name ?? ''),
      summary: isActive ? 'Activated staff' : 'Deactivated staff',
      details: { isActive: rows[0].is_active },
    });
    res.json({ id: rows[0].id, isActive: rows[0].is_active });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

staffRegistrationsRouter.patch('/:id/approve', async (req, res) => {
  try {
    await ensureCoachApprovedColumn();
    const accountId = tenantId(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid staff id' });
      return;
    }

    const existing = await pool.query(
      `SELECT id, registration_for FROM staff_registrations
       WHERE id = $1 AND saas_account_id = $2`,
      [id, accountId],
    );
    if (!existing.rows[0]) {
      res.status(404).json({ error: 'Staff registration not found' });
      return;
    }
    if (String(existing.rows[0].registration_for) !== 'Coach') {
      res.status(400).json({ error: 'Only coaches can be approved for payment assignment' });
      return;
    }

    const isApproved = Boolean(req.body?.isApproved);
    const { rows } = await pool.query(
      `UPDATE staff_registrations SET is_approved = $1
       WHERE id = $2 AND saas_account_id = $3
       RETURNING id, is_approved, full_name`,
      [isApproved, id, accountId],
    );
    await recordAudit(req, {
      action: 'update',
      entityType: 'staff',
      entityId: rows[0].id,
      entityLabel: String(rows[0].full_name ?? ''),
      summary: isApproved ? 'Approved coach for payment' : 'Removed coach payment approval',
      details: { isApproved: rows[0].is_approved === true },
    });
    res.json({ id: rows[0].id, isApproved: rows[0].is_approved === true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update approval' });
  }
});

staffRegistrationsRouter.delete('/:id', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const id = Number(req.params.id);
    const existing = await pool.query(
      `SELECT id, full_name FROM staff_registrations WHERE id = $1 AND saas_account_id = $2`,
      [id, accountId],
    );
    if (!existing.rows[0]) {
      res.status(404).json({ error: 'Staff registration not found' });
      return;
    }
    await pool.query(`DELETE FROM staff_registrations WHERE id = $1 AND saas_account_id = $2`, [
      id,
      accountId,
    ]);
    await recordAudit(req, {
      action: 'delete',
      entityType: 'staff',
      entityId: existing.rows[0].id,
      entityLabel: String(existing.rows[0].full_name ?? ''),
      summary: 'Deleted staff registration',
    });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete staff registration' });
  }
});

staffRegistrationsRouter.put(
  '/:id',
  upload.fields([
    { name: 'identityPhoto', maxCount: 1 },
    { name: 'staffPhoto', maxCount: 1 },
    { name: 'lifeguardPhoto', maxCount: 1 },
    { name: 'certificatePhoto1', maxCount: 1 },
    { name: 'certificatePhoto2', maxCount: 1 },
    { name: 'certificatePhoto3', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const accountId = tenantId(req);
      const id = Number(req.params.id);
      const body = req.body as Record<string, string>;
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;

      const existing = await pool.query(
        `SELECT * FROM staff_registrations WHERE id = $1 AND saas_account_id = $2`,
        [id, accountId],
      );
      if (!existing.rows[0]) {
        res.status(404).json({ error: 'Staff registration not found' });
        return;
      }
      const current = existing.rows[0] as Record<string, unknown>;

      const required = [
        'registrationFor',
        'fullName',
        'fullAddress',
        'whatsappMobile',
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
      const emailError = staffEmailError(body.email);
      if (emailError) {
        res.status(400).json({ error: emailError });
        return;
      }
      const identityNumber = String(body.identityNumber ?? '').trim();
      const numberError = identityNumberError(identityNumber);
      if (numberError) {
        res.status(400).json({ error: numberError });
        return;
      }

      if (!['Coach', 'Lifeguard', 'Other'].includes(body.registrationFor)) {
        res.status(400).json({ error: 'Invalid registration for value' });
        return;
      }

      if (!isValidPersonName(body.fullName) || !isValidPersonName(body.emergencyName)) {
        res.status(400).json({ error: NAME_INVALID_MSG });
        return;
      }
      if (!isValidMobile(body.whatsappMobile) || !isValidMobile(body.emergencyMobile)) {
        res.status(400).json({ error: MOBILE_INVALID_MSG });
        return;
      }
      if (
        body.emergencyMobile.trim() === body.whatsappMobile.trim() ||
        (body.otherMobile?.trim() &&
          body.emergencyMobile.trim() === body.otherMobile.trim())
      ) {
        res.status(400).json({
          error: 'Emergency contact number cannot be the same as the applicant mobile number',
        });
        return;
      }
      if (
        await isMobileTakenInAccount({
          accountId,
          mobile: body.whatsappMobile,
          kind: 'staff',
          excludeId: id,
        })
      ) {
        res.status(400).json({ error: duplicateMobileMessage('staff') });
        return;
      }
      if (
        await isEmailTakenInAccount({
          accountId,
          email: body.email,
          kind: 'staff',
          excludeId: id,
        })
      ) {
        res.status(400).json({ error: duplicateEmailMessage('staff') });
        return;
      }
      if (body.otherMobile && !isValidMobile(body.otherMobile)) {
        res.status(400).json({ error: MOBILE_INVALID_MSG });
        return;
      }
      if (body.doctorNo && !isValidMobile(body.doctorNo)) {
        res.status(400).json({ error: MOBILE_INVALID_MSG });
        return;
      }
      if (body.hasHealthIssue === 'Yes' && !String(body.healthIssueDetails ?? '').trim()) {
        res.status(400).json({ error: 'Disease / health issue is required' });
        return;
      }
      if (!isOver18(body.birthdate)) {
        res.status(400).json({ error: 'Staff must be more than 18 years old' });
        return;
      }

      const isCoach = body.registrationFor === 'Coach';
      const isLifeguard = body.registrationFor === 'Lifeguard';
      const needsLifeguard = isCoach || isLifeguard;
      let teachStrokes: string[] | null = null;
      let suitableBatchIds: string[] | null = null;
      if (isCoach) {
        try {
          teachStrokes = JSON.parse(body.teachStrokes || '[]') as string[];
        } catch {
          teachStrokes = [];
        }
        if (!Array.isArray(teachStrokes) || teachStrokes.length === 0) {
          res.status(400).json({ error: 'Select at least one stroke to teach' });
          return;
        }
        try {
          suitableBatchIds = JSON.parse(body.suitableBatchIds || '[]') as string[];
        } catch {
          suitableBatchIds = [];
        }
        const existingBatches = await pool.query(
          `SELECT id FROM batch_slots WHERE saas_account_id = $1`,
          [accountId],
        );
        if (existingBatches.rowCount && existingBatches.rowCount > 0) {
          if (!Array.isArray(suitableBatchIds) || suitableBatchIds.length === 0) {
            res.status(400).json({ error: 'Select at least one suitable batch slot' });
            return;
          }
          const batchRuleError = await validateCoachBatchRules(
            accountId,
            suitableBatchIds.map(String),
            teachStrokes,
            String(body.sex ?? ''),
          );
          if (batchRuleError) {
            res.status(400).json({ error: batchRuleError });
            return;
          }
        } else {
          suitableBatchIds = [];
        }
      }

      const identityPhotoPathRaw =
        files?.identityPhoto?.[0]?.filename || String(current.identity_photo_path ?? '');
      let identityPhotoPath = identityPhotoPathRaw;
      const staffPhotoPath =
        files?.staffPhoto?.[0]?.filename || String(current.staff_photo_path ?? '');
      if (!identityPhotoPath || !staffPhotoPath) {
        res.status(400).json({ error: 'Identity proof and photo are required' });
        return;
      }

      if (files?.identityPhoto?.[0]?.filename) {
        identityPhotoPath = await sealUploadFile(uploadDir, files.identityPhoto[0].filename);
      }

      let lifeguardPhotoPath: string | null = null;
      if (needsLifeguard && body.hasLifeguardCert === 'Yes') {
        if (!body.lifeguardExpiry) {
          res.status(400).json({ error: 'Lifeguard certificate expiry date is required' });
          return;
        }
        lifeguardPhotoPath =
          files?.lifeguardPhoto?.[0]?.filename ||
          (current.lifeguard_photo_path ? String(current.lifeguard_photo_path) : null);
        if (!lifeguardPhotoPath) {
          res.status(400).json({ error: 'Life Guard certificate photo is required' });
          return;
        }
      }

      const isActive =
        body.isActive === undefined ? current.is_active !== false : body.isActive === 'true';

      const isOther = body.registrationFor === 'Other';
      if (isOther && !String(body.postName ?? '').trim()) {
        res.status(400).json({ error: 'Post name is required' });
        return;
      }
      if (isOther && (body.salary === undefined || body.salary === '' || Number.isNaN(Number(body.salary)))) {
        res.status(400).json({ error: 'Salary is required' });
        return;
      }

      const sealedBirth = sealBirthdate(body.birthdate);

      const { rows } = await pool.query(
        `UPDATE staff_registrations SET
          registration_for = $1,
          full_name = $2,
          full_address = $3,
          whatsapp_mobile = $4,
          other_mobile = $5,
          email = $6,
          birthdate = $7,
          sex = $8,
          blood_group = $9,
          emergency_name = $10,
          emergency_relation = $11,
          emergency_mobile = $12,
          has_health_issue = $13,
          health_issue_details = $14,
          doctor_name = $15,
          doctor_no = $16,
          identity_document = $17,
          identity_number = $18,
          identity_photo_path = $19,
          staff_photo_path = $20,
          teach_strokes = $21,
          suitable_batch_ids = $22,
          achievements = $23,
          has_lifeguard_cert = $24,
          lifeguard_expiry = $25,
          lifeguard_photo_path = $26,
          certificate_details = $27,
          certificate_photo_1 = $28,
          certificate_photo_2 = $29,
          certificate_photo_3 = $30,
          is_active = $31,
          post_name = $32,
          salary = $33,
          is_adult = $34
        WHERE id = $35 AND saas_account_id = $36
        RETURNING *`,
        [
          body.registrationFor,
          body.fullName.trim(),
          body.fullAddress.trim(),
          body.whatsappMobile.trim(),
          body.otherMobile?.trim() || null,
          String(body.email ?? '').trim().toLowerCase(),
          sealedBirth.sealed,
          body.sex,
          body.bloodGroup,
          body.emergencyName.trim(),
          body.emergencyRelation,
          body.emergencyMobile.trim(),
          body.hasHealthIssue,
          body.hasHealthIssue === 'Yes' ? body.healthIssueDetails?.trim() || null : null,
          body.hasHealthIssue === 'Yes' ? body.doctorName?.trim() || null : null,
          body.hasHealthIssue === 'Yes' ? body.doctorNo?.trim() || null : null,
          sealIdentityDocument(body.identityDocument),
          sealIdentityNumber(identityNumber),
          identityPhotoPath,
          staffPhotoPath,
          isCoach ? teachStrokes : null,
          isCoach ? suitableBatchIds : null,
          isCoach ? body.achievements?.trim() || null : null,
          needsLifeguard ? body.hasLifeguardCert || 'No' : null,
          needsLifeguard && body.hasLifeguardCert === 'Yes' ? body.lifeguardExpiry || null : null,
          lifeguardPhotoPath,
          isCoach ? body.certificateDetails?.trim() || null : null,
          isCoach
            ? files?.certificatePhoto1?.[0]?.filename ||
              (current.certificate_photo_1 ? String(current.certificate_photo_1) : null)
            : null,
          isCoach
            ? files?.certificatePhoto2?.[0]?.filename ||
              (current.certificate_photo_2 ? String(current.certificate_photo_2) : null)
            : null,
          isCoach
            ? files?.certificatePhoto3?.[0]?.filename ||
              (current.certificate_photo_3 ? String(current.certificate_photo_3) : null)
            : null,
          isActive,
          isOther ? body.postName!.trim() : null,
          isOther ? Number(body.salary) : null,
          sealedBirth.isAdult,
          id,
          accountId,
        ],
      );

      const saved = mapStaffDetail(rows[0], accountId);
      await recordAudit(req, {
        action: 'update',
        entityType: 'staff',
        entityId: Number(saved.id),
        entityLabel: String(saved.fullName ?? ''),
        summary: 'Updated staff registration',
        details: { registrationFor: saved.registrationFor, isActive: saved.isActive },
      });
      res.json(saved);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Update failed';
      if (message.includes('File too large')) {
        res.status(400).json({ error: 'Each file must be 200 KB or less' });
        return;
      }
      if (message.toLowerCase().includes('unique') || message.toLowerCase().includes('duplicate')) {
        res.status(400).json({
          error: 'This WhatsApp mobile or email is already used by another staff member in this account',
        });
        return;
      }
      res.status(500).json({ error: message });
    }
  },
);

staffRegistrationsRouter.post(
  '/',
  upload.fields([
    { name: 'identityPhoto', maxCount: 1 },
    { name: 'staffPhoto', maxCount: 1 },
    { name: 'lifeguardPhoto', maxCount: 1 },
    { name: 'certificatePhoto1', maxCount: 1 },
    { name: 'certificatePhoto2', maxCount: 1 },
    { name: 'certificatePhoto3', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const accountId = tenantId(req);
      const body = req.body as Record<string, string>;
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;

      const required = [
        'registrationFor',
        'fullName',
        'fullAddress',
        'whatsappMobile',
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
      const emailError = staffEmailError(body.email);
      if (emailError) {
        res.status(400).json({ error: emailError });
        return;
      }
      const identityNumber = String(body.identityNumber ?? '').trim();
      const numberError = identityNumberError(identityNumber);
      if (numberError) {
        res.status(400).json({ error: numberError });
        return;
      }

      if (!['Coach', 'Lifeguard', 'Other'].includes(body.registrationFor)) {
        res.status(400).json({ error: 'Invalid registration for value' });
        return;
      }

      if (body.acceptedTerms !== 'true') {
        res.status(400).json({ error: 'You must accept the Terms & Conditions' });
        return;
      }

      const identityPhoto = files?.identityPhoto?.[0];
      const staffPhoto = files?.staffPhoto?.[0];

      if (!identityPhoto || !staffPhoto) {
        res.status(400).json({ error: 'Identity proof and photo are required' });
        return;
      }

      if (!isValidPersonName(body.fullName) || !isValidPersonName(body.emergencyName)) {
        res.status(400).json({ error: NAME_INVALID_MSG });
        return;
      }
      if (!isValidMobile(body.whatsappMobile) || !isValidMobile(body.emergencyMobile)) {
        res.status(400).json({ error: MOBILE_INVALID_MSG });
        return;
      }
      if (
        body.emergencyMobile.trim() === body.whatsappMobile.trim() ||
        (body.otherMobile?.trim() &&
          body.emergencyMobile.trim() === body.otherMobile.trim())
      ) {
        res.status(400).json({
          error: 'Emergency contact number cannot be the same as the applicant mobile number',
        });
        return;
      }
      if (
        await isMobileTakenInAccount({
          accountId,
          mobile: body.whatsappMobile,
          kind: 'staff',
        })
      ) {
        res.status(400).json({ error: duplicateMobileMessage('staff') });
        return;
      }
      if (
        await isEmailTakenInAccount({
          accountId,
          email: body.email,
          kind: 'staff',
        })
      ) {
        res.status(400).json({ error: duplicateEmailMessage('staff') });
        return;
      }
      if (body.otherMobile && !isValidMobile(body.otherMobile)) {
        res.status(400).json({ error: MOBILE_INVALID_MSG });
        return;
      }
      if (body.doctorNo && !isValidMobile(body.doctorNo)) {
        res.status(400).json({ error: MOBILE_INVALID_MSG });
        return;
      }
      if (body.hasHealthIssue === 'Yes' && !String(body.healthIssueDetails ?? '').trim()) {
        res.status(400).json({ error: 'Disease / health issue is required' });
        return;
      }
      if (!isOver18(body.birthdate)) {
        res.status(400).json({ error: 'Staff must be more than 18 years old' });
        return;
      }

      const isCoach = body.registrationFor === 'Coach';
      const isLifeguard = body.registrationFor === 'Lifeguard';
      const needsLifeguard = isCoach || isLifeguard;
      let teachStrokes: string[] | null = null;
      let suitableBatchIds: string[] | null = null;
      if (isCoach) {
        try {
          teachStrokes = JSON.parse(body.teachStrokes || '[]') as string[];
        } catch {
          teachStrokes = [];
        }
        if (!Array.isArray(teachStrokes) || teachStrokes.length === 0) {
          res.status(400).json({ error: 'Select at least one stroke to teach' });
          return;
        }
        try {
          suitableBatchIds = JSON.parse(body.suitableBatchIds || '[]') as string[];
        } catch {
          suitableBatchIds = [];
        }
        const existingBatches = await pool.query(
          `SELECT id FROM batch_slots WHERE saas_account_id = $1`,
          [accountId],
        );
        if (existingBatches.rowCount && existingBatches.rowCount > 0) {
          if (!Array.isArray(suitableBatchIds) || suitableBatchIds.length === 0) {
            res.status(400).json({ error: 'Select at least one suitable batch slot' });
            return;
          }
          const batchRuleError = await validateCoachBatchRules(
            accountId,
            suitableBatchIds.map(String),
            teachStrokes,
            String(body.sex ?? ''),
          );
          if (batchRuleError) {
            res.status(400).json({ error: batchRuleError });
            return;
          }
        } else {
          suitableBatchIds = [];
        }
      }
      if (needsLifeguard && body.hasLifeguardCert === 'Yes' && !body.lifeguardExpiry) {
        res.status(400).json({ error: 'Lifeguard certificate expiry date is required' });
        return;
      }
      if (needsLifeguard && body.hasLifeguardCert === 'Yes' && !files?.lifeguardPhoto?.[0]) {
        res.status(400).json({ error: 'Life Guard certificate photo is required' });
        return;
      }

      const sealedBirth = sealBirthdate(body.birthdate);
      const sealedIdentityPhoto = await sealUploadFile(uploadDir, identityPhoto.filename);

      const { rows } = await pool.query(
        `INSERT INTO staff_registrations (
          saas_account_id, registration_for, full_name, full_address, whatsapp_mobile, other_mobile, email, birthdate,
          sex, blood_group, emergency_name, emergency_relation, emergency_mobile,
          has_health_issue, health_issue_details, doctor_name, doctor_no, identity_document,
          identity_number, identity_photo_path, staff_photo_path, teach_strokes, suitable_batch_ids, achievements,
          has_lifeguard_cert, lifeguard_expiry, lifeguard_photo_path, certificate_details,
          certificate_photo_1, certificate_photo_2, certificate_photo_3, accepted_terms, is_adult
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,TRUE,$32
        )
        RETURNING id, registration_for, full_name, email, created_at`,
        [
          accountId,
          body.registrationFor,
          body.fullName.trim(),
          body.fullAddress.trim(),
          body.whatsappMobile.trim(),
          body.otherMobile?.trim() || null,
          String(body.email ?? '').trim().toLowerCase(),
          sealedBirth.sealed,
          body.sex,
          body.bloodGroup,
          body.emergencyName.trim(),
          body.emergencyRelation,
          body.emergencyMobile.trim(),
          body.hasHealthIssue,
          body.hasHealthIssue === 'Yes' ? body.healthIssueDetails?.trim() || null : null,
          body.hasHealthIssue === 'Yes' ? body.doctorName?.trim() || null : null,
          body.hasHealthIssue === 'Yes' ? body.doctorNo?.trim() || null : null,
          sealIdentityDocument(body.identityDocument),
          sealIdentityNumber(identityNumber),
          sealedIdentityPhoto,
          staffPhoto.filename,
          isCoach ? teachStrokes : null,
          isCoach ? suitableBatchIds : null,
          isCoach ? body.achievements?.trim() || null : null,
          needsLifeguard ? body.hasLifeguardCert || 'No' : null,
          needsLifeguard && body.hasLifeguardCert === 'Yes' ? body.lifeguardExpiry || null : null,
          needsLifeguard && body.hasLifeguardCert === 'Yes'
            ? files?.lifeguardPhoto?.[0]?.filename || null
            : null,
          isCoach ? body.certificateDetails?.trim() || null : null,
          isCoach ? files?.certificatePhoto1?.[0]?.filename || null : null,
          isCoach ? files?.certificatePhoto2?.[0]?.filename || null : null,
          isCoach ? files?.certificatePhoto3?.[0]?.filename || null : null,
          sealedBirth.isAdult,
        ],
      );

      await recordAudit(req, {
        action: 'create',
        entityType: 'staff',
        entityId: rows[0].id,
        entityLabel: String(rows[0].full_name ?? ''),
        summary: 'Created staff registration',
        details: { registrationFor: rows[0].registration_for },
      });
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Registration failed';
      if (message.includes('File too large')) {
        res.status(400).json({ error: 'Each file must be 200 KB or less' });
        return;
      }
      if (message.toLowerCase().includes('unique') || message.toLowerCase().includes('duplicate')) {
        res.status(400).json({
          error: 'This WhatsApp mobile or email is already used by another staff member in this account',
        });
        return;
      }
      res.status(500).json({ error: message });
    }
  },
);
