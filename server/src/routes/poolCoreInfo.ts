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

export const poolCoreInfoRouter = Router();

function truthyFlag(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const v = String(value).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function mapRow(row: Record<string, unknown>) {
  return {
    poolName: String(row.pool_name ?? ''),
    poolAddress: String(row.pool_address ?? ''),
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
    res.json(mapRow(row));
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
      const swimmerTerms = String(body.swimmerTerms ?? '');
      const staffTerms = String(body.staffTerms ?? '');
      const upiDetails = String(body.upiDetails ?? '').trim();
      const paymentAcceptCash = truthyFlag(body.paymentAcceptCash, true);
      const paymentAcceptOnline = truthyFlag(body.paymentAcceptOnline, true);

      if (!poolName) {
        res.status(400).json({ error: 'Pool name is required' });
        return;
      }
      if (!poolAddress) {
        res.status(400).json({ error: 'Pool address is required' });
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
           pool_logo_path = $3,
           swimmer_terms = $4,
           staff_terms = $5,
           payment_accept_cash = $6,
           payment_accept_online = $7,
           payment_qr_path = $8,
           upi_details = $9,
           setup_completed = TRUE,
           updated_at = NOW()
         WHERE saas_account_id = $10
         RETURNING *`,
        [
          poolName,
          poolAddress,
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

      res.json(mapRow(rows[0]));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to save pool core info' });
    }
  },
);
