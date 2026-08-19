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
import { imageOrPdfFileFilter, UPLOAD_MAX_BYTES } from '../uploadFilter.js';
import {
  notifyPassIssued,
  notifyPassPaymentRequest,
  notifyRegistrationConfirmation,
} from '../whatsapp/notify.js';
import { maybeNotifyBatchCoachOverLimit, checkBatchCoachCapacity } from '../batchCapacity.js';
import { newPaymentShareToken, whatsAppPayShareUrl } from '../upiPayQr.js';
import { maybeNotifyPackageSwimmerCapacity } from '../packageCapacityWarnings.js';
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

function isLadiesBatchLabel(batch: string) {
  return /—\s*Ladies\s*—/i.test(batch.trim());
}

async function assertLadiesBatchForFemaleSwimmer(
  accountId: number,
  registrationId: number,
  batch: string | null | undefined,
): Promise<string | null> {
  const label = String(batch ?? '').trim();
  if (!label || !isLadiesBatchLabel(label)) return null;
  const { rows } = await pool.query(
    `SELECT sex FROM registrations WHERE id = $1 AND saas_account_id = $2`,
    [registrationId, accountId],
  );
  const sex = String(rows[0]?.sex ?? '').trim();
  if (sex !== 'Female') {
    return 'Ladies batch is allowed for Female swimmers only';
  }
  return null;
}

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
  limits: { fileSize: UPLOAD_MAX_BYTES },
  fileFilter: imageOrPdfFileFilter,
});

export const registrationsRouter = Router();

let inactiveAtReady: Promise<void> | null = null;

/** Ensure inactive_at exists even if db:init was skipped or ran an older build. */
async function ensureInactiveAtColumn() {
  if (!inactiveAtReady) {
    inactiveAtReady = (async () => {
      await pool.query(
        `ALTER TABLE registrations ADD COLUMN IF NOT EXISTS inactive_at TIMESTAMPTZ`,
      );
    })().catch((err) => {
      inactiveAtReady = null;
      throw err;
    });
  }
  await inactiveAtReady;
}

async function deactivateExpiredPasses(accountId: number) {
  try {
    await ensureInactiveAtColumn();
    // Pass expired → inactive immediately. They remain on Pass Payment for 3 days
    // via inactive_at / pass_valid_until window in pending-payment.
    await pool.query(
      `UPDATE registrations
       SET is_active = FALSE,
           inactive_at = COALESCE(inactive_at, NOW())
       WHERE saas_account_id = $1
         AND pass_valid_until IS NOT NULL
         AND pass_valid_until < CURRENT_DATE
         AND is_active = TRUE`,
      [accountId],
    );
    // Unpaid / no pass yet should not appear as active
    await pool.query(
      `UPDATE registrations
       SET is_active = FALSE,
           inactive_at = COALESCE(inactive_at, NOW())
       WHERE saas_account_id = $1
         AND pass_valid_until IS NULL
         AND is_active = TRUE`,
      [accountId],
    );
  } catch (err) {
    // Never block Swimmer List / Pass Payment if this maintenance step fails.
    console.warn('[pass] deactivateExpiredPasses failed', err);
  }
}

function mapRegistrationRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    whatsapp_mobile: row.whatsapp_mobile,
    birthdate: formatBirthdate(row.birthdate),
    sex: row.sex,
    blood_group: row.blood_group,
    is_active: row.is_active,
    pass_type: row.pass_type,
    batch: row.batch,
    coach: row.coach,
    pass_valid_until: formatPlainDate(row.pass_valid_until),
    inactive_at: row.inactive_at
      ? formatPlainDate(row.inactive_at) || String(row.inactive_at).slice(0, 10)
      : null,
    created_at: row.created_at,
    pending_type: row.pending_type,
  };
}

registrationsRouter.get('/', async (req, res) => {
  try {
    const accountId = tenantId(req);
    await ensureInactiveAtColumn();
    await deactivateExpiredPasses(accountId);
    const { rows } = await pool.query(
      `SELECT id, full_name, email, whatsapp_mobile, birthdate, sex, blood_group,
              is_active, pass_type, batch, coach, pass_valid_until, inactive_at, created_at
       FROM registrations
       WHERE saas_account_id = $1
       ORDER BY created_at DESC`,
      [accountId],
    );
    res.json(rows.map(mapRegistrationRow));
  } catch (err) {
    console.error('[registrations] GET / failed', err);
    res.status(500).json({
      error: 'Failed to load swimmers',
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

registrationsRouter.get('/pending-payment', async (req, res) => {
  try {
    const accountId = tenantId(req);
    await ensureInactiveAtColumn();
    await deactivateExpiredPasses(accountId);
    const { rows } = await pool.query(
      `SELECT r.id, r.full_name, r.email, r.whatsapp_mobile, r.birthdate, r.sex, r.blood_group,
              r.is_active, r.pass_type, r.batch, r.coach, r.pass_valid_until, r.created_at,
              CASE
                WHEN r.pass_valid_until IS NULL THEN 'New'
                ELSE 'Expired'
              END AS pending_type,
              EXISTS (
                SELECT 1 FROM pass_payment_intents i
                WHERE i.registration_id = r.id AND i.status = 'pending'
              ) AS awaiting_whatsapp
       FROM registrations r
       WHERE r.saas_account_id = $1
         AND (
           -- New / unpaid registrations
           r.pass_valid_until IS NULL
           OR (
             -- Pass expired within last 3 days
             r.pass_valid_until < CURRENT_DATE
             AND r.pass_valid_until >= (CURRENT_DATE - INTERVAL '3 days')
           )
           OR (
             -- Manually (or auto) marked inactive: visible for 3 days
             COALESCE(r.is_active, FALSE) = FALSE
             AND r.inactive_at IS NOT NULL
             AND r.inactive_at::date >= (CURRENT_DATE - INTERVAL '3 days')
           )
         )
       ORDER BY
         CASE WHEN r.pass_valid_until IS NULL THEN 0 ELSE 1 END,
         r.created_at DESC`,
      [accountId],
    );
    res.json(
      rows.map((row) => ({
        ...mapRegistrationRow(row),
        awaitingWhatsApp: row.awaiting_whatsapp === true,
      })),
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load pending payments' });
  }
});

registrationsRouter.get('/pass-payments/recent', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const fromRaw = String(req.query.from ?? '').trim();
    const toRaw = String(req.query.to ?? '').trim();
    const from = /^\d{4}-\d{2}-\d{2}$/.test(fromRaw) ? fromRaw : '';
    const to = /^\d{4}-\d{2}-\d{2}$/.test(toRaw) ? toRaw : '';

    if ((from && !to) || (!from && to)) {
      res.status(400).json({ error: 'Provide both from and to dates (YYYY-MM-DD)' });
      return;
    }
    if (from && to && from > to) {
      res.status(400).json({ error: 'From date must be on or before to date' });
      return;
    }

    const params: Array<string | number> = [accountId];
    let where = `WHERE p.saas_account_id = $1`;
    let limitSql = 'LIMIT 10';
    if (from && to) {
      params.push(from, to);
      where += ` AND p.payment_date >= $2::date AND p.payment_date <= $3::date`;
      limitSql = 'LIMIT 500';
    }

    const { rows } = await pool.query(
      `SELECT p.id, p.swimmer_name, p.pass_type, p.amount, p.payment_date, p.payment_mode,
              p.transaction_id, r.whatsapp_mobile
       FROM pass_payments p
       LEFT JOIN registrations r ON r.id = p.registration_id
       ${where}
       ORDER BY p.payment_date DESC, p.id DESC
       ${limitSql}`,
      params,
    );
    res.json(
      rows.map((row) => ({
        id: Number(row.id),
        swimmerName: String(row.swimmer_name ?? ''),
        passType: String(row.pass_type ?? ''),
        amount: Number(row.amount ?? 0),
        paymentDate: row.payment_date
          ? String(row.payment_date).slice(0, 10)
          : null,
        paymentMode: String(row.payment_mode ?? ''),
        transactionId: String(row.transaction_id ?? '').trim() || '—',
        mobile: String(row.whatsapp_mobile ?? ''),
      })),
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load pass payments' });
  }
});

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

registrationsRouter.get('/assignment-count', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const batch = String(req.query.batch ?? '').trim();
    const coach = String(req.query.coach ?? '').trim();
    const excludeId = Number(req.query.excludeId ?? 0);

    if (!batch || !coach) {
      res.status(400).json({ error: 'batch and coach are required' });
      return;
    }

    const params: Array<string | number> = [accountId, batch, coach];
    let excludeSql = '';
    if (Number.isFinite(excludeId) && excludeId > 0) {
      params.push(excludeId);
      excludeSql = ` AND id <> $${params.length}`;
    }

    const { rows } = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM registrations
       WHERE saas_account_id = $1
         AND is_active = TRUE
         AND LOWER(TRIM(COALESCE(batch, ''))) = LOWER(TRIM($2::text))
         AND LOWER(TRIM(COALESCE(coach, ''))) = LOWER(TRIM($3::text))
         ${excludeSql}`,
      params,
    );

    res.json({ count: Number(rows[0]?.count ?? 0) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to count swimmers for batch and coach' });
  }
});

registrationsRouter.get('/:id', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid swimmer id' });
      return;
    }

    const { rows } = await pool.query(
      `SELECT r.id, r.full_name, r.full_address, r.whatsapp_mobile, r.other_mobile, r.email,
              r.birthdate, r.sex, r.blood_group,
              r.is_active, r.pass_type, r.batch, r.coach, r.pass_valid_until,
              r.swimmer_photo_path, r.identity_document, r.identity_number, r.identity_photo_path,
              r.has_health_issue, r.health_issue_details, r.doctor_name, r.doctor_no,
              r.emergency_name, r.emergency_relation, r.emergency_mobile,
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
    const passValidUntil = formatPlainDate(row.pass_valid_until);
    res.json({
      id: row.id,
      fullName: row.full_name,
      fullAddress: row.full_address ?? '',
      contact: row.whatsapp_mobile ?? '',
      whatsappMobile: row.whatsapp_mobile ?? '',
      otherMobile: row.other_mobile ?? '',
      email: row.email ?? '',
      birthdate: formatBirthdate(row.birthdate),
      sex: row.sex ?? '',
      bloodGroup: row.blood_group ?? '',
      isActive: row.is_active !== false,
      passType: row.pass_type ?? '',
      duration: row.pass_duration ?? '',
      batch: row.batch ?? '',
      coach: row.coach ?? '',
      passValidUntil,
      photoUrl: row.swimmer_photo_path ? `/uploads/${row.swimmer_photo_path}` : null,
      identityDocument: revealIdentityDocument(row.identity_document),
      identityNumber: revealIdentityNumber(row.identity_number),
      identityNumberMasked: maskIdentityNumber(revealIdentityNumber(row.identity_number)),
      identityPhotoUrl: row.identity_photo_path
        ? `/api/registrations/${row.id}/identity-photo?accountId=${accountId}`
        : null,
      hasHealthIssue: row.has_health_issue ?? '',
      healthIssueDetails: row.health_issue_details ?? '',
      doctorName: row.doctor_name ?? '',
      doctorNo: row.doctor_no ?? '',
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

registrationsRouter.get('/:id/identity-photo', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid swimmer id' });
      return;
    }
    const { rows } = await pool.query(
      `SELECT identity_photo_path
       FROM registrations
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

function registrationHasCurrentPass(passType: string | null | undefined, passValidUntil: string | null) {
  const type = String(passType ?? '').trim();
  if (!type || type === '—') return false;
  if (!passValidUntil) return true;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 3);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  return passValidUntil.slice(0, 10) >= cutoffIso;
}

registrationsRouter.delete('/:id', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid swimmer id' });
      return;
    }

    const existing = await pool.query(
      `SELECT id, full_name, is_active, pass_type, pass_valid_until
       FROM registrations
       WHERE id = $1 AND saas_account_id = $2`,
      [id, accountId],
    );
    const row = existing.rows[0];
    if (!row) {
      res.status(404).json({ error: 'Swimmer not found' });
      return;
    }

    const isActive = row.is_active !== false;
    const until = formatPlainDate(row.pass_valid_until) || null;
    const onActiveList = isActive && registrationHasCurrentPass(row.pass_type, until);
    if (onActiveList) {
      res.status(400).json({ error: 'Deactivate the swimmer before deleting' });
      return;
    }

    await pool.query(`DELETE FROM registrations WHERE id = $1 AND saas_account_id = $2`, [
      id,
      accountId,
    ]);
    await recordAudit(req, {
      action: 'delete',
      entityType: 'swimmer',
      entityId: row.id,
      entityLabel: String(row.full_name ?? ''),
      summary: 'Deleted inactive swimmer',
    });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete swimmer' });
  }
});

registrationsRouter.patch('/:id', async (req, res) => {
  try {
    const accountId = tenantId(req);
    await ensureInactiveAtColumn();
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

    if (body.batch !== undefined) {
      const ladiesError = await assertLadiesBatchForFemaleSwimmer(
        accountId,
        id,
        body.batch,
      );
      if (ladiesError) {
        res.status(400).json({ error: ladiesError });
        return;
      }
    }

    if (isPassPayment) {
      const capacity = await checkBatchCoachCapacity({
        saasAccountId: accountId,
        registrationId: id,
        passType: String(body.passType ?? '').trim(),
        batch: String(body.batch ?? '').trim(),
        coach: body.coach,
      });
      if (capacity.overLimit && !capacity.exceedingAllowed && capacity.limit != null) {
        res.status(400).json({
          error: `This batch already has ${capacity.count} swimmers with this coach (limit ${capacity.limit}). Exceeding the limit is not allowed for this pass type.`,
        });
        return;
      }
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
    // Single inactive_at assignment (Postgres rejects setting the same column twice).
    if (isPassPayment || body.isActive === true) {
      updates.push(`inactive_at = NULL`);
    } else if (body.isActive === false) {
      updates.push(`inactive_at = NOW()`);
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
      const whatsapp = await notifyPassIssued({
        mobile: String(updated.whatsapp_mobile),
        fullName: String(updated.full_name),
        passType: passName,
        passValidUntil: String(updated.pass_valid_until).slice(0, 10),
        registrationId: Number(updated.id),
        accountCode: String(account.rows[0]?.account_code ?? ''),
        saasAccountId: accountId,
      }).catch((err) => {
        console.warn('[whatsapp] pass notify failed', err);
        return {
          skipped: true as const,
          error: err instanceof Error ? err.message : 'WhatsApp send failed',
        };
      });

      void maybeNotifyBatchCoachOverLimit({
        saasAccountId: accountId,
        registrationId: Number(updated.id),
        swimmerName: String(updated.full_name),
        passType: passName,
        batch: String(updated.batch ?? ''),
        coach: updated.coach,
        source: 'desk_payment',
      }).catch((err) => console.warn('[whatsapp] batch capacity notify failed', err));

      void maybeNotifyPackageSwimmerCapacity(accountId).catch((err) =>
        console.warn('[whatsapp] package capacity notify failed', err),
      );

      await recordAudit(req, {
        action: 'update',
        entityType: 'swimmer',
        entityId: updated.id,
        entityLabel: String(updated.full_name ?? ''),
        summary: 'Recorded pass payment / renewed pass',
        details: {
          passType: body.passType,
          passValidUntil: body.passValidUntil,
          paymentMode,
          batch: updated.batch,
          coach: updated.coach,
        },
      });
      res.json({ ...updated, whatsapp });
      return;
    }

    if (body.isActive === true) {
      void maybeNotifyPackageSwimmerCapacity(accountId).catch((err) =>
        console.warn('[whatsapp] package capacity notify failed', err),
      );
    }

    const action =
      body.isActive === false ? 'deactivate' : body.isActive === true ? 'activate' : 'update';
    await recordAudit(req, {
      action,
      entityType: 'swimmer',
      entityId: updated.id,
      entityLabel: String(updated.full_name ?? ''),
      summary:
        action === 'activate'
          ? 'Activated swimmer'
          : action === 'deactivate'
            ? 'Deactivated swimmer'
            : 'Updated swimmer',
      details: {
        batch: updated.batch,
        isActive: updated.is_active,
        passType: updated.pass_type,
        coach: updated.coach,
      },
    });
    res.json(updated);
  } catch (err) {
    console.error('[registrations] PATCH /:id failed', err);
    res.status(500).json({
      error: 'Failed to update swimmer',
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

registrationsRouter.post('/:id/resend-pass', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid swimmer id' });
      return;
    }

    const { rows } = await pool.query(
      `SELECT id, full_name, whatsapp_mobile, is_active, pass_type, pass_valid_until
       FROM registrations
       WHERE id = $1 AND saas_account_id = $2`,
      [id, accountId],
    );
    const swimmer = rows[0];
    if (!swimmer) {
      res.status(404).json({ error: 'Swimmer not found' });
      return;
    }
    if (!swimmer.is_active) {
      res.status(400).json({ error: 'Only active swimmers can receive a pass resend' });
      return;
    }
    const passType = String(swimmer.pass_type ?? '').trim();
    if (!passType) {
      res.status(400).json({ error: 'Swimmer does not have an active pass type' });
      return;
    }
    const mobile = String(swimmer.whatsapp_mobile ?? '').trim();
    if (!mobile) {
      res.status(400).json({ error: 'Swimmer WhatsApp mobile is missing' });
      return;
    }
    if (!swimmer.pass_valid_until) {
      res.status(400).json({ error: 'Swimmer pass validity date is missing' });
      return;
    }

    const account = await pool.query(
      `SELECT account_code FROM saas_accounts WHERE id = $1`,
      [accountId],
    );
    const notify = await notifyPassIssued({
      mobile,
      fullName: String(swimmer.full_name),
      passType,
      passValidUntil: String(swimmer.pass_valid_until).slice(0, 10),
      registrationId: Number(swimmer.id),
      accountCode: String(account.rows[0]?.account_code ?? ''),
      saasAccountId: accountId,
    });

    if ('skipped' in notify && notify.skipped) {
      res.status(502).json({
        error:
          'error' in notify && typeof notify.error === 'string'
            ? notify.error
            : 'WhatsApp is not configured or send was skipped',
        whatsapp: notify,
      });
      return;
    }

    res.json({
      ok: true,
      message: 'Full pass and QR resent on WhatsApp',
      whatsapp: notify,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to resend pass on WhatsApp',
    });
  }
});

registrationsRouter.put(
  '/:id',
  upload.fields([
    { name: 'identityPhoto', maxCount: 1 },
    { name: 'swimmerPhoto', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const accountId = tenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid swimmer id' });
        return;
      }

      const body = req.body as Record<string, string>;
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;

      const existing = await pool.query(
        `SELECT * FROM registrations WHERE id = $1 AND saas_account_id = $2`,
        [id, accountId],
      );
      if (!existing.rows[0]) {
        res.status(404).json({ error: 'Swimmer not found' });
        return;
      }
      const current = existing.rows[0] as Record<string, unknown>;

      const required = [
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
      const identityNumber = String(body.identityNumber ?? '').trim();
      const numberError = identityNumberError(identityNumber);
      if (numberError) {
        res.status(400).json({ error: numberError });
        return;
      }

      const identityPhoto = files?.identityPhoto?.[0];
      const swimmerPhoto = files?.swimmerPhoto?.[0];
      let identityPhotoPath = identityPhoto?.filename
        ? identityPhoto.filename
        : current.identity_photo_path
          ? String(current.identity_photo_path)
          : null;
      const swimmerPhotoPath = swimmerPhoto?.filename
        ? swimmerPhoto.filename
        : current.swimmer_photo_path
          ? String(current.swimmer_photo_path)
          : null;

      if (!identityPhotoPath || !swimmerPhotoPath) {
        res.status(400).json({ error: 'Identity proof and swimmer photo are required' });
        return;
      }

      if (identityPhoto?.filename) {
        identityPhotoPath = await sealUploadFile(uploadDir, identityPhoto.filename);
      }

      if (!isValidPersonName(body.fullName) || !isValidPersonName(body.emergencyName)) {
        res.status(400).json({ error: NAME_INVALID_MSG });
        return;
      }
      if (!isValidMobile(body.whatsappMobile) || !isValidMobile(body.emergencyMobile)) {
        res.status(400).json({ error: MOBILE_INVALID_MSG });
        return;
      }
      if (body.otherMobile && !isValidMobile(body.otherMobile)) {
        res.status(400).json({ error: 'Other mobile number must be a valid 10-digit number' });
        return;
      }
      if (body.doctorNo && !isValidMobile(body.doctorNo)) {
        res.status(400).json({ error: 'Doctor number must be a valid 10-digit number' });
        return;
      }
      const email = String(body.email ?? '').trim();
      if (email && (!email.includes('@') || !email.includes('.') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
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
        if (!isValidPersonName(body.parentName) || !String(body.parentRelation ?? '').trim()) {
          res.status(400).json({ error: 'Parent information is required for swimmers under 18' });
          return;
        }
        if (!isValidMobile(String(body.parentMobile ?? ''))) {
          res.status(400).json({ error: MOBILE_INVALID_MSG });
          return;
        }
      } else {
        const emergency = body.emergencyMobile.trim();
        if (
          emergency === body.whatsappMobile.trim() ||
          (body.otherMobile?.trim() && emergency === body.otherMobile.trim())
        ) {
          res.status(400).json({
            error: 'Emergency contact number cannot be the same as the applicant mobile number',
          });
          return;
        }
      }

      if (!needsParent) {
        if (
          await isMobileTakenInAccount({
            accountId,
            mobile: body.whatsappMobile,
            kind: 'swimmer',
            excludeId: id,
          })
        ) {
          res.status(400).json({ error: duplicateMobileMessage('swimmer') });
          return;
        }
        if (
          await isEmailTakenInAccount({
            accountId,
            email: body.email,
            kind: 'swimmer',
            excludeId: id,
          })
        ) {
          res.status(400).json({ error: duplicateEmailMessage('swimmer') });
          return;
        }
      }

      const { rows } = await pool.query(
        `UPDATE registrations SET
          full_name = $1,
          full_address = $2,
          whatsapp_mobile = $3,
          other_mobile = $4,
          email = $5,
          birthdate = $6,
          sex = $7,
          blood_group = $8,
          emergency_name = $9,
          emergency_relation = $10,
          emergency_mobile = $11,
          has_health_issue = $12,
          health_issue_details = $13,
          doctor_name = $14,
          doctor_no = $15,
          identity_document = $16,
          identity_number = $17,
          identity_photo_path = $18,
          swimmer_photo_path = $19,
          parent_name = $20,
          parent_relation = $21,
          parent_mobile = $22,
          is_adult = $23
         WHERE id = $24 AND saas_account_id = $25
         RETURNING id, full_name, email`,
        [
          body.fullName.trim(),
          body.fullAddress.trim(),
          body.whatsappMobile.trim(),
          body.otherMobile?.trim() || null,
          String(body.email ?? '').trim().toLowerCase(),
          sealBirthdate(body.birthdate).sealed,
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
          swimmerPhotoPath,
          needsParent ? body.parentName.trim() : null,
          needsParent ? body.parentRelation.trim() : null,
          needsParent ? body.parentMobile.trim() : null,
          !needsParent,
          id,
          accountId,
        ],
      );

      await recordAudit(req, {
        action: 'update',
        entityType: 'swimmer',
        entityId: rows[0].id,
        entityLabel: String(rows[0].full_name ?? ''),
        summary: 'Updated swimmer registration',
        details: { email: rows[0].email },
      });
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to update swimmer';
      if (message.includes('File too large')) {
        res.status(400).json({ error: 'Each photo must be 200 KB or less' });
        return;
      }
      if (message.toLowerCase().includes('unique') || message.toLowerCase().includes('duplicate')) {
        res.status(400).json({
          error: 'This WhatsApp mobile or email is already used by another adult swimmer in this account',
        });
        return;
      }
      res.status(500).json({ error: message });
    }
  },
);

registrationsRouter.post('/:id/pass-payment-intent', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid swimmer id' });
      return;
    }

    const body = req.body as {
      passType?: string;
      batch?: string;
      coach?: string | null;
      passValidUntil?: string;
    };
    const passType = String(body.passType ?? '').trim();
    const batch = String(body.batch ?? '').trim();
    const coach = String(body.coach ?? '').trim();
    const passValidUntil = String(body.passValidUntil ?? '').trim().slice(0, 10);

    if (!passType) {
      res.status(400).json({ error: 'Select a pass type' });
      return;
    }
    if (!batch) {
      res.status(400).json({ error: 'Select a batch' });
      return;
    }

    const ladiesError = await assertLadiesBatchForFemaleSwimmer(accountId, id, batch);
    if (ladiesError) {
      res.status(400).json({ error: ladiesError });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(passValidUntil)) {
      res.status(400).json({ error: 'Pass valid-until date is required' });
      return;
    }

    const capacity = await checkBatchCoachCapacity({
      saasAccountId: accountId,
      registrationId: id,
      passType,
      batch,
      coach,
    });
    if (capacity.overLimit && !capacity.exceedingAllowed && capacity.limit != null) {
      res.status(400).json({
        error: `This batch already has ${capacity.count} swimmers with this coach (limit ${capacity.limit}). Exceeding the limit is not allowed for this pass type.`,
      });
      return;
    }

    const { rows: regRows } = await pool.query(
      `SELECT id, full_name, whatsapp_mobile
       FROM registrations
       WHERE id = $1 AND saas_account_id = $2`,
      [id, accountId],
    );
    if (!regRows[0]) {
      res.status(404).json({ error: 'Swimmer not found' });
      return;
    }

    const mobile = String(regRows[0].whatsapp_mobile ?? '').replace(/\D/g, '').slice(-10);
    if (mobile.length !== 10) {
      res.status(400).json({ error: 'Swimmer WhatsApp mobile is required' });
      return;
    }

    const passRes = await pool.query(
      `SELECT pass_charges, coaching_charges
       FROM pass_types
       WHERE saas_account_id = $1
         AND LOWER(TRIM(pass_name)) = LOWER(TRIM($2))
       LIMIT 1`,
      [accountId, passType],
    );
    if (!passRes.rows[0]) {
      res.status(400).json({ error: 'Pass type not found' });
      return;
    }
    const passCharges = Number(passRes.rows[0].pass_charges ?? 0);
    const coachingCharges = Number(passRes.rows[0].coaching_charges ?? 0);
    const expectedAmount = Math.round((passCharges + coachingCharges) * 100) / 100;
    if (expectedAmount <= 0) {
      res.status(400).json({ error: 'Pass amount must be greater than zero' });
      return;
    }

    const poolPay = await pool.query(
      `SELECT pool_name, upi_details, payment_qr_path, payment_accept_online
       FROM pool_core_info WHERE saas_account_id = $1 LIMIT 1`,
      [accountId],
    );
    if (poolPay.rows[0]?.payment_accept_online === false) {
      res.status(400).json({ error: 'Online payment is not enabled for this pool' });
      return;
    }
    const upiId = String(poolPay.rows[0]?.upi_details ?? '').trim();
    const poolName = String(poolPay.rows[0]?.pool_name ?? '').trim();
    const paymentQrPath = poolPay.rows[0]?.payment_qr_path
      ? String(poolPay.rows[0].payment_qr_path)
      : null;
    if (!upiId && !paymentQrPath) {
      res.status(400).json({
        error: 'Set pool payment QR / UPI in Pool Core Info before requesting WhatsApp payment',
      });
      return;
    }
    if (!upiId) {
      res.status(400).json({
        error: 'Set pool UPI ID in Pool Core Info to send an amount-filled payment QR',
      });
      return;
    }

    await pool.query(
      `UPDATE pass_payment_intents
       SET status = 'cancelled', notes = 'Superseded by new payment request'
       WHERE registration_id = $1 AND status = 'pending'`,
      [id],
    );

    const shareToken = newPaymentShareToken();
    const { rows: intentRows } = await pool.query(
      `INSERT INTO pass_payment_intents
       (saas_account_id, registration_id, from_mobile, pass_type, batch, coach,
        pass_valid_until, expected_amount, pass_charges, coaching_charges, status, share_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10, 'pending', $11)
       RETURNING id, created_at, share_token`,
      [
        accountId,
        id,
        mobile,
        passType,
        batch,
        coach,
        passValidUntil,
        expectedAmount,
        passCharges,
        coachingCharges,
        shareToken,
      ],
    );

    const shareUrl = whatsAppPayShareUrl(
      String(intentRows[0].share_token ?? shareToken),
      String(req.get('origin') ?? ''),
    );
    const notify = await notifyPassPaymentRequest({
      mobile,
      fullName: String(regRows[0].full_name),
      passType,
      amount: expectedAmount,
      passValidUntil,
      upiId,
      paymentQrPath,
      saasAccountId: accountId,
      poolName: poolName || undefined,
      shareUrl,
    });

    void maybeNotifyBatchCoachOverLimit({
      saasAccountId: accountId,
      registrationId: id,
      swimmerName: String(regRows[0].full_name),
      passType,
      batch,
      coach,
      source: 'whatsapp_request',
    }).catch((err) => console.warn('[whatsapp] batch capacity notify failed', err));

    res.json({
      ok: true,
      intent: {
        id: Number(intentRows[0].id),
        expectedAmount,
        passType,
        passValidUntil,
        createdAt: intentRows[0].created_at,
      },
      payment: { upiId, paymentQrPath },
      message: notify.message,
      payLink: notify.payLink,
      whatsapp: notify,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create pass payment request' });
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
      const identityNumber = String(body.identityNumber ?? '').trim();
      const numberError = identityNumberError(identityNumber);
      if (numberError) {
        res.status(400).json({ error: numberError });
        return;
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

      if (!isValidPersonName(body.fullName) || !isValidPersonName(body.emergencyName)) {
        res.status(400).json({ error: NAME_INVALID_MSG });
        return;
      }
      if (!isValidMobile(body.whatsappMobile) || !isValidMobile(body.emergencyMobile)) {
        res.status(400).json({ error: MOBILE_INVALID_MSG });
        return;
      }
      if (body.otherMobile && !isValidMobile(body.otherMobile)) {
        res.status(400).json({ error: 'Other mobile number must be a valid 10-digit number' });
        return;
      }
      if (body.doctorNo && !isValidMobile(body.doctorNo)) {
        res.status(400).json({ error: 'Doctor number must be a valid 10-digit number' });
        return;
      }
      const email = String(body.email ?? '').trim();
      if (email && (!email.includes('@') || !email.includes('.') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
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
        if (!isValidPersonName(body.parentName) || !String(body.parentRelation ?? '').trim()) {
          res.status(400).json({ error: 'Parent information is required for swimmers under 18' });
          return;
        }
        if (!isValidMobile(String(body.parentMobile ?? ''))) {
          res.status(400).json({ error: MOBILE_INVALID_MSG });
          return;
        }
      } else {
        const emergency = body.emergencyMobile.trim();
        if (
          emergency === body.whatsappMobile.trim() ||
          (body.otherMobile?.trim() && emergency === body.otherMobile.trim())
        ) {
          res.status(400).json({
            error: 'Emergency contact number cannot be the same as the applicant mobile number',
          });
          return;
        }
      }

      // Adults: one WhatsApp mobile / email per account. Under-18 may share parent contact.
      if (!needsParent) {
        if (
          await isMobileTakenInAccount({
            accountId,
            mobile: body.whatsappMobile,
            kind: 'swimmer',
          })
        ) {
          res.status(400).json({ error: duplicateMobileMessage('swimmer') });
          return;
        }
        if (
          await isEmailTakenInAccount({
            accountId,
            email: body.email,
            kind: 'swimmer',
          })
        ) {
          res.status(400).json({ error: duplicateEmailMessage('swimmer') });
          return;
        }
      }

      const sealedBirth = sealBirthdate(body.birthdate);
      const sealedIdentityPhoto = await sealUploadFile(uploadDir, identityPhoto.filename);

      const { rows } = await pool.query(
        `INSERT INTO registrations (
          saas_account_id, full_name, full_address, whatsapp_mobile, other_mobile, email, birthdate,
          sex, blood_group, emergency_name, emergency_relation, emergency_mobile,
          has_health_issue, health_issue_details, doctor_name, doctor_no, identity_document,
          identity_number, identity_photo_path, swimmer_photo_path, accepted_terms, is_active,
          parent_name, parent_relation, parent_mobile, is_adult
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,TRUE,FALSE,$21,$22,$23,$24
        )
        RETURNING id, full_name, email, created_at`,
        [
          accountId,
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
          swimmerPhoto.filename,
          needsParent ? body.parentName.trim() : null,
          needsParent ? body.parentRelation.trim() : null,
          needsParent ? body.parentMobile.trim() : null,
          sealedBirth.isAdult,
        ],
      );

      await recordAudit(req, {
        action: 'create',
        entityType: 'swimmer',
        entityId: rows[0].id,
        entityLabel: String(rows[0].full_name ?? ''),
        summary: 'Created swimmer registration',
        details: { email: rows[0].email },
      });
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
      if (message.toLowerCase().includes('unique') || message.toLowerCase().includes('duplicate')) {
        res.status(400).json({
          error: 'This WhatsApp mobile or email is already used by another adult swimmer in this account',
        });
        return;
      }
      res.status(500).json({ error: message });
    }
  },
);
