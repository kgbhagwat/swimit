import { pool } from './db/pool.js';

/** In-app notice for account admins (e.g. package renewal status). */
export async function createAccountNotification(params: {
  saasAccountId: number;
  kind?: 'package';
  title: string;
  body: string;
}) {
  try {
    await pool.query(
      `INSERT INTO account_notifications (saas_account_id, kind, title, body)
       VALUES ($1, $2, $3, $4)`,
      [params.saasAccountId, params.kind ?? 'package', params.title, params.body],
    );
  } catch (err) {
    console.error('[account_notifications] failed to create', err);
  }
}
