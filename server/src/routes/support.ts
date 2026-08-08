import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db/pool.js';
import { requireTenant, tenantId } from '../middleware/tenant.js';
import {
  ensureRenewSessionTable,
  getRenewChoicesForAccount,
  handleSupportRenewReply,
  isRenewStartCommand,
  startManualRenewPrompt,
} from '../supportChatRenew.js';

export const supportRouter = Router();

type AuthorRole = 'account_admin' | 'platform';
type TicketCategory = 'complaint' | 'suggestion';
type TicketStatus = 'open' | 'closed';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.resolve(__dirname, '../../uploads/support');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const supportUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase();
    const ok =
      mime.startsWith('image/') ||
      mime === 'application/pdf' ||
      mime === 'application/msword' ||
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mime === 'application/vnd.ms-excel' ||
      mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mime === 'text/plain';
    if (!ok) {
      cb(new Error('Only images, PDF, Word, Excel, or text files are allowed'));
      return;
    }
    cb(null, true);
  },
});

function trimText(value: unknown, max = 4000) {
  return String(value ?? '')
    .trim()
    .slice(0, max);
}

function parseCategory(value: unknown): TicketCategory | null {
  const v = String(value ?? '')
    .trim()
    .toLowerCase();
  if (v === 'complaint' || v === 'suggestion') return v;
  return null;
}

function parseStatus(value: unknown): TicketStatus | null {
  const v = String(value ?? '')
    .trim()
    .toLowerCase();
  if (v === 'open' || v === 'closed') return v;
  return null;
}

function parseUserId(value: unknown) {
  const id = Number(value);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

async function isPlatformAccount(accountId: number) {
  const { rows } = await pool.query<{ account_code: string }>(
    `SELECT account_code FROM saas_accounts WHERE id = $1`,
    [accountId],
  );
  return String(rows[0]?.account_code ?? '').toLowerCase() === 'swimit';
}

async function requirePlatformTenant(req: Request, res: Response): Promise<number | null> {
  const accountId = tenantId(req);
  if (!(await isPlatformAccount(accountId))) {
    res.status(403).json({ error: 'Platform support access required' });
    return null;
  }
  return accountId;
}

async function resolveAccountUser(accountId: number, userId: number) {
  const { rows } = await pool.query<{
    id: number;
    user_name: string;
    is_account_admin: boolean;
  }>(
    `SELECT id, user_name, COALESCE(is_account_admin, false) AS is_account_admin
     FROM app_users
     WHERE id = $1 AND saas_account_id = $2`,
    [userId, accountId],
  );
  return rows[0] ?? null;
}

function mapTicket(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    saasAccountId: Number(row.saas_account_id),
    accountCode: row.account_code != null ? String(row.account_code) : undefined,
    accountName: row.account_name != null ? String(row.account_name) : undefined,
    createdByUserId: row.created_by_user_id != null ? Number(row.created_by_user_id) : null,
    createdByUserName:
      row.created_by_user_name != null ? String(row.created_by_user_name) : null,
    category: String(row.category) as TicketCategory,
    subject: String(row.subject ?? ''),
    status: String(row.status) as TicketStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: row.message_count != null ? Number(row.message_count) : undefined,
    lastMessageAt: row.last_message_at ?? null,
    lastMessagePreview:
      row.last_message_preview != null ? String(row.last_message_preview) : null,
  };
}

function mapMessage(row: Record<string, unknown>) {
  const attachmentPath = String(row.attachment_path ?? '').trim();
  return {
    id: Number(row.id),
    ticketId: Number(row.ticket_id),
    saasAccountId: Number(row.saas_account_id),
    authorUserId: row.author_user_id != null ? Number(row.author_user_id) : null,
    authorUserName: row.author_user_name != null ? String(row.author_user_name) : null,
    authorRole: String(row.author_role) as AuthorRole,
    body: String(row.body ?? ''),
    attachmentPath: attachmentPath || null,
    attachmentName: String(row.attachment_name ?? '').trim() || null,
    attachmentMime: String(row.attachment_mime ?? '').trim() || null,
    attachmentUrl: attachmentPath ? `/uploads/support/${attachmentPath}` : null,
    createdAt: row.created_at,
  };
}

async function loadTicketMessages(ticketId: number, accountId: number) {
  const { rows } = await pool.query(
    `SELECT m.*, u.user_name AS author_user_name
     FROM support_ticket_messages m
     LEFT JOIN app_users u ON u.id = m.author_user_id
     WHERE m.ticket_id = $1 AND m.saas_account_id = $2
     ORDER BY m.created_at ASC, m.id ASC`,
    [ticketId, accountId],
  );
  return rows.map((row) => mapMessage(row as Record<string, unknown>));
}

async function countUnreadSupportForAccount(accountId: number) {
  const { rows } = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM support_ticket_messages m
     JOIN support_tickets t ON t.id = m.ticket_id
     WHERE t.saas_account_id = $1
       AND m.author_role = 'platform'
       AND m.created_at > COALESCE(t.account_last_read_at, TIMESTAMPTZ 'epoch')`,
    [accountId],
  );
  return Number(rows[0]?.count ?? 0);
}

async function countUnreadPackageForAccount(accountId: number) {
  const { rows } = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM account_notifications
     WHERE saas_account_id = $1 AND read_at IS NULL AND kind = 'package'`,
    [accountId],
  );
  return Number(rows[0]?.count ?? 0);
}

async function markAccountInboxRead(accountId: number) {
  await pool.query(
    `UPDATE support_tickets
     SET account_last_read_at = NOW()
     WHERE saas_account_id = $1`,
    [accountId],
  );
  await pool.query(
    `UPDATE account_notifications
     SET read_at = NOW()
     WHERE saas_account_id = $1 AND read_at IS NULL`,
    [accountId],
  );
}

/** Account admin: unread support replies + package notices for header badge. */
supportRouter.get('/inbox-summary', requireTenant, async (req, res) => {
  try {
    const accountId = tenantId(req);
    if (await isPlatformAccount(accountId)) {
      res.status(403).json({ error: 'Use platform support inbox for SwimIT staff' });
      return;
    }
    const supportUnread = await countUnreadSupportForAccount(accountId);
    const packageUnread = await countUnreadPackageForAccount(accountId);
    const { rows: notices } = await pool.query(
      `SELECT id, kind, title, body, created_at, read_at
       FROM account_notifications
       WHERE saas_account_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 20`,
      [accountId],
    );
    res.json({
      supportUnread,
      packageUnread,
      unreadCount: supportUnread + packageUnread,
      notifications: notices.map((row) => ({
        id: Number(row.id),
        kind: String(row.kind),
        title: String(row.title ?? ''),
        body: String(row.body ?? ''),
        createdAt: row.created_at,
        readAt: row.read_at,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load inbox summary' });
  }
});

async function getOrCreateChannel(params: {
  accountId: number;
  createdByUserId: number | null;
  accountCode?: string;
  accountName?: string;
}) {
  const existing = await pool.query(
    `SELECT t.*, u.user_name AS created_by_user_name
     FROM support_tickets t
     LEFT JOIN app_users u ON u.id = t.created_by_user_id
     WHERE t.saas_account_id = $1 AND t.status = 'open'
     ORDER BY t.updated_at DESC, t.id DESC
     LIMIT 1`,
    [params.accountId],
  );
  if (existing.rows[0]) {
    return mapTicket({
      ...(existing.rows[0] as Record<string, unknown>),
      account_code: params.accountCode,
      account_name: params.accountName,
    });
  }
  const created = await pool.query(
    `INSERT INTO support_tickets (
       saas_account_id, created_by_user_id, category, subject, status,
       account_last_read_at
     ) VALUES ($1, $2, 'complaint', 'Support', 'open', NOW())
     RETURNING *`,
    [params.accountId, params.createdByUserId],
  );
  return mapTicket({
    ...(created.rows[0] as Record<string, unknown>),
    account_code: params.accountCode,
    account_name: params.accountName,
    created_by_user_name: null,
    message_count: 0,
  });
}

/** Account admin: open the single support chat channel (create if needed). */
supportRouter.get('/channel', requireTenant, async (req, res) => {
  try {
    const accountId = tenantId(req);
    if (await isPlatformAccount(accountId)) {
      res.status(403).json({ error: 'Use platform support channel for SwimIT staff' });
      return;
    }
    const authorUserId = parseUserId(req.query.authorUserId);
    if (!authorUserId) {
      res.status(400).json({ error: 'authorUserId is required' });
      return;
    }
    const author = await resolveAccountUser(accountId, authorUserId);
    if (!author?.is_account_admin) {
      res.status(403).json({ error: 'Only account admins can open support chat' });
      return;
    }
    const ticket = await getOrCreateChannel({
      accountId,
      createdByUserId: authorUserId,
    });
    await pool.query(
      `UPDATE support_tickets
       SET account_last_read_at = NOW()
       WHERE id = $1 AND saas_account_id = $2`,
      [ticket.id, accountId],
    );
    const messages = await loadTicketMessages(ticket.id, accountId);
    await ensureRenewSessionTable();
    const renewChoices = await getRenewChoicesForAccount(accountId);
    res.json({ ticket, messages, renewChoices });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to open support chat' });
  }
});

/** Platform: open the single chat channel for one pool account. */
supportRouter.get('/platform/channel', requireTenant, async (req, res) => {
  try {
    const platformAccountId = await requirePlatformTenant(req, res);
    if (!platformAccountId) return;
    // Prefer targetAccountId — query accountId is also used by requireTenant as a
    // fallback tenant id, which must stay as the SwimIT platform account.
    const targetAccountId =
      parseUserId(req.query.targetAccountId) ?? parseUserId(req.query.accountId);
    const authorUserId = parseUserId(req.query.authorUserId);
    if (!targetAccountId) {
      res.status(400).json({ error: 'targetAccountId is required' });
      return;
    }
    if (!authorUserId) {
      res.status(400).json({ error: 'authorUserId is required' });
      return;
    }
    const author = await resolveAccountUser(platformAccountId, authorUserId);
    if (!author) {
      res.status(403).json({ error: 'Platform user not found for this account' });
      return;
    }
    const target = await pool.query<{ id: number; account_code: string; account_name: string }>(
      `SELECT id, account_code, account_name FROM saas_accounts WHERE id = $1`,
      [targetAccountId],
    );
    if (!target.rows[0] || String(target.rows[0].account_code ?? '').toLowerCase() === 'swimit') {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    const ticket = await getOrCreateChannel({
      accountId: targetAccountId,
      createdByUserId: authorUserId,
      accountCode: target.rows[0].account_code,
      accountName: target.rows[0].account_name,
    });
    await pool.query(
      `UPDATE support_tickets
       SET platform_last_read_at = NOW()
       WHERE id = $1 AND saas_account_id = $2`,
      [ticket.id, targetAccountId],
    );
    const messages = await loadTicketMessages(ticket.id, targetAccountId);
    await ensureRenewSessionTable();
    const renewChoices = await getRenewChoicesForAccount(targetAccountId);
    res.json({ ticket, messages, renewChoices });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to open support chat' });
  }
});

/** Account admin: clear badge when opening Support. */
supportRouter.post('/mark-read', requireTenant, async (req, res) => {
  try {
    const accountId = tenantId(req);
    if (await isPlatformAccount(accountId)) {
      res.status(403).json({ error: 'Not available for platform staff' });
      return;
    }
    const authorUserId = parseUserId(req.body?.authorUserId);
    if (!authorUserId) {
      res.status(400).json({ error: 'authorUserId is required' });
      return;
    }
    const author = await resolveAccountUser(accountId, authorUserId);
    if (!author?.is_account_admin) {
      res.status(403).json({ error: 'Only account admins can mark support as read' });
      return;
    }
    await markAccountInboxRead(accountId);
    res.json({ ok: true, unreadCount: 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to mark support as read' });
  }
});

/** Account admin: list tickets for this tenant only. */
supportRouter.get('/tickets', requireTenant, async (req, res) => {
  try {
    const accountId = tenantId(req);
    if (await isPlatformAccount(accountId)) {
      res.status(403).json({ error: 'Use platform support inbox for SwimIT staff' });
      return;
    }
    const status = parseStatus(req.query.status);
    const params: unknown[] = [accountId];
    let statusSql = '';
    if (status) {
      params.push(status);
      statusSql = ` AND t.status = $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT t.*,
              u.user_name AS created_by_user_name,
              (SELECT COUNT(*)::int FROM support_ticket_messages m WHERE m.ticket_id = t.id) AS message_count,
              (SELECT m.body FROM support_ticket_messages m
                WHERE m.ticket_id = t.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_message_preview,
              (SELECT m.created_at FROM support_ticket_messages m
                WHERE m.ticket_id = t.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_message_at
       FROM support_tickets t
       LEFT JOIN app_users u ON u.id = t.created_by_user_id
       WHERE t.saas_account_id = $1${statusSql}
       ORDER BY t.updated_at DESC, t.id DESC`,
      params,
    );
    res.json({ tickets: rows.map((row) => mapTicket(row as Record<string, unknown>)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load support tickets' });
  }
});

/** Account admin: create complaint/suggestion + first message. */
supportRouter.post('/tickets', requireTenant, async (req, res) => {
  try {
    const accountId = tenantId(req);
    if (await isPlatformAccount(accountId)) {
      res.status(403).json({ error: 'Platform staff cannot open account tickets here' });
      return;
    }
    const authorUserId = parseUserId(req.body?.authorUserId);
    if (!authorUserId) {
      res.status(400).json({ error: 'authorUserId is required' });
      return;
    }
    const author = await resolveAccountUser(accountId, authorUserId);
    if (!author?.is_account_admin) {
      res.status(403).json({ error: 'Only account admins can raise support tickets' });
      return;
    }
    const category = parseCategory(req.body?.category);
    if (!category) {
      res.status(400).json({ error: 'category must be complaint or suggestion' });
      return;
    }
    const subject = trimText(req.body?.subject, 200);
    const body = trimText(req.body?.body, 4000);
    if (!subject) {
      res.status(400).json({ error: 'Subject is required' });
      return;
    }
    if (!body) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ticketRes = await client.query(
        `INSERT INTO support_tickets (
           saas_account_id, created_by_user_id, category, subject, status,
           account_last_read_at
         ) VALUES ($1, $2, $3, $4, 'open', NOW())
         RETURNING *`,
        [accountId, authorUserId, category, subject],
      );
      const ticket = ticketRes.rows[0] as Record<string, unknown>;
      const ticketId = Number(ticket.id);
      await client.query(
        `INSERT INTO support_ticket_messages (
           ticket_id, saas_account_id, author_user_id, author_role, body
         ) VALUES ($1, $2, $3, 'account_admin', $4)`,
        [ticketId, accountId, authorUserId, body],
      );
      await client.query('COMMIT');
      const messages = await loadTicketMessages(ticketId, accountId);
      res.status(201).json({
        ticket: mapTicket({
          ...ticket,
          created_by_user_name: author.user_name,
          message_count: messages.length,
        }),
        messages,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create support ticket' });
  }
});

/** Account admin: ticket detail (own account only). */
supportRouter.get('/tickets/:id', requireTenant, async (req, res) => {
  try {
    const accountId = tenantId(req);
    if (await isPlatformAccount(accountId)) {
      res.status(403).json({ error: 'Use platform support inbox for SwimIT staff' });
      return;
    }
    const ticketId = Number(req.params.id);
    if (!Number.isFinite(ticketId) || ticketId <= 0) {
      res.status(400).json({ error: 'Invalid ticket id' });
      return;
    }
    const { rows } = await pool.query(
      `SELECT t.*, u.user_name AS created_by_user_name
       FROM support_tickets t
       LEFT JOIN app_users u ON u.id = t.created_by_user_id
       WHERE t.id = $1 AND t.saas_account_id = $2`,
      [ticketId, accountId],
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }
    await pool.query(
      `UPDATE support_tickets
       SET account_last_read_at = NOW()
       WHERE id = $1 AND saas_account_id = $2`,
      [ticketId, accountId],
    );
    const messages = await loadTicketMessages(ticketId, accountId);
    res.json({
      ticket: mapTicket(rows[0] as Record<string, unknown>),
      messages,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load support ticket' });
  }
});

/** Account admin: reply on own ticket. */
supportRouter.post(
  '/tickets/:id/messages',
  requireTenant,
  supportUpload.single('attachment'),
  async (req, res) => {
  try {
    const accountId = tenantId(req);
    if (await isPlatformAccount(accountId)) {
      res.status(403).json({ error: 'Use platform support routes to reply' });
      return;
    }
    const ticketId = Number(req.params.id);
    if (!Number.isFinite(ticketId) || ticketId <= 0) {
      res.status(400).json({ error: 'Invalid ticket id' });
      return;
    }
    const authorUserId = parseUserId(req.body?.authorUserId);
    if (!authorUserId) {
      res.status(400).json({ error: 'authorUserId is required' });
      return;
    }
    const author = await resolveAccountUser(accountId, authorUserId);
    if (!author?.is_account_admin) {
      res.status(403).json({ error: 'Only account admins can reply on support tickets' });
      return;
    }
    const file = req.file;
    const attachmentPath = file ? file.filename : '';
    const attachmentName = file ? file.originalname.slice(0, 240) : '';
    const attachmentMime = file ? String(file.mimetype || '').slice(0, 120) : '';
    let body = trimText(req.body?.body, 4000);
    if (!body && attachmentName) body = attachmentName;
    if (!body) {
      res.status(400).json({ error: 'Message or attachment is required' });
      return;
    }
    const ticketRes = await pool.query(
      `SELECT id, status FROM support_tickets WHERE id = $1 AND saas_account_id = $2`,
      [ticketId, accountId],
    );
    if (!ticketRes.rows[0]) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }
    if (String(ticketRes.rows[0].status) === 'closed') {
      res.status(400).json({ error: 'This ticket is closed' });
      return;
    }
    const msgRes = await pool.query(
      `INSERT INTO support_ticket_messages (
         ticket_id, saas_account_id, author_user_id, author_role, body,
         attachment_path, attachment_name, attachment_mime
       ) VALUES ($1, $2, $3, 'account_admin', $4, $5, $6, $7)
       RETURNING *`,
      [
        ticketId,
        accountId,
        authorUserId,
        body,
        attachmentPath,
        attachmentName,
        attachmentMime,
      ],
    );
    await pool.query(
      `UPDATE support_tickets
       SET updated_at = NOW(), account_last_read_at = NOW()
       WHERE id = $1 AND saas_account_id = $2`,
      [ticketId, accountId],
    );

    let renewChoices: Array<{ id: string; label: string }> = [];
    if (!file) {
      try {
        const renew = await handleSupportRenewReply({
          accountId,
          userId: authorUserId,
          ticketId,
          text: body,
        });
        renewChoices = renew.choices;
        // Renew chip/numbered replies are bot-handled — never badge platform for those.
        if (renew.suppressPlatformUnread) {
          await pool.query(
            `UPDATE support_tickets
             SET platform_last_read_at = GREATEST(
               COALESCE(platform_last_read_at, TIMESTAMPTZ 'epoch'),
               $1::timestamptz
             )
             WHERE id = $2 AND saas_account_id = $3`,
            [msgRes.rows[0].created_at, ticketId, accountId],
          );
        }
      } catch (err) {
        console.error('[support-renew] reply handling failed', err);
      }
    } else {
      renewChoices = await getRenewChoicesForAccount(accountId);
    }

    const messages = await loadTicketMessages(ticketId, accountId);
    res.status(201).json({
      message: mapMessage({
        ...(msgRes.rows[0] as Record<string, unknown>),
        author_user_name: author.user_name,
      }),
      messages,
      renewChoices,
    });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : 'Failed to send message';
    res.status(500).json({ error: message });
  }
});

/** Platform: list tickets across pool accounts (isolated per account in data). */
supportRouter.get('/platform/tickets', requireTenant, async (req, res) => {
  try {
    if (!(await requirePlatformTenant(req, res))) return;
    const status = parseStatus(req.query.status);
    const accountCode = trimText(req.query.accountCode, 12).toLowerCase();
    const accountIdFilter = parseUserId(req.query.accountId);
    const params: unknown[] = [];
    const where: string[] = [`LOWER(COALESCE(a.account_code, '')) <> 'swimit'`];
    if (status) {
      params.push(status);
      where.push(`t.status = $${params.length}`);
    }
    if (accountIdFilter) {
      params.push(accountIdFilter);
      where.push(`t.saas_account_id = $${params.length}`);
    } else if (accountCode) {
      params.push(accountCode);
      where.push(`LOWER(a.account_code) = $${params.length}`);
    }
    const { rows } = await pool.query(
      `SELECT t.*,
              a.account_code,
              a.account_name,
              u.user_name AS created_by_user_name,
              (SELECT COUNT(*)::int FROM support_ticket_messages m WHERE m.ticket_id = t.id) AS message_count,
              (SELECT m.body FROM support_ticket_messages m
                WHERE m.ticket_id = t.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_message_preview,
              (SELECT m.created_at FROM support_ticket_messages m
                WHERE m.ticket_id = t.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_message_at
       FROM support_tickets t
       JOIN saas_accounts a ON a.id = t.saas_account_id
       LEFT JOIN app_users u ON u.id = t.created_by_user_id
       WHERE ${where.join(' AND ')}
       ORDER BY t.updated_at DESC, t.id DESC`,
      params,
    );
    res.json({ tickets: rows.map((row) => mapTicket(row as Record<string, unknown>)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load platform support tickets' });
  }
});

supportRouter.get('/platform/tickets/:id', requireTenant, async (req, res) => {
  try {
    if (!(await requirePlatformTenant(req, res))) return;
    const ticketId = Number(req.params.id);
    if (!Number.isFinite(ticketId) || ticketId <= 0) {
      res.status(400).json({ error: 'Invalid ticket id' });
      return;
    }
    const { rows } = await pool.query(
      `SELECT t.*,
              a.account_code,
              a.account_name,
              u.user_name AS created_by_user_name
       FROM support_tickets t
       JOIN saas_accounts a ON a.id = t.saas_account_id
       LEFT JOIN app_users u ON u.id = t.created_by_user_id
       WHERE t.id = $1
         AND LOWER(COALESCE(a.account_code, '')) <> 'swimit'`,
      [ticketId],
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }
    const accountId = Number(rows[0].saas_account_id);
    await pool.query(
      `UPDATE support_tickets
       SET platform_last_read_at = NOW()
       WHERE id = $1 AND saas_account_id = $2`,
      [ticketId, accountId],
    );
    const messages = await loadTicketMessages(ticketId, accountId);
    res.json({
      ticket: mapTicket(rows[0] as Record<string, unknown>),
      messages,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load support ticket' });
  }
});

/** Platform: unread admin replies grouped by pool account (for Accounts bells). */
supportRouter.get('/platform/unread-by-account', requireTenant, async (req, res) => {
  try {
    if (!(await requirePlatformTenant(req, res))) return;
    // Count only real discussion messages — not renew chip / numbered selections.
    const { rows } = await pool.query<{ saas_account_id: number; count: number }>(
      `SELECT t.saas_account_id, COUNT(*)::int AS count
       FROM support_ticket_messages m
       JOIN support_tickets t ON t.id = m.ticket_id
       JOIN saas_accounts a ON a.id = t.saas_account_id
       WHERE m.author_role = 'account_admin'
         AND LOWER(COALESCE(a.account_code, '')) <> 'swimit'
         AND m.created_at > COALESCE(t.platform_last_read_at, TIMESTAMPTZ 'epoch')
         AND NOT (
           LOWER(TRIM(regexp_replace(COALESCE(m.body, ''), '\\s+', ' ', 'g'))) ~
           '^(1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|renew|renew now|renew package|package renew|start renew|same|same package|change|change package|confirm|confirm & pay|confirm and pay|remind me later|later|cancel|yes|no|one|two)$'
         )
       GROUP BY t.saas_account_id`,
    );
    const unreadByAccountId: Record<string, number> = {};
    for (const row of rows) {
      unreadByAccountId[String(row.saas_account_id)] = Number(row.count ?? 0);
    }
    res.json({ unreadByAccountId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load unread counts' });
  }
});

/** Platform: mark chats for one pool account as read. */
supportRouter.post('/platform/mark-read', requireTenant, async (req, res) => {
  try {
    if (!(await requirePlatformTenant(req, res))) return;
    const targetAccountId = parseUserId(req.body?.accountId);
    if (!targetAccountId) {
      res.status(400).json({ error: 'accountId is required' });
      return;
    }
    const acct = await pool.query<{ id: number; account_code: string }>(
      `SELECT id, account_code FROM saas_accounts WHERE id = $1`,
      [targetAccountId],
    );
    if (!acct.rows[0] || String(acct.rows[0].account_code ?? '').toLowerCase() === 'swimit') {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    await pool.query(
      `UPDATE support_tickets
       SET platform_last_read_at = NOW()
       WHERE saas_account_id = $1`,
      [targetAccountId],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to mark chats as read' });
  }
});

/** Platform: start a new chat with a pool account. */
supportRouter.post('/platform/tickets', requireTenant, async (req, res) => {
  try {
    const platformAccountId = await requirePlatformTenant(req, res);
    if (!platformAccountId) return;
    const authorUserId = parseUserId(req.body?.authorUserId);
    if (!authorUserId) {
      res.status(400).json({ error: 'authorUserId is required' });
      return;
    }
    const author = await resolveAccountUser(platformAccountId, authorUserId);
    if (!author) {
      res.status(403).json({ error: 'Platform user not found for this account' });
      return;
    }
    const targetAccountId = parseUserId(req.body?.accountId);
    if (!targetAccountId) {
      res.status(400).json({ error: 'accountId is required' });
      return;
    }
    const target = await pool.query<{ id: number; account_code: string; account_name: string }>(
      `SELECT id, account_code, account_name FROM saas_accounts WHERE id = $1`,
      [targetAccountId],
    );
    if (!target.rows[0] || String(target.rows[0].account_code ?? '').toLowerCase() === 'swimit') {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    const category = parseCategory(req.body?.category) ?? 'suggestion';
    const subject = trimText(req.body?.subject, 200);
    const body = trimText(req.body?.body, 4000);
    if (!subject) {
      res.status(400).json({ error: 'Subject is required' });
      return;
    }
    if (!body) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ticketRes = await client.query(
        `INSERT INTO support_tickets (
           saas_account_id, created_by_user_id, category, subject, status,
           platform_last_read_at
         ) VALUES ($1, $2, $3, $4, 'open', NOW())
         RETURNING *`,
        [targetAccountId, authorUserId, category, subject],
      );
      const ticket = ticketRes.rows[0] as Record<string, unknown>;
      const ticketId = Number(ticket.id);
      await client.query(
        `INSERT INTO support_ticket_messages (
           ticket_id, saas_account_id, author_user_id, author_role, body
         ) VALUES ($1, $2, $3, 'platform', $4)`,
        [ticketId, targetAccountId, authorUserId, body],
      );
      await client.query('COMMIT');
      const messages = await loadTicketMessages(ticketId, targetAccountId);
      res.status(201).json({
        ticket: mapTicket({
          ...ticket,
          account_code: target.rows[0].account_code,
          account_name: target.rows[0].account_name,
          created_by_user_name: author.user_name,
          message_count: messages.length,
        }),
        messages,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create support chat' });
  }
});

/** Platform: clear all messages in a pool support channel (keeps channel open). */
supportRouter.post('/platform/tickets/:id/clear', requireTenant, async (req, res) => {
  try {
    const platformAccountId = await requirePlatformTenant(req, res);
    if (!platformAccountId) return;
    const ticketId = Number(req.params.id);
    if (!Number.isFinite(ticketId) || ticketId <= 0) {
      res.status(400).json({ error: 'Invalid ticket id' });
      return;
    }
    const authorUserId = parseUserId(req.body?.authorUserId);
    if (!authorUserId) {
      res.status(400).json({ error: 'authorUserId is required' });
      return;
    }
    const author = await resolveAccountUser(platformAccountId, authorUserId);
    if (!author) {
      res.status(403).json({ error: 'Platform user not found for this account' });
      return;
    }

    const ticketRes = await pool.query<{ id: number; saas_account_id: number }>(
      `SELECT t.id, t.saas_account_id
       FROM support_tickets t
       JOIN saas_accounts a ON a.id = t.saas_account_id
       WHERE t.id = $1
         AND LOWER(COALESCE(a.account_code, '')) <> 'swimit'`,
      [ticketId],
    );
    if (!ticketRes.rows[0]) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }
    const targetAccountId = Number(ticketRes.rows[0].saas_account_id);

    const files = await pool.query<{ attachment_path: string }>(
      `SELECT attachment_path FROM support_ticket_messages
       WHERE ticket_id = $1 AND saas_account_id = $2
         AND COALESCE(TRIM(attachment_path), '') <> ''`,
      [ticketId, targetAccountId],
    );
    for (const row of files.rows) {
      const name = String(row.attachment_path ?? '').trim();
      if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) continue;
      try {
        fs.unlinkSync(path.join(uploadDir, name));
      } catch {
        // ignore missing files
      }
    }

    await pool.query(
      `DELETE FROM support_ticket_messages
       WHERE ticket_id = $1 AND saas_account_id = $2`,
      [ticketId, targetAccountId],
    );
    await ensureRenewSessionTable();
    await pool.query(
      `DELETE FROM support_renew_sessions WHERE saas_account_id = $1`,
      [targetAccountId],
    );
    await pool.query(
      `UPDATE support_tickets
       SET updated_at = NOW(),
           platform_last_read_at = NOW(),
           account_last_read_at = NOW()
       WHERE id = $1 AND saas_account_id = $2`,
      [ticketId, targetAccountId],
    );

    res.json({ ok: true, ticketId, messages: [] as unknown[], renewChoices: [] as unknown[] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to clear chat' });
  }
});

supportRouter.post(
  '/platform/tickets/:id/messages',
  requireTenant,
  supportUpload.single('attachment'),
  async (req, res) => {
  try {
    const platformAccountId = await requirePlatformTenant(req, res);
    if (!platformAccountId) return;
    const ticketId = Number(req.params.id);
    if (!Number.isFinite(ticketId) || ticketId <= 0) {
      res.status(400).json({ error: 'Invalid ticket id' });
      return;
    }
    const authorUserId = parseUserId(req.body?.authorUserId);
    if (!authorUserId) {
      res.status(400).json({ error: 'authorUserId is required' });
      return;
    }
    const author = await resolveAccountUser(platformAccountId, authorUserId);
    if (!author) {
      res.status(403).json({ error: 'Platform user not found for this account' });
      return;
    }
    const file = req.file;
    const attachmentPath = file ? file.filename : '';
    const attachmentName = file ? file.originalname.slice(0, 240) : '';
    const attachmentMime = file ? String(file.mimetype || '').slice(0, 120) : '';
    let body = trimText(req.body?.body, 4000);
    if (!body && attachmentName) body = attachmentName;
    if (!body) {
      res.status(400).json({ error: 'Message or attachment is required' });
      return;
    }
    const ticketRes = await pool.query(
      `SELECT t.id, t.saas_account_id, t.status
       FROM support_tickets t
       JOIN saas_accounts a ON a.id = t.saas_account_id
       WHERE t.id = $1
         AND LOWER(COALESCE(a.account_code, '')) <> 'swimit'`,
      [ticketId],
    );
    if (!ticketRes.rows[0]) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }
    if (String(ticketRes.rows[0].status) === 'closed') {
      res.status(400).json({ error: 'This ticket is closed' });
      return;
    }
    const ticketAccountId = Number(ticketRes.rows[0].saas_account_id);
    const startRenew = !file && isRenewStartCommand(body);
    const msgRes = await pool.query(
      `INSERT INTO support_ticket_messages (
         ticket_id, saas_account_id, author_user_id, author_role, body,
         attachment_path, attachment_name, attachment_mime
       ) VALUES ($1, $2, $3, 'platform', $4, $5, $6, $7)
       RETURNING *`,
      [
        ticketId,
        ticketAccountId,
        authorUserId,
        body,
        attachmentPath,
        attachmentName,
        attachmentMime,
      ],
    );
    await pool.query(
      `UPDATE support_tickets
       SET updated_at = NOW(), platform_last_read_at = NOW()
       WHERE id = $1 AND saas_account_id = $2`,
      [ticketId, ticketAccountId],
    );

    if (startRenew) {
      try {
        await startManualRenewPrompt(ticketAccountId, ticketId);
      } catch (err) {
        console.error('[support-renew] platform start failed', err);
      }
    }

    const messages = await loadTicketMessages(ticketId, ticketAccountId);
    res.status(201).json({
      message: mapMessage({
        ...(msgRes.rows[0] as Record<string, unknown>),
        author_user_name: author.user_name,
      }),
      messages,
      renewStarted: startRenew,
    });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : 'Failed to send message';
    res.status(500).json({ error: message });
  }
});

/** Close/reopen — account admin (own) or platform staff. */
supportRouter.patch('/tickets/:id', requireTenant, async (req, res) => {
  try {
    const callerAccountId = tenantId(req);
    const ticketId = Number(req.params.id);
    if (!Number.isFinite(ticketId) || ticketId <= 0) {
      res.status(400).json({ error: 'Invalid ticket id' });
      return;
    }
    const status = parseStatus(req.body?.status);
    if (!status) {
      res.status(400).json({ error: 'status must be open or closed' });
      return;
    }
    const authorUserId = parseUserId(req.body?.authorUserId);
    if (!authorUserId) {
      res.status(400).json({ error: 'authorUserId is required' });
      return;
    }

    const platform = await isPlatformAccount(callerAccountId);
    if (platform) {
      const author = await resolveAccountUser(callerAccountId, authorUserId);
      if (!author) {
        res.status(403).json({ error: 'Platform user not found for this account' });
        return;
      }
      const { rows } = await pool.query(
        `UPDATE support_tickets t
         SET status = $1, updated_at = NOW()
         FROM saas_accounts a
         WHERE t.id = $2
           AND t.saas_account_id = a.id
           AND LOWER(COALESCE(a.account_code, '')) <> 'swimit'
         RETURNING t.*, a.account_code, a.account_name`,
        [status, ticketId],
      );
      if (!rows[0]) {
        res.status(404).json({ error: 'Ticket not found' });
        return;
      }
      res.json({ ticket: mapTicket(rows[0] as Record<string, unknown>) });
      return;
    }

    const author = await resolveAccountUser(callerAccountId, authorUserId);
    if (!author?.is_account_admin) {
      res.status(403).json({ error: 'Only account admins can update support tickets' });
      return;
    }
    const { rows } = await pool.query(
      `UPDATE support_tickets
       SET status = $1, updated_at = NOW()
       WHERE id = $2 AND saas_account_id = $3
       RETURNING *`,
      [status, ticketId, callerAccountId],
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }
    res.json({ ticket: mapTicket(rows[0] as Record<string, unknown>) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update support ticket' });
  }
});
