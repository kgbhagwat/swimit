import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { recordAudit } from '../auditLog.js';
import { pool } from '../db/pool.js';
import { parseGoogleMapsLocation } from '../googleMapsLocation.js';
import { tenantId } from '../middleware/tenant.js';
import {
  imageOrPdfFileFilter,
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
  fileFilter: imageOrPdfFileFilter,
});

export const poolCoreInfoRouter = Router();

function truthyFlag(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const v = String(value).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function mapRow(row: Record<string, unknown>) {
  const lat =
    row.latitude === null || row.latitude === undefined || row.latitude === ''
      ? null
      : Number(row.latitude);
  const lng =
    row.longitude === null || row.longitude === undefined || row.longitude === ''
      ? null
      : Number(row.longitude);
  const hasCoords = Number.isFinite(lat as number) && Number.isFinite(lng as number);
  return {
    poolName: String(row.pool_name ?? ''),
    poolAddress: String(row.pool_address ?? ''),
    shortcutName: String(row.shortcut_name ?? ''),
    poolState: String(row.pool_state ?? ''),
    poolDistrict: String(row.pool_district ?? ''),
    pinCode: String(row.pin_code ?? ''),
    googleMapsUrl: String(row.google_maps_url ?? ''),
    locationSet: hasCoords,
    latitude: hasCoords ? lat : null,
    longitude: hasCoords ? lng : null,
    poolLogoPath: row.pool_logo_path ? String(row.pool_logo_path) : null,
    swimmerTerms: String(row.swimmer_terms ?? ''),
    staffTerms: String(row.staff_terms ?? ''),
    paymentAcceptCash: row.payment_accept_cash !== false,
    paymentAcceptOnline: row.payment_accept_online !== false,
    paymentQrPath: row.payment_qr_path ? String(row.payment_qr_path) : null,
    upiDetails: String(row.upi_details ?? ''),
    setupCompleted: row.setup_completed === true,
    updatedAt: row.updated_at,
  };
}

async function ensureRow(accountId: number) {
  await pool.query(
    `INSERT INTO pool_core_info (saas_account_id)
     SELECT $1 WHERE NOT EXISTS (
       SELECT 1 FROM pool_core_info WHERE saas_account_id = $1
     )`,
    [accountId],
  );
  const { rows } = await pool.query(
    `SELECT * FROM pool_core_info WHERE saas_account_id = $1`,
    [accountId],
  );
  return rows[0];
}

poolCoreInfoRouter.get('/', async (req, res) => {
  try {
    const accountId = tenantId(req);
    const row = await ensureRow(accountId);
    const mapped = mapRow(row);
    if (req.publicTenantAccess) {
      res.json({
        ...mapped,
        upiDetails: '',
        paymentQrPath: null,
      });
      return;
    }
    res.json(mapped);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load pool core info' });
  }
});

poolCoreInfoRouter.put(
  '/',
  upload.fields([
    { name: 'poolLogo', maxCount: 1 },
    { name: 'paymentQr', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const accountId = tenantId(req);
      const body = req.body as Record<string, string>;
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const current = await ensureRow(accountId);

      const poolName = String(body.poolName ?? '').trim();
      const poolAddress = String(body.poolAddress ?? '').trim();
      const shortcutName = String(body.shortcutName ?? '').trim().slice(0, 80);
      const poolState = String(body.poolState ?? '').trim();
      const poolDistrict = String(body.poolDistrict ?? '').trim();
      const pinCode = String(body.pinCode ?? '').trim();
      const swimmerTerms = String(body.swimmerTerms ?? '');
      const staffTerms = String(body.staffTerms ?? '');
      const upiDetails = String(body.upiDetails ?? '').trim();
      const paymentAcceptCash = truthyFlag(body.paymentAcceptCash, true);
      const paymentAcceptOnline = truthyFlag(body.paymentAcceptOnline, true);

      const googleMapsUrlRaw =
        body.googleMapsUrl === undefined ? undefined : String(body.googleMapsUrl ?? '').trim();
      let nextLatitude: number | null =
        current.latitude == null ? null : Number(current.latitude);
      let nextLongitude: number | null =
        current.longitude == null ? null : Number(current.longitude);
      let nextGoogleMapsUrl = String(current.google_maps_url ?? '');
      if (googleMapsUrlRaw !== undefined) {
        if (!googleMapsUrlRaw) {
          nextLatitude = null;
          nextLongitude = null;
          nextGoogleMapsUrl = '';
        } else {
          const parsed = await parseGoogleMapsLocation(googleMapsUrlRaw);
          if (!parsed.ok) {
            res.status(400).json({ error: parsed.error });
            return;
          }
          nextLatitude = parsed.value.latitude;
          nextLongitude = parsed.value.longitude;
          nextGoogleMapsUrl = parsed.value.googleMapsUrl;
        }
      }
      if (
        (nextLatitude == null) !== (nextLongitude == null) ||
        (nextLatitude != null && !Number.isFinite(nextLatitude)) ||
        (nextLongitude != null && !Number.isFinite(nextLongitude))
      ) {
        nextLatitude = null;
        nextLongitude = null;
      }

      if (!poolName) {
        res.status(400).json({ error: 'Pool name is required' });
        return;
      }
      if (!poolAddress) {
        res.status(400).json({ error: 'Pool address is required' });
        return;
      }
      if (pinCode && !/^[1-9][0-9]{5}$/.test(pinCode)) {
        res.status(400).json({ error: 'Enter a 6-digit PIN code' });
        return;
      }
      if (!paymentAcceptCash && !paymentAcceptOnline) {
        res.status(400).json({ error: 'Select at least one payment option (Cash or Online)' });
        return;
      }
      if (
        upiDetails &&
        !/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/.test(upiDetails)
      ) {
        res.status(400).json({ error: 'Enter a valid UPI ID (e.g. name@upi)' });
        return;
      }

      const clearPoolLogo = String(body.clearPoolLogo ?? '') === '1';
      const clearPaymentQr = String(body.clearPaymentQr ?? '') === '1';

      const poolLogoPath = files?.poolLogo?.[0]?.filename
        ? files.poolLogo[0].filename
        : clearPoolLogo
          ? null
          : current.pool_logo_path
            ? String(current.pool_logo_path)
            : null;
      const paymentQrPath = files?.paymentQr?.[0]?.filename
        ? files.paymentQr[0].filename
        : clearPaymentQr
          ? null
          : current.payment_qr_path
            ? String(current.payment_qr_path)
            : null;

      if (paymentAcceptOnline) {
        if (!paymentQrPath) {
          res.status(400).json({ error: 'Payment QR code is required when Online is selected' });
          return;
        }
        if (!upiDetails) {
          res.status(400).json({ error: 'UPI ID is required when Online is selected' });
          return;
        }
      }

      const { rows } = await pool.query(
        `UPDATE pool_core_info SET
           pool_name = $1,
           pool_address = $2,
           shortcut_name = $3,
           pool_state = $4,
           pool_district = $5,
           pin_code = $6,
           latitude = $7,
           longitude = $8,
           google_maps_url = $9,
           pool_logo_path = $10,
           swimmer_terms = $11,
           staff_terms = $12,
           payment_accept_cash = $13,
           payment_accept_online = $14,
           payment_qr_path = $15,
           upi_details = $16,
           setup_completed = TRUE,
           updated_at = NOW()
         WHERE saas_account_id = $17
         RETURNING *`,
        [
          poolName,
          poolAddress,
          shortcutName,
          poolState,
          poolDistrict,
          pinCode,
          nextLatitude,
          nextLongitude,
          nextGoogleMapsUrl,
          poolLogoPath,
          swimmerTerms,
          staffTerms,
          paymentAcceptCash,
          paymentAcceptOnline,
          paymentQrPath,
          upiDetails,
          accountId,
        ],
      );

      const saved = mapRow(rows[0]);
      await recordAudit(req, {
        action: 'update',
        entityType: 'pool_core_info',
        entityId: accountId,
        entityLabel: saved.poolName || 'Core info',
        summary: 'Updated pool core info',
        details: {
          poolName: saved.poolName,
          shortcutName: saved.shortcutName,
          poolAddress: saved.poolAddress,
          poolState: saved.poolState,
          poolDistrict: saved.poolDistrict,
          pinCode: saved.pinCode,
          googleMapsUrl: saved.googleMapsUrl,
          locationSet: saved.locationSet,
          paymentAcceptCash: saved.paymentAcceptCash,
          paymentAcceptOnline: saved.paymentAcceptOnline,
          upiDetails: saved.upiDetails,
        },
      });
      res.json(saved);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to save pool core info' });
    }
  },
);
