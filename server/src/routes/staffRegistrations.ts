import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pool } from '../db/pool.js';
import { tenantId } from '../middleware/tenant.js';

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

export const staffRegistrationsRouter = Router();

function formatDateValue(value: unknown) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function mapStaffDetail(row: Record<string, unknown>) {
  return {
    id: row.id,
    registrationFor: row.registration_for,
    fullName: row.full_name,
    fullAddress: row.full_address,
    whatsappMobile: row.whatsapp_mobile,
    otherMobile: row.other_mobile ?? '',
    email: row.email,
    birthdate: formatDateValue(row.birthdate),
    sex: row.sex,
    bloodGroup: row.blood_group,
    emergencyName: row.emergency_name,
    emergencyRelation: row.emergency_relation,
    emergencyMobile: row.emergency_mobile,
    hasHealthIssue: row.has_health_issue,
    healthIssueDetails: row.health_issue_details ?? '',
    doctorName: row.doctor_name ?? '',
    doctorNo: row.doctor_no ?? '',
    identityDocument: row.identity_document,
    identityPhotoPath: row.identity_photo_path,
    staffPhotoPath: row.staff_photo_path,
    teachStrokes: row.teach_strokes ?? [],
    suitableBatchIds: row.suitable_batch_ids ?? [],
    achievements: row.achievements ?? '',
    hasLifeguardCert: row.has_lifeguard_cert ?? 'No',
    lifeguardExpiry: formatDateValue(row.lifeguard_expiry),
    lifeguardPhotoPath: row.lifeguard_photo_path,
    certificateDetails: row.certificate_details ?? '',
    certificatePhoto1: row.certificate_photo_1,
    certificatePhoto2: row.certificate_photo_2,
    certificatePhoto3: row.certificate_photo_3,
    postName: row.post_name ?? '',
    salary: row.salary === null || row.salary === undefined ? '' : String(row.salary),
    isActive: row.is_active !== false,
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

staffRegistrationsRouter.get('/', async (req, res) => {
  const accountId = tenantId(req);
  const { rows } = await pool.query(
    `SELECT id, registration_for, full_name, email, whatsapp_mobile, teach_strokes,
            suitable_batch_ids, post_name, salary, is_active, created_at
     FROM staff_registrations
     WHERE saas_account_id = $1
     ORDER BY created_at DESC`,
    [accountId],
  );
  res.json(rows);
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
    res.json(mapStaffDetail(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load staff registration' });
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
    res.json({ id: rows[0].id, isActive: rows[0].is_active });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

staffRegistrationsRouter.delete('/:id', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const id = Number(req.params.id);
    const result = await pool.query(
      `DELETE FROM staff_registrations WHERE id = $1 AND saas_account_id = $2`,
      [id, accountId],
    );
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Staff registration not found' });
      return;
    }
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

      if (!['Coach', 'Lifeguard', 'Other'].includes(body.registrationFor)) {
        res.status(400).json({ error: 'Invalid registration for value' });
        return;
      }

      const mobileRe = /^\d{10}$/;
      if (!mobileRe.test(body.whatsappMobile) || !mobileRe.test(body.emergencyMobile)) {
        res.status(400).json({ error: 'Mobile numbers must be 10 digits' });
        return;
      }
      if (body.otherMobile && !mobileRe.test(body.otherMobile)) {
        res.status(400).json({ error: 'Other mobile number must be 10 digits' });
        return;
      }
      if (body.doctorNo && !mobileRe.test(body.doctorNo)) {
        res.status(400).json({ error: 'Doctor number must be 10 digits' });
        return;
      }
      if (body.hasHealthIssue === 'Yes' && !String(body.healthIssueDetails ?? '').trim()) {
        res.status(400).json({ error: 'Disease / health issue is required' });
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

      const identityPhotoPath =
        files?.identityPhoto?.[0]?.filename || String(current.identity_photo_path ?? '');
      const staffPhotoPath =
        files?.staffPhoto?.[0]?.filename || String(current.staff_photo_path ?? '');
      if (!identityPhotoPath || !staffPhotoPath) {
        res.status(400).json({ error: 'Identity proof and photo are required' });
        return;
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
          identity_photo_path = $18,
          staff_photo_path = $19,
          teach_strokes = $20,
          suitable_batch_ids = $21,
          achievements = $22,
          has_lifeguard_cert = $23,
          lifeguard_expiry = $24,
          lifeguard_photo_path = $25,
          certificate_details = $26,
          certificate_photo_1 = $27,
          certificate_photo_2 = $28,
          certificate_photo_3 = $29,
          is_active = $30,
          post_name = $31,
          salary = $32
        WHERE id = $33 AND saas_account_id = $34
        RETURNING *`,
        [
          body.registrationFor,
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
          id,
          accountId,
        ],
      );

      res.json(mapStaffDetail(rows[0]));
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Update failed';
      if (message.includes('File too large')) {
        res.status(400).json({ error: 'Each photo must be 200 KB or less' });
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

      const mobileRe = /^\d{10}$/;
      if (!mobileRe.test(body.whatsappMobile) || !mobileRe.test(body.emergencyMobile)) {
        res.status(400).json({ error: 'Mobile numbers must be 10 digits' });
        return;
      }
      if (body.otherMobile && !mobileRe.test(body.otherMobile)) {
        res.status(400).json({ error: 'Other mobile number must be 10 digits' });
        return;
      }
      if (body.doctorNo && !mobileRe.test(body.doctorNo)) {
        res.status(400).json({ error: 'Doctor number must be 10 digits' });
        return;
      }
      if (body.hasHealthIssue === 'Yes' && !String(body.healthIssueDetails ?? '').trim()) {
        res.status(400).json({ error: 'Disease / health issue is required' });
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

      const { rows } = await pool.query(
        `INSERT INTO staff_registrations (
          saas_account_id, registration_for, full_name, full_address, whatsapp_mobile, other_mobile, email, birthdate,
          sex, blood_group, emergency_name, emergency_relation, emergency_mobile,
          has_health_issue, health_issue_details, doctor_name, doctor_no, identity_document,
          identity_photo_path, staff_photo_path, teach_strokes, suitable_batch_ids, achievements,
          has_lifeguard_cert, lifeguard_expiry, lifeguard_photo_path, certificate_details,
          certificate_photo_1, certificate_photo_2, certificate_photo_3, accepted_terms
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,TRUE
        )
        RETURNING id, registration_for, full_name, email, created_at`,
        [
          accountId,
          body.registrationFor,
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
        ],
      );

      res.status(201).json(rows[0]);
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
