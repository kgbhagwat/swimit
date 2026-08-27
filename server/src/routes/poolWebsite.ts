import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordAudit } from '../auditLog.js';
import { pool } from '../db/pool.js';
import { tenantId } from '../middleware/tenant.js';
import {
  isAllowedImageOrPdf,
  randomUploadFilename,
  UPLOAD_MAX_BYTES,
} from '../uploadFilter.js';

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
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase();
    if (!mime.startsWith('image/') || !isAllowedImageOrPdf(file)) {
      cb(new Error('Only image files are allowed'));
      return;
    }
    cb(null, true);
  },
});

const PHOTO_FIELDS = [
  { file: 'bannerPhoto', clear: 'clearBannerPhoto', column: 'banner_photo_path' },
  { file: 'historyPhoto', clear: 'clearHistoryPhoto', column: 'history_photo_path' },
  { file: 'infoPhoto', clear: 'clearInfoPhoto', column: 'info_photo_path' },
  { file: 'batchesPhoto', clear: 'clearBatchesPhoto', column: 'batches_photo_path' },
  { file: 'coachesPhoto', clear: 'clearCoachesPhoto', column: 'coaches_photo_path' },
  { file: 'achievementsPhoto', clear: 'clearAchievementsPhoto', column: 'achievements_photo_path' },
] as const;

type Achievement = { title: string; detail: string };

function parseAchievements(raw: unknown): Achievement[] {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 12)
    .map((item) => {
      const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      return {
        title: String(row.title ?? '').trim().slice(0, 120),
        detail: String(row.detail ?? '').trim().slice(0, 500),
      };
    })
    .filter((row) => row.title || row.detail);
}

function formatTimeValue(value: unknown) {
  if (typeof value === 'string') return value.slice(0, 5);
  if (value instanceof Date) {
    const h = String(value.getUTCHours()).padStart(2, '0');
    const m = String(value.getUTCMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
  return String(value ?? '').slice(0, 5);
}

function photoUrl(filename: unknown) {
  const value = String(filename ?? '').trim();
  return value ? `/uploads/${value}` : null;
}

function nextPhotoPath(
  files: Record<string, Express.Multer.File[]> | undefined,
  body: Record<string, unknown>,
  current: Record<string, unknown>,
  field: (typeof PHOTO_FIELDS)[number],
) {
  const uploaded = files?.[field.file]?.[0]?.filename;
  if (uploaded) return uploaded;
  if (String(body[field.clear] ?? '') === '1') return null;
  const existing = current[field.column];
  return existing ? String(existing) : null;
}

async function ensureRow(accountId: number) {
  await pool.query(
    `INSERT INTO pool_website (saas_account_id)
     SELECT $1 WHERE NOT EXISTS (
       SELECT 1 FROM pool_website WHERE saas_account_id = $1
     )`,
    [accountId],
  );
  const { rows } = await pool.query(`SELECT * FROM pool_website WHERE saas_account_id = $1`, [
    accountId,
  ]);
  return rows[0];
}

async function publicLists(accountId: number) {
  const [batchesRes, coachesRes, poolRes] = await Promise.all([
    pool.query(
      `SELECT name, type, start_time, end_time
       FROM batch_slots
       WHERE saas_account_id = $1
       ORDER BY start_time ASC, name ASC, id ASC`,
      [accountId],
    ),
    pool.query(
      `SELECT full_name, registration_for, post_name
       FROM staff_registrations
       WHERE saas_account_id = $1
         AND COALESCE(is_active, TRUE) = TRUE
         AND (
           registration_for ILIKE '%coach%'
           OR COALESCE(post_name, '') ILIKE '%coach%'
         )
       ORDER BY full_name ASC, id ASC`,
      [accountId],
    ),
    pool.query(
      `SELECT pool_name, pool_address, pool_logo_path
       FROM pool_core_info
       WHERE saas_account_id = $1
       LIMIT 1`,
      [accountId],
    ),
  ]);

  const poolRow = poolRes.rows[0] as
    | { pool_name?: string; pool_address?: string; pool_logo_path?: string | null }
    | undefined;

  return {
    poolName: String(poolRow?.pool_name ?? '').trim(),
    poolAddress: String(poolRow?.pool_address ?? '').trim(),
    poolLogoUrl: poolRow?.pool_logo_path ? `/uploads/${poolRow.pool_logo_path}` : null,
    batches: batchesRes.rows.map((row) => ({
      name: String(row.name ?? '').trim(),
      type: String(row.type ?? '').trim(),
      startTime: formatTimeValue(row.start_time),
      endTime: formatTimeValue(row.end_time),
    })),
    coaches: coachesRes.rows.map((row) => ({
      name: String(row.full_name ?? '').trim(),
      role: String(row.post_name || row.registration_for || 'Coach').trim() || 'Coach',
    })),
  };
}

function parseThemeColor(raw: unknown) {
  const value = String(raw ?? '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    const [r, g, b] = value.slice(1);
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return '#1e88c8';
}

function mapWebsite(row: Record<string, unknown>, lists: Awaited<ReturnType<typeof publicLists>>) {
  return {
    about: String(row.about_text ?? ''),
    history: String(row.history_text ?? ''),
    openingHours: String(row.opening_hours ?? ''),
    facilities: String(row.facilities_text ?? ''),
    batchesText: String(row.batches_text ?? ''),
    coachesText: String(row.coaches_text ?? ''),
    achievements: parseAchievements(row.achievements),
    bannerPhotoUrl: photoUrl(row.banner_photo_path),
    historyPhotoUrl: photoUrl(row.history_photo_path),
    infoPhotoUrl: photoUrl(row.info_photo_path),
    batchesPhotoUrl: photoUrl(row.batches_photo_path),
    coachesPhotoUrl: photoUrl(row.coaches_photo_path),
    achievementsPhotoUrl: photoUrl(row.achievements_photo_path),
    themeColor: parseThemeColor(row.theme_color),
    ...lists,
    poolName: lists.poolName,
    poolAddress: lists.poolAddress,
    poolLogoUrl: lists.poolLogoUrl,
  };
}

export const poolWebsiteRouter = Router();

poolWebsiteRouter.get('/', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const row = await ensureRow(accountId);
    const lists = await publicLists(accountId);
    res.json(mapWebsite(row, lists));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load pool website' });
  }
});

poolWebsiteRouter.put(
  '/',
  upload.fields(PHOTO_FIELDS.map((field) => ({ name: field.file, maxCount: 1 }))),
  async (req, res) => {
    try {
      if (req.publicTenantAccess) {
        res.status(403).json({ error: 'Sign in to edit the pool website' });
        return;
      }
      const accountId = tenantId(req);
      const current = await ensureRow(accountId);
      const body = req.body as Record<string, unknown>;
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const achievements = parseAchievements(body.achievements);
      const photos = Object.fromEntries(
        PHOTO_FIELDS.map((field) => [field.column, nextPhotoPath(files, body, current, field)]),
      );
      const { rows } = await pool.query(
        `UPDATE pool_website
            SET about_text = $2,
                history_text = $3,
                opening_hours = $4,
                facilities_text = $5,
                batches_text = $6,
                coaches_text = $7,
                achievements = $8::jsonb,
                banner_photo_path = $9,
                history_photo_path = $10,
                info_photo_path = $11,
                batches_photo_path = $12,
                coaches_photo_path = $13,
                achievements_photo_path = $14,
                theme_color = $15,
                updated_at = NOW()
          WHERE saas_account_id = $1
          RETURNING *`,
        [
          accountId,
          String(body.about ?? '').slice(0, 2000),
          String(body.history ?? '').slice(0, 4000),
          String(body.openingHours ?? '').trim().slice(0, 200),
          String(body.facilities ?? '').slice(0, 1000),
          String(body.batchesText ?? '').slice(0, 1000),
          String(body.coachesText ?? '').slice(0, 1000),
          JSON.stringify(achievements),
          photos.banner_photo_path,
          photos.history_photo_path,
          photos.info_photo_path,
          photos.batches_photo_path,
          photos.coaches_photo_path,
          photos.achievements_photo_path,
          parseThemeColor(body.themeColor),
        ],
      );
      await recordAudit(req, {
        action: 'update',
        entityType: 'pool_website',
        entityId: String(accountId),
        summary: 'Updated pool website',
      });
      const lists = await publicLists(accountId);
      res.json(mapWebsite(rows[0], lists));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to save pool website' });
    }
  },
);
