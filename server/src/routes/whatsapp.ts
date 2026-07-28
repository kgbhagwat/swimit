import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db/pool.js';
import { requireTenant, tenantId } from '../middleware/tenant.js';
import { downloadWhatsAppMedia, sendWhatsAppTemplate, sendWhatsAppText } from '../whatsapp/client.js';
import { getWhatsAppConfig, toE164 } from '../whatsapp/config.js';
import { notifyPassExpiring, sendBroadcast } from '../whatsapp/notify.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadRoot = path.resolve(__dirname, '../../uploads/whatsapp');

export const whatsappRouter = Router();

/** Meta webhook verification */
whatsappRouter.get('/webhook', (req, res) => {
  const cfg = getWhatsAppConfig();
  const mode = String(req.query['hub.mode'] ?? '');
  const token = String(req.query['hub.verify_token'] ?? '');
  const challenge = String(req.query['hub.challenge'] ?? '');
  if (mode === 'subscribe' && token === cfg.verifyToken) {
    res.status(200).send(challenge);
    return;
  }
  res.sendStatus(403);
});

function classifyInbound(caption: string, mimeType: string) {
  const text = caption.toLowerCase();
  if (text.includes('cert') || text.includes('certificate') || text.includes('प्रमाण')) {
    return 'certificate';
  }
  if (
    text.includes('pay') ||
    text.includes('payment') ||
    text.includes('upi') ||
    text.includes('screenshot') ||
    text.includes('receipt') ||
    text.includes('भुगतान')
  ) {
    return 'payment_screenshot';
  }
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.includes('pdf')) return 'document';
  return 'other';
}

async function saveInboundMedia(params: {
  fromMobile: string;
  mediaId: string;
  mimeType: string;
  caption: string;
  waMessageId?: string;
}) {
  fs.mkdirSync(uploadRoot, { recursive: true });
  const { buffer, mimeType } = await downloadWhatsAppMedia(params.mediaId);
  const ext =
    mimeType.includes('png')
      ? 'png'
      : mimeType.includes('jpeg') || mimeType.includes('jpg')
        ? 'jpg'
        : mimeType.includes('pdf')
          ? 'pdf'
          : 'bin';
  const fileName = `${Date.now()}-${params.fromMobile}.${ext}`;
  const abs = path.join(uploadRoot, fileName);
  fs.writeFileSync(abs, buffer);
  const relativePath = `whatsapp/${fileName}`;
  const kind = classifyInbound(params.caption, mimeType);

  // Match swimmer / staff / account by mobile (last 10 digits)
  const last10 = params.fromMobile.replace(/\D/g, '').slice(-10);
  let saasAccountId: number | null = null;
  let registrationId: number | null = null;

  const swimmer = await pool.query(
    `SELECT id, saas_account_id FROM registrations
     WHERE RIGHT(regexp_replace(whatsapp_mobile, '\\D', '', 'g'), 10) = $1
     ORDER BY id DESC LIMIT 1`,
    [last10],
  );
  if (swimmer.rows[0]) {
    registrationId = Number(swimmer.rows[0].id);
    saasAccountId = Number(swimmer.rows[0].saas_account_id);
  } else {
    const account = await pool.query(
      `SELECT id FROM saas_accounts
       WHERE RIGHT(regexp_replace(mobile, '\\D', '', 'g'), 10) = $1
       ORDER BY id DESC LIMIT 1`,
      [last10],
    );
    if (account.rows[0]) saasAccountId = Number(account.rows[0].id);
  }

  await pool.query(
    `INSERT INTO whatsapp_inbound
     (saas_account_id, registration_id, from_mobile, wa_message_id, kind, caption, mime_type, file_path, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'received')`,
    [
      saasAccountId,
      registrationId,
      last10 || params.fromMobile,
      params.waMessageId ?? null,
      kind,
      params.caption || null,
      mimeType,
      relativePath,
    ],
  );
}

/** Inbound webhook from Meta */
whatsappRouter.post('/webhook', async (req, res) => {
  // Always 200 quickly so Meta does not retry endlessly
  res.sendStatus(200);

  try {
    const body = req.body as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            messages?: Array<{
              id?: string;
              from?: string;
              type?: string;
              text?: { body?: string };
              image?: { id?: string; caption?: string; mime_type?: string };
              document?: { id?: string; caption?: string; filename?: string; mime_type?: string };
            }>;
          };
        }>;
      }>;
    };

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const msg of change.value?.messages ?? []) {
          const from = String(msg.from ?? '');
          if (!from) continue;

          if (msg.type === 'image' && msg.image?.id) {
            await saveInboundMedia({
              fromMobile: from,
              mediaId: msg.image.id,
              mimeType: String(msg.image.mime_type ?? 'image/jpeg'),
              caption: String(msg.image.caption ?? ''),
              waMessageId: msg.id,
            });
          } else if (msg.type === 'document' && msg.document?.id) {
            await saveInboundMedia({
              fromMobile: from,
              mediaId: msg.document.id,
              mimeType: String(msg.document.mime_type ?? 'application/pdf'),
              caption: String(msg.document.caption ?? msg.document.filename ?? ''),
              waMessageId: msg.id,
            });
          } else if (msg.type === 'text' && msg.text?.body) {
            const last10 = from.replace(/\D/g, '').slice(-10);
            await pool.query(
              `INSERT INTO whatsapp_inbound
               (from_mobile, wa_message_id, kind, caption, status)
               VALUES ($1, $2, 'text', $3, 'received')`,
              [last10 || from, msg.id ?? null, msg.text.body],
            );
          }
        }
      }
    }
  } catch (err) {
    console.error('[whatsapp] webhook processing failed', err);
  }
});

whatsappRouter.get('/status', (_req, res) => {
  const cfg = getWhatsAppConfig();
  res.json({
    enabled: cfg.enabled,
    phoneNumberIdSet: Boolean(cfg.phoneNumberId),
    publicAppUrl: cfg.publicAppUrl || null,
  });
});

whatsappRouter.get('/inbox', requireTenant, async (req, res) => {
  try {
    const accountId = tenantId(req);
    // Include unmatched inbound (null account) so Application / early tests can see media
    const { rows } = await pool.query(
      `SELECT id, registration_id, from_mobile, kind, caption, mime_type, file_path, status, created_at
       FROM whatsapp_inbound
       WHERE saas_account_id = $1 OR saas_account_id IS NULL
       ORDER BY created_at DESC
       LIMIT 100`,
      [accountId],
    );
    res.json(
      rows.map((row) => ({
        id: Number(row.id),
        registrationId: row.registration_id == null ? null : Number(row.registration_id),
        fromMobile: String(row.from_mobile ?? ''),
        kind: String(row.kind ?? ''),
        caption: String(row.caption ?? ''),
        mimeType: String(row.mime_type ?? ''),
        filePath: row.file_path ? `/uploads/${row.file_path}` : null,
        status: String(row.status ?? ''),
        createdAt: row.created_at,
      })),
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load WhatsApp inbox' });
  }
});

/** Send one test message to a mobile (for Application / Meta allow-list testing). */
whatsappRouter.post('/send-test', requireTenant, async (req, res) => {
  try {
    const accountId = tenantId(req);
    const body = req.body as { mobile?: string; message?: string; mode?: string };
    const mobile = String(body.mobile ?? '').replace(/\D/g, '').slice(-10);
    const message = String(body.message ?? '').trim();
    const mode = String(body.mode ?? 'template').toLowerCase();
    if (mobile.length !== 10) {
      res.status(400).json({ error: 'Enter a valid 10-digit WhatsApp mobile' });
      return;
    }

    // Templates open the conversation on Meta test numbers; free text often never shows up.
    if (mode !== 'text') {
      try {
        const sent = await sendWhatsAppTemplate(mobile, 'hello_world', 'en_US');
        if (sent.skipped) {
          res.status(503).json({ error: 'WhatsApp is not configured on the server' });
          return;
        }
        res.json({
          ok: true,
          mobile,
          to: sent.to,
          mode: 'template',
          template: 'hello_world',
          messageId: sent.messageId,
          hint: 'Look for a chat from Meta’s test number (+1 555…). If nothing arrives, send once from Meta Step 1 with Recipient selected.',
        });
        return;
      } catch (err) {
        const templateError = err instanceof Error ? err.message : 'Template send failed';
        // Fall through to plain text if hello_world is missing
        if (!message) {
          res.status(502).json({
            error: `${templateError}. Also try Meta → Step 1 → select Recipient → Send message.`,
          });
          return;
        }
      }
    }

    if (!message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }
    const results = await sendBroadcast({
      mobiles: [mobile],
      message,
      saasAccountId: accountId,
    });
    const result = results[0];
    if (!result?.ok) {
      res.status(502).json({
        error:
          result?.error ??
          'Send failed. In Meta Step 1, select your number under Recipient and click Send message once.',
        result,
      });
      return;
    }
    res.json({
      ok: true,
      mobile,
      to: `91${mobile}`,
      mode: 'text',
      result,
      hint: 'Free text may not appear until you reply to the business chat. Prefer the hello_world template test.',
    });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : 'Test send failed';
    res.status(500).json({ error: message });
  }
});

whatsappRouter.post('/broadcast', requireTenant, async (req, res) => {
  try {
    const accountId = tenantId(req);
    const body = req.body as { message?: string; audience?: string };
    const message = String(body.message ?? '').trim();
    if (!message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }
    const audience = String(body.audience ?? 'active_swimmers');

    let mobiles: string[] = [];
    if (audience === 'active_swimmers') {
      const { rows } = await pool.query(
        `SELECT DISTINCT whatsapp_mobile FROM registrations
         WHERE saas_account_id = $1 AND is_active = TRUE AND whatsapp_mobile IS NOT NULL`,
        [accountId],
      );
      mobiles = rows.map((r) => String(r.whatsapp_mobile));
    } else if (audience === 'all_swimmers') {
      const { rows } = await pool.query(
        `SELECT DISTINCT whatsapp_mobile FROM registrations
         WHERE saas_account_id = $1 AND whatsapp_mobile IS NOT NULL`,
        [accountId],
      );
      mobiles = rows.map((r) => String(r.whatsapp_mobile));
    } else {
      res.status(400).json({ error: 'Invalid audience' });
      return;
    }

    const unique = [...new Set(mobiles.map((m) => toE164(m)).filter(Boolean))];
    const results = await sendBroadcast({
      mobiles: unique.map((e164) => e164.slice(-10)),
      message,
      saasAccountId: accountId,
    });
    res.json({
      sent: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      total: results.length,
      results,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Broadcast failed' });
  }
});

/** Send pass-expiry reminders for passes ending within N days (default 7). */
whatsappRouter.post('/notify-expiring', requireTenant, async (req, res) => {
  try {
    const accountId = tenantId(req);
    const days = Math.min(30, Math.max(1, Number((req.body as { days?: number }).days ?? 7)));
    const { rows } = await pool.query(
      `SELECT id, full_name, whatsapp_mobile, pass_type, pass_valid_until
       FROM registrations
       WHERE saas_account_id = $1
         AND is_active = TRUE
         AND pass_valid_until IS NOT NULL
         AND pass_valid_until >= CURRENT_DATE
         AND pass_valid_until <= CURRENT_DATE + ($2::int || ' days')::interval`,
      [accountId, days],
    );

    const results = [];
    for (const row of rows) {
      const r = await notifyPassExpiring({
        mobile: String(row.whatsapp_mobile),
        fullName: String(row.full_name),
        passType: String(row.pass_type ?? ''),
        passValidUntil: String(row.pass_valid_until).slice(0, 10),
        saasAccountId: accountId,
      });
      results.push({ id: Number(row.id), skipped: Boolean((r as { skipped?: boolean }).skipped) });
    }
    res.json({ count: rows.length, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send expiry notices' });
  }
});
