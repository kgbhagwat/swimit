import { Router } from 'express';
import { pool } from '../db/pool.js';

const TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/;

/** Public (no tenant): resolve a copied WhatsApp pay link to UPI fields. */
export const openUpiPayRouter = Router();

openUpiPayRouter.get('/:token', async (req, res) => {
  const token = String(req.params.token ?? '').trim();
  if (!TOKEN_RE.test(token)) {
    res.status(400).json({ error: 'Invalid payment link' });
    return;
  }
  try {
    const { rows } = await pool.query<{
      expected_amount: string | number;
      pass_type: string;
      upi_details: string | null;
      pool_name: string | null;
    }>(
      `SELECT i.expected_amount, i.pass_type, pci.upi_details, pci.pool_name
         FROM pass_payment_intents i
         JOIN pool_core_info pci ON pci.saas_account_id = i.saas_account_id
        WHERE i.share_token = $1
          AND i.status = 'pending'
        LIMIT 1`,
      [token],
    );
    if (!rows[0] || !String(rows[0].upi_details ?? '').trim()) {
      res.status(404).json({ error: 'This payment link is not valid anymore.' });
      return;
    }
    res.json({
      pa: String(rows[0].upi_details ?? '').trim(),
      pn: String(rows[0].pool_name ?? '').trim() || 'SwimIT',
      am: Number(rows[0].expected_amount),
      tn: `Pass ${String(rows[0].pass_type ?? '').trim()}`.slice(0, 80),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to open payment link' });
  }
});
