import { Router } from 'express';
import { pool } from '../db/pool.js';
import { tenantId } from '../middleware/tenant.js';
import { indiaTodayIso, INDIA_SQL_TODAY } from '../indiaDate.js';
import { normalizeBirthdate } from '../sensitiveData.js';

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

function parseSwimmerId(code: string) {
  const raw = code.trim();
  try {
    const asUrl = new URL(raw);
    const fromPath = asUrl.pathname.match(/\/(?:id-card|pass)\/(\d+)/i);
    if (fromPath) {
      const id = Number(fromPath[1]);
      return Number.isFinite(id) && id > 0 ? id : null;
    }
  } catch {
    // not a URL — fall through to pass-code patterns
  }

  const pathOnly = raw.match(/(?:^|\/)(?:id-card|pass)\/(\d+)(?:\/|$|\?)/i);
  if (pathOnly) {
    const id = Number(pathOnly[1]);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  const match = raw.match(/^(?:SWIMIT[:\-]?|swimIT[:\-]?)(\d+)$/i) || raw.match(/^(\d+)$/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function hasValidPassToday(passValidUntil: string) {
  if (!passValidUntil) return false;
  return passValidUntil >= indiaTodayIso();
}

export const passScanRouter = Router();

passScanRouter.get('/lookup', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const code = String(req.query.code ?? '');
    const id = parseSwimmerId(code);
    if (!id) {
      res.status(400).json({ error: 'Invalid QR code' });
      return;
    }

    const { rows } = await pool.query(
      `SELECT r.id, r.full_name, r.whatsapp_mobile, r.email, r.is_active, r.pass_type, r.batch, r.coach,
              r.pass_valid_until, r.swimmer_photo_path, r.birthdate, r.sex, r.blood_group,
              r.emergency_name, r.emergency_mobile,
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
    const attendance = await pool.query(
      `SELECT id, marked_at
       FROM swimmer_attendance
       WHERE registration_id = $1
         AND saas_account_id = $2
         AND attendance_date = ${INDIA_SQL_TODAY}`,
      [id, accountId],
    );

    res.json({
      id: row.id,
      fullName: row.full_name,
      contact: row.whatsapp_mobile,
      email: row.email,
      isActive: row.is_active !== false,
      passType: row.pass_type ?? '',
      duration: row.pass_duration ?? '',
      batch: row.batch ?? '',
      coach: row.coach ?? '',
      passValidUntil,
      birthdate: formatBirthdate(row.birthdate),
      sex: row.sex ?? '',
      bloodGroup: row.blood_group ?? '',
      emergencyName: row.emergency_name ?? '',
      emergencyMobile: row.emergency_mobile ?? '',
      hasValidPassToday: hasValidPassToday(passValidUntil),
      photoUrl: row.swimmer_photo_path ? `/uploads/${row.swimmer_photo_path}` : null,
      alreadyMarkedToday: Boolean(attendance.rows[0]),
      qrCode: `SWIMIT:${row.id}`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to look up swimmer' });
  }
});

passScanRouter.post('/attendance', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const registrationId = Number(req.body?.registrationId);
    if (!Number.isFinite(registrationId) || registrationId <= 0) {
      res.status(400).json({ error: 'registrationId is required' });
      return;
    }

    const { rows } = await pool.query(
      `SELECT id, full_name, is_active, pass_valid_until
       FROM registrations
       WHERE id = $1 AND saas_account_id = $2`,
      [registrationId, accountId],
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'Swimmer not found' });
      return;
    }

    const swimmer = rows[0];
    if (swimmer.is_active === false) {
      res.status(400).json({ error: 'Swimmer is inactive' });
      return;
    }
    const passValidUntil = formatPlainDate(swimmer.pass_valid_until);
    if (!hasValidPassToday(passValidUntil)) {
      res.status(400).json({ error: 'Pass is not valid today' });
      return;
    }

    const inserted = await pool.query(
      `INSERT INTO swimmer_attendance (saas_account_id, registration_id, attendance_date)
       VALUES ($1, $2, ${INDIA_SQL_TODAY})
       ON CONFLICT (registration_id, attendance_date) DO NOTHING
       RETURNING id, attendance_date, marked_at`,
      [accountId, registrationId],
    );

    if (!inserted.rows[0]) {
      res.status(200).json({
        ok: true,
        alreadyMarked: true,
        message: 'Attendance already marked for today',
        fullName: swimmer.full_name,
      });
      return;
    }

    res.status(201).json({
      ok: true,
      alreadyMarked: false,
      message: 'Attendance marked for today',
      fullName: swimmer.full_name,
      attendanceDate: formatPlainDate(inserted.rows[0].attendance_date),
      markedAt: inserted.rows[0].marked_at,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to mark attendance' });
  }
});
