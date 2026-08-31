import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordAudit } from '../auditLog.js';
import { pool } from '../db/pool.js';
import { tenantId } from '../middleware/tenant.js';
import {
  resolveWebsiteLayoutConfig,
  standardWebsiteLayoutJson,
} from '../poolWebsiteLayout.js';
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

function uploadedFilename(
  files: Express.Multer.File[] | Record<string, Express.Multer.File[]> | undefined,
  fieldName: string,
) {
  if (Array.isArray(files)) {
    return files.find((file) => file.fieldname === fieldName)?.filename;
  }
  return files?.[fieldName]?.[0]?.filename;
}

function nextPhotoPath(
  files: Express.Multer.File[] | Record<string, Express.Multer.File[]> | undefined,
  body: Record<string, unknown>,
  current: Record<string, unknown>,
  field: (typeof PHOTO_FIELDS)[number],
) {
  const uploaded = uploadedFilename(files, field.file);
  if (uploaded) return uploaded;
  if (String(body[field.clear] ?? '') === '1') return null;
  const existing = current[field.column];
  return existing ? String(existing) : null;
}

type StoredCustomBox = {
  id: string;
  title: string;
  body: string;
  rect: { x: number; y: number; w: number; h: number };
  photoPath: string | null;
};

function parseCustomBoxes(raw: unknown): StoredCustomBox[] {
  const customRaw = Array.isArray(raw) ? raw : [];
  return customRaw
    .slice(0, 8)
    .map((item, index) => {
      const box = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      const title = String(box.title ?? '').trim().slice(0, 120);
      const body = String(box.body ?? '').trim().slice(0, 2000);
      const photoPath = String(box.photoPath ?? '').trim() || null;
      if (!title && !body && !photoPath) return null;
      const id = String(box.id ?? '').trim() || `custom-${index + 1}`;
      const fallback = { x: 50, y: Math.min(66 + index * 4, 82), w: 33.34, h: 28 };
      let rect = parseLayoutRect(box.rect, fallback);
      if (!box.rect && (box.widthFr != null || box.colFr != null)) {
        const widthPct = Number(box.widthFr ?? box.colFr ?? 100);
        rect = clampLayoutRect({ ...fallback, w: (widthPct / 100) * 33.34 });
      }
      return { id, title, body, rect, photoPath };
    })
    .filter((box): box is StoredCustomBox => box !== null);
}

function mergeCustomBoxPhotos(
  incoming: StoredCustomBox[],
  existing: StoredCustomBox[],
  files: Express.Multer.File[] | Record<string, Express.Multer.File[]> | undefined,
  body: Record<string, unknown>,
): StoredCustomBox[] {
  const existingById = new Map(existing.map((box) => [box.id, box]));
  return incoming.map((box, index) => {
    const uploaded = uploadedFilename(files, `customBoxPhoto_${index}`);
    const cleared = String(body[`clearCustomBoxPhoto_${index}`] ?? '') === '1';
    const prevPath = existingById.get(box.id)?.photoPath ?? null;
    let photoPath = prevPath;
    if (uploaded) photoPath = uploaded;
    else if (cleared) photoPath = null;
    return { ...box, photoPath: photoPath || null };
  });
}

function layoutConfigForApi(layout: ReturnType<typeof parseLayoutConfig>) {
  return {
    ...layout,
    customBoxes: layout.customBoxes.map((box) => ({
      id: box.id,
      title: box.title,
      body: box.body,
      rect: box.rect,
      photoUrl: box.photoPath ? photoUrl(box.photoPath) : null,
    })),
  };
}

async function ensureRow(accountId: number) {
  await pool.query(
    `INSERT INTO pool_website (saas_account_id, layout_config)
     SELECT $1, $2::jsonb WHERE NOT EXISTS (
       SELECT 1 FROM pool_website WHERE saas_account_id = $1
     )`,
    [accountId, standardWebsiteLayoutJson()],
  );
  const { rows } = await pool.query(`SELECT * FROM pool_website WHERE saas_account_id = $1`, [
    accountId,
  ]);
  return rows[0];
}

function parseShowCoachPhotos(raw: unknown) {
  if (raw === true || raw === 1) return true;
  const value = String(raw ?? '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'on' || value === 'yes';
}

const LAYOUT_RECT_MIN = 6;

function roundRect(n: number) {
  return Math.round(n * 10) / 10;
}

function clampLayoutRect(rect: {
  x: number;
  y: number;
  w: number;
  h: number;
  hidden?: boolean;
}) {
  const w = Math.max(LAYOUT_RECT_MIN, Math.min(100, rect.w));
  const h = Math.max(LAYOUT_RECT_MIN, Math.min(100, rect.h));
  const x = Math.max(0, Math.min(100 - w, rect.x));
  const y = Math.max(0, Math.min(100 - h, rect.y));
  const next: { x: number; y: number; w: number; h: number; hidden?: boolean } = {
    x: roundRect(x),
    y: roundRect(y),
    w: roundRect(w),
    h: roundRect(h),
  };
  if (rect.hidden) next.hidden = true;
  return next;
}

function parseLayoutRect(
  raw: unknown,
  fallback: { x: number; y: number; w: number; h: number; hidden?: boolean },
) {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return clampLayoutRect({
    x: Number(row.x ?? fallback.x),
    y: Number(row.y ?? fallback.y),
    w: Number(row.w ?? fallback.w),
    h: Number(row.h ?? fallback.h),
    hidden: row.hidden === true ? true : fallback.hidden,
  });
}

function defaultLayoutConfig() {
  const introH = 14;
  const colY = introH;
  const colH = 100 - introH;
  const colW = 50 / 3;
  return {
    banner: { x: 0, y: 0, w: 50, h: 50 },
    story: { x: 0, y: 50, w: 50, h: 50 },
    intro: { x: 50, y: 0, w: 50, h: introH },
    batches: { x: 50, y: colY, w: colW, h: colH },
    coaches: { x: 50 + colW, y: colY, w: colW, h: colH },
    achievements: { x: 50 + colW * 2, y: colY, w: colW, h: colH },
    customBoxes: [] as StoredCustomBox[],
  };
}

function migrateFrLayout(row: Record<string, unknown>, defaults: ReturnType<typeof defaultLayoutConfig>) {
  const leftFr = Number(row.leftColFr ?? 100);
  const rightFr = Number(row.rightColFr ?? 100);
  const bannerFr = Number(row.bannerRowFr ?? 100);
  const storyFr = Number(row.storyRowFr ?? 100);
  const introFr = Number(row.introRowFr ?? 100);
  const columnsFr = Number(row.columnsRowFr ?? row.batchesRowFr ?? 100);
  const customFr = Number(row.customRowFr ?? 80);
  const customRaw = Array.isArray(row.customBoxes) ? row.customBoxes : [];
  const hasCustom = customRaw.length > 0;
  const boardTotal = introFr + columnsFr + (hasCustom ? customFr : 0);
  const leftW = (leftFr / (leftFr + rightFr)) * 100;
  const bannerH = (bannerFr / (bannerFr + storyFr)) * 100;
  const introH = (introFr / boardTotal) * 100;
  const colsH = (columnsFr / boardTotal) * 100;
  const customH = hasCustom ? (customFr / boardTotal) * 100 : 0;
  const bFr = Number(row.batchesColFr ?? 100);
  const cFr = Number(row.coachesColFr ?? 100);
  const panelTotal = bFr + cFr + Number(row.achievementsColFr ?? 100);
  const bW = (bFr / panelTotal) * (100 - leftW);
  const cW = (cFr / panelTotal) * (100 - leftW);

  return {
    banner: clampLayoutRect({ x: 0, y: 0, w: leftW, h: bannerH }),
    story: clampLayoutRect({ x: 0, y: bannerH, w: leftW, h: 100 - bannerH }),
    intro: clampLayoutRect({ x: leftW, y: 0, w: 100 - leftW, h: introH }),
    batches: clampLayoutRect({ x: leftW, y: introH, w: bW, h: hasCustom ? colsH : 100 - introH }),
    coaches: clampLayoutRect({ x: leftW + bW, y: introH, w: cW, h: hasCustom ? colsH : 100 - introH }),
    achievements: clampLayoutRect({
      x: leftW + bW + cW,
      y: introH,
      w: 100 - leftW - bW - cW,
      h: hasCustom ? 100 - introH - customH : 100 - introH,
    }),
    customBoxes: parseCustomBoxes(row.customBoxes).map((box, i) =>
      hasCustom && Math.abs(box.rect.y - (66 + i * 4)) < 2
        ? { ...box, rect: clampLayoutRect({ x: leftW, y: introH + colsH, w: bW + cW, h: customH || 28 }) }
        : box,
    ),
  };
}

function parseLayoutConfig(raw: unknown) {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      value = {};
    }
  }
  const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const defaults = defaultLayoutConfig();

  if (row.banner && typeof row.banner === 'object') {
    return {
      banner: parseLayoutRect(row.banner, defaults.banner),
      story: parseLayoutRect(row.story, defaults.story),
      intro: parseLayoutRect(row.intro, defaults.intro),
      batches: parseLayoutRect(row.batches, defaults.batches),
      coaches: parseLayoutRect(row.coaches, defaults.coaches),
      achievements: parseLayoutRect(row.achievements, defaults.achievements),
      customBoxes: parseCustomBoxes(row.customBoxes),
    };
  }

  if (row.leftColFr != null || row.bannerRowFr != null) {
    return migrateFrLayout(row, defaults);
  }

  return { ...defaults, customBoxes: parseCustomBoxes(row.customBoxes) };
}

async function publicLists(accountId: number, showCoachPhotos = false) {
  const [batchesRes, coachesRes, poolRes] = await Promise.all([
    pool.query(
      `SELECT name, type, start_time, end_time
       FROM batch_slots
       WHERE saas_account_id = $1
       ORDER BY start_time ASC, name ASC, id ASC`,
      [accountId],
    ),
    pool.query(
      `SELECT full_name, registration_for, post_name, staff_photo_path
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
      photoUrl:
        showCoachPhotos && row.staff_photo_path
          ? photoUrl(row.staff_photo_path)
          : null,
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
    achievementsPhotoUrl: photoUrl(row.achievements_photo_path),
    themeColor: parseThemeColor(row.theme_color),
    showCoachPhotos: row.show_coach_photos === true,
    layoutConfig: layoutConfigForApi(
      resolveWebsiteLayoutConfig(parseLayoutConfig(row.layout_config)),
    ),
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
    const lists = await publicLists(accountId, row.show_coach_photos === true);
    res.json(mapWebsite(row, lists));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load pool website' });
  }
});

poolWebsiteRouter.put(
  '/',
  upload.any(),
  async (req, res) => {
    try {
      if (req.publicTenantAccess) {
        res.status(403).json({ error: 'Sign in to edit the pool website' });
        return;
      }
      const accountId = tenantId(req);
      const current = await ensureRow(accountId);
      const body = req.body as Record<string, unknown>;
      const files = req.files as Express.Multer.File[] | undefined;
      const achievements = parseAchievements(body.achievements);
      const existingLayout = parseLayoutConfig(current.layout_config);
      const incomingLayout = parseLayoutConfig(body.layoutConfig);
      const layoutConfig = {
        ...incomingLayout,
        customBoxes: mergeCustomBoxPhotos(
          incomingLayout.customBoxes,
          existingLayout.customBoxes,
          files,
          body,
        ),
      };
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
                achievements_photo_path = $12,
                theme_color = $13,
                show_coach_photos = $14,
                layout_config = $15::jsonb,
                batches_photo_path = NULL,
                coaches_photo_path = NULL,
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
          photos.achievements_photo_path,
          parseThemeColor(body.themeColor),
          parseShowCoachPhotos(body.showCoachPhotos),
          JSON.stringify(layoutConfig),
        ],
      );
      await recordAudit(req, {
        action: 'update',
        entityType: 'pool_website',
        entityId: String(accountId),
        summary: 'Updated pool website',
      });
      const lists = await publicLists(accountId, rows[0].show_coach_photos === true);
      res.json(mapWebsite(rows[0], lists));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to save pool website' });
    }
  },
);
