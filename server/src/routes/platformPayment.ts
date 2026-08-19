import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pool } from '../db/pool.js';
import { imageOrPdfFileFilter, UPLOAD_MAX_BYTES } from '../uploadFilter.js';

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

const UPI_RE = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;

export const platformPaymentRouter = Router();

function mapRow(row: Record<string, unknown>) {
  return {
    paymentQrPath: row.payment_qr_path ? String(row.payment_qr_path) : null,
    upiId: String(row.upi_id ?? ''),
    updatedAt: row.updated_at,
  };
}

async function ensureRow() {
  await pool.query(
    `INSERT INTO platform_payment_settings (id)
     SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM platform_payment_settings WHERE id = 1)`,
  );
  const { rows } = await pool.query(`SELECT * FROM platform_payment_settings WHERE id = 1`);
  return rows[0];
}

platformPaymentRouter.get('/', async (_req, res) => {
  try {
    const row = await ensureRow();
    res.json(mapRow(row));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load platform payment settings' });
  }
});

platformPaymentRouter.get('/transactions', async (req, res) => {
  try {
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

    const params: string[] = [];
    let where = `WHERE r.status = 'verified'`;
    let limitSql = 'LIMIT 10';

    if (from && to) {
      params.push(from, to);
      where += ` AND r.verified_at::date >= $1::date AND r.verified_at::date <= $2::date`;
      limitSql = 'LIMIT 500';
    }

    const { rows } = await pool.query(
      `SELECT r.id,
              a.account_name,
              a.account_code,
              r.verified_at,
              r.months,
              r.expected_amount,
              r.detected_amount,
              r.transaction_id,
              p.package_name
       FROM saas_package_renewals r
       JOIN saas_accounts a ON a.id = r.saas_account_id
       JOIN service_packages p ON p.id = r.renew_package_id
       ${where}
       ORDER BY r.verified_at DESC NULLS LAST, r.id DESC
       ${limitSql}`,
      params,
    );
    res.json(
      rows.map((row) => ({
        id: Number(row.id),
        accountName: String(row.account_name ?? ''),
        accountCode: String(row.account_code ?? ''),
        paymentDate: row.verified_at
          ? new Date(row.verified_at as string | Date).toISOString()
          : null,
        durationMonths: Number(row.months ?? 0),
        amount: Number(row.detected_amount ?? row.expected_amount ?? 0),
        transactionId: String(row.transaction_id ?? '').trim() || '—',
        packageName: String(row.package_name ?? ''),
      })),
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load payment transactions' });
  }
});

platformPaymentRouter.put('/', upload.single('paymentQr'), async (req, res) => {
  try {
    const body = req.body as Record<string, string>;
    const current = await ensureRow();
    const upiId = String(body.upiId ?? '').trim();
    const clearPaymentQr = String(body.clearPaymentQr ?? '') === '1';

    if (!upiId) {
      res.status(400).json({ error: 'UPI ID is required' });
      return;
    }
    if (!UPI_RE.test(upiId)) {
      res.status(400).json({ error: 'Enter a valid UPI ID (e.g. name@upi)' });
      return;
    }

    const paymentQrPath = req.file?.filename
      ? req.file.filename
      : clearPaymentQr
        ? null
        : current.payment_qr_path
          ? String(current.payment_qr_path)
          : null;

    const { rows } = await pool.query(
      `UPDATE platform_payment_settings
       SET payment_qr_path = $1,
           upi_id = $2,
           updated_at = NOW()
       WHERE id = 1
       RETURNING *`,
      [paymentQrPath, upiId],
    );

    res.json(mapRow(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save platform payment settings' });
  }
});
