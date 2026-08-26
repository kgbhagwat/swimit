import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordAudit } from '../auditLog.js';
import { pool } from '../db/pool.js';
import { requirePages } from '../accessControl.js';
import { requireTenant, tenantId } from '../middleware/tenant.js';
import { isValidMobile, MOBILE_INVALID_MSG, sanitizeMobile } from '../mobileValidation.js';
import { downloadWhatsAppMedia, formatWhatsAppUserError, probeWhatsAppAuth, sendWhatsAppTemplate } from '../whatsapp/client.js';
import { getWhatsAppConfig, toE164 } from '../whatsapp/config.js';
import { BROADCAST_RATE_INR } from '../renewBilling.js';
import { notifyPassExpiring, notifyOpenFormQr, replyIfRegistrationHi, sendBroadcast } from '../whatsapp/notify.js';
import { processPackageRenewalInbound } from '../packageRenewal.js';
import { processPassPaymentInbound } from '../passPaymentVerify.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadRoot = path.resolve(__dirname, '../../uploads/whatsapp');

export const whatsappRouter = Router();

async function paidWhatsAppAccepted(accountId: number) {
  const { rows } = await pool.query<{ accepted: boolean }>(
    `SELECT COALESCE(whatsapp_paid_messages_accepted, FALSE) AS accepted
     FROM pool_core_info
     WHERE saas_account_id = $1`,
    [accountId],
  );
  return rows[0]?.accepted === true;
}

async function whatsappBroadcastEnabled(accountId: number) {
  const { rows } = await pool.query<{ enabled: boolean }>(
    `SELECT COALESCE(whatsapp_broadcast_enabled, FALSE) AS enabled
     FROM pool_core_info
     WHERE saas_account_id = $1`,
    [accountId],
  );
  return rows[0]?.enabled === true;
}

const NOTICE_SETTINGS_SELECT = `
  SELECT
    COALESCE(pass_expiry_notice_enabled, FALSE) AS enabled,
    GREATEST(1, LEAST(9, COALESCE(pass_expiry_notice_days, 3))) AS days,
    COALESCE(whatsapp_paid_messages_accepted, FALSE) AS charges_accepted,
    whatsapp_paid_messages_accepted_at::text AS charges_accepted_at,
    COALESCE(whatsapp_broadcast_enabled, FALSE) AS broadcast_enabled
  FROM pool_core_info
  WHERE saas_account_id = $1`;

type NoticeSettingsRow = {
  enabled: boolean;
  days: number;
  charges_accepted: boolean;
  charges_accepted_at: string | null;
  broadcast_enabled: boolean;
};

function noticeSettingsJson(row: NoticeSettingsRow | undefined, daysFallback = 3) {
  return {
    enabled: Boolean(row?.enabled),
    days: Number(row?.days ?? daysFallback),
    chargesAccepted: Boolean(row?.charges_accepted),
    chargesAcceptedAt: row?.charges_accepted_at ?? null,
    broadcastEnabled: Boolean(row?.broadcast_enabled),
    rateInr: BROADCAST_RATE_INR,
  };
}

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

type InboundMember = {
  last10: string;
  saasAccountId: number;
  registrationId: number | null;
  kind: 'swimmer' | 'staff' | 'user';
};

type ResolvedInbound = {
  last10: string;
  saasAccountId: number;
  registrationId: number | null;
};

function uniqueAccountIds(members: InboundMember[]) {
  return [...new Set(members.map((row) => row.saasAccountId))];
}

function swimmerIdForAccount(members: InboundMember[], accountId: number) {
  return (
    members.find((row) => row.kind === 'swimmer' && row.saasAccountId === accountId)?.registrationId ??
    null
  );
}

/**
 * Memberships for this WhatsApp number, kept per pool.
 * Same mobile may exist at several pools; never mix another pool's swimmer id onto this pool.
 */
async function listInboundMembers(fromMobile: string): Promise<InboundMember[]> {
  const last10 = fromMobile.replace(/\D/g, '').slice(-10);
  if (last10.length < 10) return [];
  const members: InboundMember[] = [];

  const swimmers = await pool.query<{ id: number; saas_account_id: number }>(
    `SELECT id, saas_account_id FROM registrations
     WHERE RIGHT(regexp_replace(whatsapp_mobile, '\\D', '', 'g'), 10) = $1
     ORDER BY id DESC`,
    [last10],
  );
  for (const row of swimmers.rows) {
    if (row.saas_account_id == null) continue;
    members.push({
      last10,
      saasAccountId: Number(row.saas_account_id),
      registrationId: Number(row.id),
      kind: 'swimmer',
    });
  }

  const staff = await pool.query<{ id: number; saas_account_id: number }>(
    `SELECT id, saas_account_id FROM staff_registrations
     WHERE RIGHT(regexp_replace(whatsapp_mobile, '\\D', '', 'g'), 10) = $1
     ORDER BY id DESC`,
    [last10],
  );
  for (const row of staff.rows) {
    if (row.saas_account_id == null) continue;
    members.push({
      last10,
      saasAccountId: Number(row.saas_account_id),
      registrationId: null,
      kind: 'staff',
    });
  }

  const users = await pool.query<{ id: number; saas_account_id: number }>(
    `SELECT id, saas_account_id FROM app_users
     WHERE RIGHT(regexp_replace(mobile, '\\D', '', 'g'), 10) = $1
     ORDER BY id DESC`,
    [last10],
  );
  for (const row of users.rows) {
    if (row.saas_account_id == null) continue;
    members.push({
      last10,
      saasAccountId: Number(row.saas_account_id),
      registrationId: null,
      kind: 'user',
    });
  }

  return members;
}

async function resolveInboundAccount(fromMobile: string): Promise<ResolvedInbound | null> {
  const members = await listInboundMembers(fromMobile);
  if (!members.length) return null;
  const last10 = members[0].last10;
  const accountIds = uniqueAccountIds(members);

  const pick = (saasAccountId: number): ResolvedInbound => ({
    last10,
    saasAccountId,
    registrationId: swimmerIdForAccount(members, saasAccountId),
  });

  if (accountIds.length === 1) return pick(accountIds[0]);

  const pending = await pool.query<{ saas_account_id: number }>(
    `SELECT saas_account_id FROM saas_package_renewals
     WHERE status = 'pending'
       AND RIGHT(regexp_replace(from_mobile, '\\D', '', 'g'), 10) = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [last10],
  );
  const pendingAccountId = Number(pending.rows[0]?.saas_account_id ?? 0);
  if (pendingAccountId > 0 && accountIds.includes(pendingAccountId)) {
    return pick(pendingAccountId);
  }

  const userAccounts = uniqueAccountIds(members.filter((row) => row.kind === 'user'));
  if (userAccounts.length === 1) return pick(userAccounts[0]);

  const staffAccounts = uniqueAccountIds(members.filter((row) => row.kind === 'staff'));
  if (staffAccounts.length === 1 && userAccounts.length === 0) return pick(staffAccounts[0]);

  // Several pools share this number: do not attach another pool's swimmer record.
  return { last10, saasAccountId: accountIds[0], registrationId: null };
}

function inboundMessageText(msg: {
  type?: string;
  text?: { body?: string };
  button?: { text?: string; payload?: string };
  interactive?: { button_reply?: { title?: string } };
}) {
  if (msg.type === 'text') return String(msg.text?.body ?? '').trim();
  if (msg.type === 'button') {
    return String(msg.button?.text || msg.button?.payload || '').trim();
  }
  if (msg.type === 'interactive') {
    return String(msg.interactive?.button_reply?.title ?? '').trim();
  }
  return '';
}

async function saveInboundText(params: {
  text: string;
  waMessageId?: string;
  resolved: { last10: string; saasAccountId: number; registrationId: number | null };
}) {
  try {
    await pool.query(
      `INSERT INTO whatsapp_inbound
       (saas_account_id, registration_id, from_mobile, wa_message_id, kind, caption, status)
       VALUES ($1, $2, $3, $4, 'text', $5, 'received')`,
      [
        params.resolved.saasAccountId,
        params.resolved.registrationId,
        params.resolved.last10,
        params.waMessageId ?? null,
        params.text,
      ],
    );
  } catch (err) {
    console.error('[whatsapp] failed to log inbound text', err);
  }
}

async function saveInboundMedia(params: {
  fromMobile: string;
  mediaId: string;
  mimeType: string;
  caption: string;
  waMessageId?: string;
  mediaUrl?: string;
}) {
  const resolved = await resolveInboundAccount(params.fromMobile);
  if (!resolved) {
    console.info('[whatsapp] ignored media from unregistered mobile', params.fromMobile);
    return;
  }
  const { last10, saasAccountId, registrationId } = resolved;

  fs.mkdirSync(uploadRoot, { recursive: true });
  let relativePath: string | null = null;
  let mimeType = params.mimeType;
  let status = 'received';
  let caption = params.caption || '';

  try {
    const downloaded = await downloadWhatsAppMedia(params.mediaId, params.mediaUrl);
    mimeType = downloaded.mimeType || mimeType;
    const ext =
      mimeType.includes('png')
        ? 'png'
        : mimeType.includes('jpeg') || mimeType.includes('jpg')
          ? 'jpg'
          : mimeType.includes('pdf')
            ? 'pdf'
            : 'bin';
    const fileName = `${Date.now()}-${last10}.${ext}`;
    const abs = path.join(uploadRoot, fileName);
    fs.writeFileSync(abs, downloaded.buffer);
    relativePath = `whatsapp/${fileName}`;
  } catch (err) {
    status = 'media_download_failed';
    const errMsg = err instanceof Error ? err.message : 'media download failed';
    caption = caption ? `${caption} (${errMsg})` : errMsg;
    console.error('[whatsapp] media download failed', err);
  }

  const kind = classifyInbound(params.caption, mimeType);

  const inserted = await pool.query(
    `INSERT INTO whatsapp_inbound
     (saas_account_id, registration_id, from_mobile, wa_message_id, kind, caption, mime_type, file_path, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      saasAccountId,
      registrationId,
      last10,
      params.waMessageId ?? null,
      kind,
      caption || null,
      mimeType,
      relativePath,
      status,
    ],
  );

  const inboundId = Number(inserted.rows[0]?.id);
  if (inboundId && status === 'received' && relativePath) {
    let skipPassPayment = false;
    try {
      const renewalResult = await processPackageRenewalInbound({
        saasAccountId,
        fromMobileLast10: last10,
        caption: params.caption || '',
        relativeFilePath: relativePath,
        inboundId,
      });
      skipPassPayment = renewalResult === 'verified';
    } catch (err) {
      console.error('[whatsapp] package renewal processing failed', err);
    }
    if (!skipPassPayment) {
      try {
        await processPassPaymentInbound({
          saasAccountId,
          fromMobileLast10: last10,
          caption: params.caption || '',
          relativeFilePath: relativePath,
          inboundId,
          registrationId,
        });
      } catch (err) {
        console.error('[whatsapp] pass payment processing failed', err);
      }
    }
  }
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
              button?: { text?: string; payload?: string };
              interactive?: {
                type?: string;
                button_reply?: { id?: string; title?: string };
              };
              image?: { id?: string; caption?: string; mime_type?: string; url?: string };
              document?: {
                id?: string;
                caption?: string;
                filename?: string;
                mime_type?: string;
                url?: string;
              };
            }>;
            statuses?: unknown[];
          };
          field?: string;
        }>;
      }>;
    };

    console.info(
      '[whatsapp] webhook received',
      JSON.stringify({
        entries: body.entry?.length ?? 0,
        sampleType: body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.type ?? null,
      }),
    );

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const msg of change.value?.messages ?? []) {
          const from = String(msg.from ?? '');
          if (!from) continue;

          const members = await listInboundMembers(from);
          if (!members.length) {
            console.info('[whatsapp] ignored message from unregistered mobile', from);
            continue;
          }

          if (msg.type === 'image' && msg.image?.id) {
            await saveInboundMedia({
              fromMobile: from,
              mediaId: msg.image.id,
              mimeType: String(msg.image.mime_type ?? 'image/jpeg'),
              caption: String(msg.image.caption ?? ''),
              waMessageId: msg.id,
              mediaUrl: msg.image.url,
            });
            continue;
          }

          const inboundText = inboundMessageText(msg);
          if (inboundText) {
            const last10 = members[0].last10;
            const accountIds = uniqueAccountIds(members);
            for (const saasAccountId of accountIds) {
              const resolved = {
                last10,
                saasAccountId,
                registrationId: swimmerIdForAccount(members, saasAccountId),
              };
              await saveInboundText({
                text: inboundText,
                waMessageId: msg.id,
                resolved,
              });
              try {
                await replyIfRegistrationHi({
                  fromMobileLast10: last10,
                  saasAccountId,
                  registrationId: resolved.registrationId,
                  text: inboundText,
                });
              } catch (err) {
                console.error('[whatsapp] registration Hi reply failed', err);
              }
            }
            continue;
          }

          console.info(
            '[whatsapp] ignored non-image inbound',
            JSON.stringify({ from, type: msg.type ?? null }),
          );
        }
      }
    }
  } catch (err) {
    console.error('[whatsapp] webhook processing failed', err);
  }
});

whatsappRouter.get('/status', requireTenant, requirePages('whatsapp'), async (_req, res) => {
  const cfg = getWhatsAppConfig();
  const probe = await probeWhatsAppAuth();
  res.json({
    enabled: cfg.enabled,
    phoneNumberIdSet: Boolean(cfg.phoneNumberId),
    publicAppUrl: cfg.publicAppUrl || null,
    tokenValid: probe.tokenValid,
    tokenError: probe.error,
    displayPhoneNumber: probe.displayPhoneNumber,
    verifiedName: 'verifiedName' in probe ? probe.verifiedName ?? null : null,
  });
});

whatsappRouter.get('/inbox', requireTenant, requirePages('whatsapp'), async (req, res) => {
  try {
    const accountId = tenantId(req);
    const { rows } = await pool.query(
      `SELECT id, registration_id, from_mobile, kind, caption, mime_type, file_path, status, created_at
       FROM whatsapp_inbound
       WHERE saas_account_id = $1
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
whatsappRouter.post('/send-test', requireTenant, requirePages('whatsapp'), async (req, res) => {
  try {
    const accountId = tenantId(req);
    const body = req.body as { mobile?: string; message?: string; mode?: string };
    const mobile = sanitizeMobile(body.mobile);
    const message = String(body.message ?? '').trim();
    const mode = String(body.mode ?? 'template').toLowerCase();
    if (!isValidMobile(mobile)) {
      res.status(400).json({ error: MOBILE_INVALID_MSG });
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
            error: formatWhatsAppUserError(
              `${templateError}. Also try Meta → Step 1 → select Recipient → Send message.`,
              mobile,
            ),
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
        error: formatWhatsAppUserError(
          result?.error ??
            'Send failed. In Meta Step 1, select your number under Recipient and click Send message once.',
          mobile,
        ),
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
    res.status(500).json({ error: formatWhatsAppUserError(message) });
  }
});

/** Send public registration/staff form link + QR to a mobile (usually the logged-in desk user). */
whatsappRouter.post(
  '/send-form-qr',
  requireTenant,
  requirePages('whatsapp', 'register', 'staff-register'),
  async (req, res) => {
  try {
    const accountId = tenantId(req);
    const body = req.body as { form?: string; mobile?: string };
    const form = String(body.form ?? '').trim().toLowerCase();
    if (form !== 'swimmer' && form !== 'staff') {
      res.status(400).json({ error: 'form must be swimmer or staff' });
      return;
    }

    const requesterId = Number(req.auth?.userId);
    if (!Number.isFinite(requesterId) || requesterId <= 0) {
      res.status(401).json({ error: 'Sign in to send the form QR to your WhatsApp.' });
      return;
    }
    const requester = await pool.query<{ mobile: string; user_name: string }>(
      `SELECT mobile, user_name FROM app_users
       WHERE id = $1 AND saas_account_id = $2`,
      [requesterId, accountId],
    );
    const mobile = sanitizeMobile(requester.rows[0]?.mobile);
    if (!isValidMobile(mobile)) {
      res.status(400).json({
        error:
          'Your user profile has no WhatsApp mobile. Ask an admin to add it in User Management.',
      });
      return;
    }

    const account = await pool.query(
      `SELECT account_code, account_name FROM saas_accounts WHERE id = $1`,
      [accountId],
    );
    const accountCode = String(account.rows[0]?.account_code ?? '');
    if (!/^[a-z0-9]{6}$/.test(accountCode)) {
      res.status(400).json({ error: 'Account has no valid login code' });
      return;
    }

    const poolInfo = await pool.query(
      `SELECT pool_name, pool_address FROM pool_core_info WHERE saas_account_id = $1 LIMIT 1`,
      [accountId],
    );

    const result = await notifyOpenFormQr({
      mobile,
      form: form as 'swimmer' | 'staff',
      accountCode,
      poolName: String(poolInfo.rows[0]?.pool_name ?? account.rows[0]?.account_name ?? ''),
      poolAddress: String(poolInfo.rows[0]?.pool_address ?? ''),
      saasAccountId: accountId,
    });

    const path =
      form === 'staff' ? `/${accountCode}/open/staff-register` : `/${accountCode}/open/register`;
    const formUrl = `${getWhatsAppConfig().publicAppUrl || ''}${path}`;

    if (!result.ok) {
      res.status(502).json({ error: result.error, ok: false, formUrl, mobile, qrSent: false });
      return;
    }
    if (result.skipped) {
      res.status(503).json({
        error: 'WhatsApp is not configured on the server',
        ok: false,
        skipped: true,
        formUrl,
        mobile,
        qrSent: false,
      });
      return;
    }

    res.json({
      ok: true,
      form,
      mobile,
      formUrl,
      qrSent: result.qrSent === true,
      messageId: result.messageId,
    });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : 'Send form QR failed';
    res.status(500).json({ error: formatWhatsAppUserError(message) });
  }
});

whatsappRouter.post('/broadcast', requireTenant, requirePages('whatsapp'), async (req, res) => {
  try {
    const requesterAccountId = tenantId(req);
    const body = req.body as { message?: string; audience?: string; accountCode?: string };
    const message = String(body.message ?? '').trim();
    if (!message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }
    const audience = String(body.audience ?? 'active_swimmers');
    const accountCode = String(body.accountCode ?? '')
      .trim()
      .toLowerCase();
    const crossAccountAudience =
      audience === 'active_account_admins' || audience === 'active_account_users';

    const self = await pool.query<{ account_code: string }>(
      `SELECT account_code FROM saas_accounts WHERE id = $1`,
      [requesterAccountId],
    );
    const isPlatform = String(self.rows[0]?.account_code ?? '').toLowerCase() === 'swimit';

    if (crossAccountAudience && !isPlatform) {
      res.status(403).json({ error: 'This audience is only for platform admin' });
      return;
    }

    let accountId = requesterAccountId;
    let targetCode = String(self.rows[0]?.account_code ?? '');
    if (!crossAccountAudience) {
      if (accountCode) {
        if (!isPlatform) {
          res.status(403).json({ error: 'Swimming pool code targeting is only for platform admin' });
          return;
        }
        if (!/^[a-z0-9]{6}$/.test(accountCode)) {
          res.status(400).json({ error: 'Enter a valid 6-character swimming pool code' });
          return;
        }
        const target = await pool.query<{ id: number; account_code: string }>(
          `SELECT id, account_code FROM saas_accounts WHERE account_code = $1`,
          [accountCode],
        );
        if (!target.rows[0]) {
          res.status(404).json({ error: 'Swimming pool code not found' });
          return;
        }
        accountId = Number(target.rows[0].id);
        targetCode = String(target.rows[0].account_code);
      } else if (isPlatform) {
        res.status(400).json({ error: 'Swimming pool code is required' });
        return;
      }
    }

    let mobiles: string[] = [];
    if (audience === 'active_swimmers') {
      const { rows } = await pool.query(
        `SELECT DISTINCT whatsapp_mobile FROM registrations
         WHERE saas_account_id = $1 AND is_active = TRUE AND whatsapp_mobile IS NOT NULL`,
        [accountId],
      );
      mobiles = rows.map((r) => String(r.whatsapp_mobile));
    } else if (audience === 'all_staff') {
      const { rows } = await pool.query(
        `SELECT DISTINCT whatsapp_mobile FROM staff_registrations
         WHERE saas_account_id = $1 AND whatsapp_mobile IS NOT NULL`,
        [accountId],
      );
      mobiles = rows.map((r) => String(r.whatsapp_mobile));
    } else if (audience === 'active_account_admins') {
      const { rows } = await pool.query(
        `SELECT DISTINCT u.mobile
         FROM app_users u
         JOIN saas_accounts a ON a.id = u.saas_account_id
         WHERE COALESCE(u.is_account_admin, FALSE) = TRUE
           AND u.mobile IS NOT NULL
           AND TRIM(u.mobile) <> ''
           AND LOWER(COALESCE(a.status, '')) = 'active'
           AND LOWER(COALESCE(a.account_code, '')) <> 'swimit'`,
      );
      mobiles = rows.map((r) => String(r.mobile));
      targetCode = 'active-admins';
    } else if (audience === 'active_account_users') {
      const { rows } = await pool.query(
        `SELECT DISTINCT u.mobile
         FROM app_users u
         JOIN saas_accounts a ON a.id = u.saas_account_id
         WHERE u.mobile IS NOT NULL
           AND TRIM(u.mobile) <> ''
           AND LOWER(COALESCE(a.status, '')) = 'active'
           AND LOWER(COALESCE(a.account_code, '')) <> 'swimit'`,
      );
      mobiles = rows.map((r) => String(r.mobile));
      targetCode = 'active-users';
    } else {
      res.status(400).json({ error: 'Invalid audience' });
      return;
    }

    const unique = [...new Set(mobiles.map((m) => toE164(m)).filter(Boolean))];
    const billedAccountId = crossAccountAudience ? requesterAccountId : accountId;
    if (!isPlatform || !crossAccountAudience) {
      const broadcastOn = await whatsappBroadcastEnabled(billedAccountId);
      if (!broadcastOn) {
        res.status(403).json({
          error:
            'Turn on WhatsApp broadcast messages on Pass Type before sending broadcasts.',
        });
        return;
      }
    }
    const results = await sendBroadcast({
      mobiles: unique.map((e164) => e164.slice(-10)),
      message,
      saasAccountId: billedAccountId,
    });
    res.json({
      sent: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      total: results.length,
      accountCode: crossAccountAudience ? undefined : targetCode,
      audience,
      results,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Broadcast failed' });
  }
});

/** Pass-expiry notice schedule (daily morning job uses this setting). */
whatsappRouter.get('/pass-expiry-notice', requireTenant, async (req, res) => {
  try {
    const accountId = tenantId(req);
    await pool.query(
      `INSERT INTO pool_core_info (saas_account_id)
       SELECT $1 WHERE NOT EXISTS (
         SELECT 1 FROM pool_core_info WHERE saas_account_id = $1
       )`,
      [accountId],
    );
    const { rows } = await pool.query<NoticeSettingsRow>(NOTICE_SETTINGS_SELECT, [accountId]);
    res.json(noticeSettingsJson(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load pass expiry notice setting' });
  }
});

whatsappRouter.put(
  '/pass-expiry-notice',
  requireTenant,
  requirePages('whatsapp', 'pass-types'),
  async (req, res) => {
  try {
    const accountId = tenantId(req);
    const body = req.body as {
      enabled?: boolean;
      days?: number;
      broadcastEnabled?: boolean;
      acceptCharges?: boolean;
    };
    const days = Math.min(9, Math.max(1, Number(body.days) || 3));

    await pool.query(
      `INSERT INTO pool_core_info (saas_account_id)
       SELECT $1 WHERE NOT EXISTS (
         SELECT 1 FROM pool_core_info WHERE saas_account_id = $1
       )`,
      [accountId],
    );

    const current = await pool.query<NoticeSettingsRow>(NOTICE_SETTINGS_SELECT, [accountId]);
    const previous = noticeSettingsJson(current.rows[0], days);
    let enabled =
      typeof body.enabled === 'boolean' ? body.enabled : Boolean(current.rows[0]?.enabled);
    const broadcastEnabled =
      typeof body.broadcastEnabled === 'boolean'
        ? body.broadcastEnabled
        : Boolean(current.rows[0]?.broadcast_enabled);
    const acceptCharges =
      body.acceptCharges === true || enabled === true || broadcastEnabled === true;

    if (acceptCharges) {
      const actorId = Number(req.auth?.actorUserId);
      await pool.query(
        `UPDATE pool_core_info
         SET whatsapp_paid_messages_accepted = TRUE,
             whatsapp_paid_messages_accepted_at = COALESCE(whatsapp_paid_messages_accepted_at, NOW()),
             whatsapp_paid_messages_accepted_by = COALESCE(
               whatsapp_paid_messages_accepted_by,
               CASE WHEN $2::int IS NOT NULL AND $2 > 0 THEN $2 ELSE NULL END
             ),
             updated_at = NOW()
         WHERE saas_account_id = $1`,
        [accountId, Number.isFinite(actorId) && actorId > 0 ? actorId : null],
      );
    }

    const accepted = acceptCharges || (await paidWhatsAppAccepted(accountId));
    if (enabled && !accepted) {
      res.status(400).json({
        error: 'Accept ₹1 per WhatsApp message before turning on pass-expiry reminders.',
      });
      return;
    }
    if (!accepted) enabled = false;

    await pool.query(
      `UPDATE pool_core_info
       SET pass_expiry_notice_enabled = $2,
           pass_expiry_notice_days = $3,
           whatsapp_broadcast_enabled = $4,
           updated_at = NOW()
       WHERE saas_account_id = $1`,
      [accountId, enabled, days, broadcastEnabled && accepted],
    );

    const { rows } = await pool.query<NoticeSettingsRow>(NOTICE_SETTINGS_SELECT, [accountId]);
    const saved = noticeSettingsJson(rows[0], days);
    const expiryLabel = saved.enabled
      ? `pass-expiry reminder on (${saved.days} days)`
      : 'pass-expiry reminder off';
    const broadcastLabel = saved.broadcastEnabled ? 'broadcast on' : 'broadcast off';
    await recordAudit(req, {
      action: 'update',
      entityType: 'whatsapp_settings',
      entityId: accountId,
      entityLabel: 'WhatsApp settings',
      summary: `Updated WhatsApp settings: ${expiryLabel}, ${broadcastLabel}`,
      details: {
        passExpiryReminder: saved.enabled,
        passExpiryDays: saved.days,
        broadcast: saved.broadcastEnabled,
        previous: {
          passExpiryReminder: previous.enabled,
          passExpiryDays: previous.days,
          broadcast: previous.broadcastEnabled,
        },
      },
    });
    res.json(saved);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save pass expiry notice setting' });
  }
});

/** Send pass-expiry reminders for passes ending within N days (default 7). */
whatsappRouter.post('/notify-expiring', requireTenant, requirePages('whatsapp'), async (req, res) => {
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
