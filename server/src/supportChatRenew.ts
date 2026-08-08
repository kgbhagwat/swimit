import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db/pool.js';
import { renewFromDate } from './paymentAmount.js';
import {
  buildRenewQuote,
  formatInrAmount,
  formatRenewQuoteMessage,
  listPaidPackages,
  type RenewQuote,
} from './renewBilling.js';
import { buildUpiPayUri, renderUpiPayQrPng } from './upiPayQr.js';
import { notifyPackageRenewalPayment } from './whatsapp/notify.js';

/** Same folder Express serves at /uploads/support (server/uploads/support). */
const supportUploadDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../uploads/support',
);

export type RenewStep =
  | 'awaiting_renew'
  | 'awaiting_same_or_change'
  | 'awaiting_package'
  | 'quoted'
  | 'done';

export type RenewChoice = { id: string; label: string };

type RenewSession = {
  saasAccountId: number;
  ticketId: number | null;
  step: RenewStep;
  expiresOn: string | null;
  selectedPackageId: number | null;
  months: number;
  packageAmount: number;
  gstAmount: number;
  broadcastCount: number;
  broadcastAmount: number;
  totalAmount: number;
};

export async function ensureRenewSessionTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS support_renew_sessions (
      saas_account_id INT PRIMARY KEY REFERENCES saas_accounts(id) ON DELETE CASCADE,
      ticket_id INT REFERENCES support_tickets(id) ON DELETE SET NULL,
      step TEXT NOT NULL DEFAULT 'awaiting_renew',
      expires_on DATE,
      selected_package_id INT REFERENCES service_packages(id) ON DELETE SET NULL,
      months INT NOT NULL DEFAULT 1,
      package_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      gst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      broadcast_count INT NOT NULL DEFAULT 0,
      broadcast_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (step IN (
        'awaiting_renew',
        'awaiting_same_or_change',
        'awaiting_package',
        'quoted',
        'done'
      ))
    )
  `);
}

async function getOrCreateChannelTicket(accountId: number) {
  const existing = await pool.query<{ id: number }>(
    `SELECT id FROM support_tickets
     WHERE saas_account_id = $1 AND status = 'open'
     ORDER BY updated_at DESC, id DESC LIMIT 1`,
    [accountId],
  );
  if (existing.rows[0]) return Number(existing.rows[0].id);
  const created = await pool.query<{ id: number }>(
    `INSERT INTO support_tickets (
       saas_account_id, created_by_user_id, category, subject, status
     ) VALUES ($1, NULL, 'complaint', 'Support', 'open')
     RETURNING id`,
    [accountId],
  );
  return Number(created.rows[0].id);
}

export async function postPlatformChatMessage(accountId: number, body: string) {
  const ticketId = await getOrCreateChannelTicket(accountId);
  await pool.query(
    `INSERT INTO support_ticket_messages (
       ticket_id, saas_account_id, author_user_id, author_role, body
     ) VALUES ($1, $2, NULL, 'platform', $3)`,
    [ticketId, accountId, body],
  );
  await pool.query(
    `UPDATE support_tickets SET updated_at = NOW() WHERE id = $1`,
    [ticketId],
  );
  return ticketId;
}

async function postPlatformChatImage(
  accountId: number,
  params: { body: string; buffer: Buffer; displayName: string },
) {
  if (!fs.existsSync(supportUploadDir)) {
    fs.mkdirSync(supportUploadDir, { recursive: true });
  }
  const ticketId = await getOrCreateChannelTicket(accountId);
  const storedName = `renew-pay-${accountId}-${Date.now()}.png`;
  fs.writeFileSync(path.join(supportUploadDir, storedName), params.buffer);
  await pool.query(
    `INSERT INTO support_ticket_messages (
       ticket_id, saas_account_id, author_user_id, author_role, body,
       attachment_path, attachment_name, attachment_mime
     ) VALUES ($1, $2, NULL, 'platform', $3, $4, $5, 'image/png')`,
    [ticketId, accountId, params.body, storedName, params.displayName],
  );
  await pool.query(
    `UPDATE support_tickets SET updated_at = NOW() WHERE id = $1`,
    [ticketId],
  );
  return ticketId;
}

async function loadSession(accountId: number): Promise<RenewSession | null> {
  const { rows } = await pool.query(
    `SELECT saas_account_id, ticket_id, step, expires_on::text,
            selected_package_id, months, package_amount, gst_amount,
            broadcast_count, broadcast_amount, total_amount
     FROM support_renew_sessions WHERE saas_account_id = $1`,
    [accountId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    saasAccountId: Number(row.saas_account_id),
    ticketId: row.ticket_id != null ? Number(row.ticket_id) : null,
    step: String(row.step) as RenewStep,
    expiresOn: row.expires_on ? String(row.expires_on).slice(0, 10) : null,
    selectedPackageId:
      row.selected_package_id != null ? Number(row.selected_package_id) : null,
    months: Number(row.months ?? 1),
    packageAmount: Number(row.package_amount ?? 0),
    gstAmount: Number(row.gst_amount ?? 0),
    broadcastCount: Number(row.broadcast_count ?? 0),
    broadcastAmount: Number(row.broadcast_amount ?? 0),
    totalAmount: Number(row.total_amount ?? 0),
  };
}

async function upsertSession(session: Partial<RenewSession> & { saasAccountId: number }) {
  await pool.query(
    `INSERT INTO support_renew_sessions (
       saas_account_id, ticket_id, step, expires_on, selected_package_id, months,
       package_amount, gst_amount, broadcast_count, broadcast_amount, total_amount, updated_at
     ) VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9, $10, $11, NOW())
     ON CONFLICT (saas_account_id) DO UPDATE SET
       ticket_id = EXCLUDED.ticket_id,
       step = EXCLUDED.step,
       expires_on = EXCLUDED.expires_on,
       selected_package_id = EXCLUDED.selected_package_id,
       months = EXCLUDED.months,
       package_amount = EXCLUDED.package_amount,
       gst_amount = EXCLUDED.gst_amount,
       broadcast_count = EXCLUDED.broadcast_count,
       broadcast_amount = EXCLUDED.broadcast_amount,
       total_amount = EXCLUDED.total_amount,
       updated_at = NOW()`,
    [
      session.saasAccountId,
      session.ticketId ?? null,
      session.step ?? 'awaiting_renew',
      session.expiresOn ?? null,
      session.selectedPackageId ?? null,
      session.months ?? 1,
      session.packageAmount ?? 0,
      session.gstAmount ?? 0,
      session.broadcastCount ?? 0,
      session.broadcastAmount ?? 0,
      session.totalAmount ?? 0,
    ],
  );
}

function choicesForStep(step: RenewStep | null | undefined): RenewChoice[] {
  if (step === 'awaiting_renew') {
    return [
      { id: '1', label: 'Renew now' },
      { id: '2', label: 'Remind me later' },
    ];
  }
  if (step === 'awaiting_same_or_change') {
    return [
      { id: '1', label: 'Same package' },
      { id: '2', label: 'Change package' },
    ];
  }
  if (step === 'quoted') {
    return [
      { id: '1', label: 'Confirm & pay' },
      { id: '2', label: 'Cancel' },
    ];
  }
  return [];
}

export async function getRenewChoicesForAccount(accountId: number): Promise<RenewChoice[]> {
  const session = await loadSession(accountId);
  if (!session || session.step === 'done') return [];
  if (session.step === 'awaiting_package') {
    const packages = await listPaidPackages();
    return packages.map((pkg, index) => ({
      id: String(index + 1),
      label: `${pkg.packageName} — ${formatInrAmount(pkg.price)} / ${pkg.billingPeriod}`,
    }));
  }
  return choicesForStep(session.step);
}

async function currentPackageName(accountId: number) {
  const { rows } = await pool.query<{ package_name: string | null; service_package_id: number | null }>(
    `SELECT a.service_package_id, p.package_name
     FROM saas_accounts a
     LEFT JOIN service_packages p ON p.id = a.service_package_id
     WHERE a.id = $1`,
    [accountId],
  );
  return {
    packageId: rows[0]?.service_package_id != null ? Number(rows[0].service_package_id) : null,
    packageName: String(rows[0]?.package_name ?? 'current package'),
  };
}

async function saveQuote(accountId: number, ticketId: number, quote: RenewQuote, expiresOn: string | null) {
  await upsertSession({
    saasAccountId: accountId,
    ticketId,
    step: 'quoted',
    expiresOn,
    selectedPackageId: quote.packageId,
    months: quote.months,
    packageAmount: quote.packageAmount,
    gstAmount: quote.gstAmount,
    broadcastCount: quote.broadcastCount,
    broadcastAmount: quote.broadcastAmount,
    totalAmount: quote.totalAmount,
  });
  await postPlatformChatMessage(accountId, formatRenewQuoteMessage(quote));
}

/** 7-day expiry notice + start renew session. */
export async function sendPackageExpiryChatReminder(params: {
  saasAccountId: number;
  accountName: string;
  subscriptionExpiresAt: string;
}) {
  await ensureRenewSessionTable();
  const expiresOn = String(params.subscriptionExpiresAt).slice(0, 10);
  const existing = await loadSession(params.saasAccountId);
  if (existing && existing.expiresOn === expiresOn && existing.step !== 'done') {
    return { sent: false, reason: 'already_active' as const };
  }

  const ticketId = await postPlatformChatMessage(
    params.saasAccountId,
    [
      `Hello,`,
      '',
      `Your SwimIT package for ${params.accountName} expires on ${expiresOn} (in 7 days).`,
      'Please renew to avoid interruption of service.',
      '',
      'Reply:',
      '1. Renew now',
      '2. Remind me later',
    ].join('\n'),
  );

  await upsertSession({
    saasAccountId: params.saasAccountId,
    ticketId,
    step: 'awaiting_renew',
    expiresOn,
    selectedPackageId: null,
    months: 1,
    packageAmount: 0,
    gstAmount: 0,
    broadcastCount: 0,
    broadcastAmount: 0,
    totalAmount: 0,
  });

  return { sent: true as const };
}

function normalizeChoice(text: string) {
  const raw = String(text ?? '').trim().toLowerCase();
  if (!raw) return '';
  if (/^(1|one|yes|renew|renew now|confirm|confirm & pay|confirm and pay|same|same package)$/.test(raw)) {
    return '1';
  }
  if (/^(2|two|later|remind|remind me later|change|change package|cancel|no)$/.test(raw)) {
    return '2';
  }
  const num = raw.match(/^(\d{1,2})\b/);
  if (num) return num[1];
  return raw;
}

async function startPaidRenewal(params: {
  accountId: number;
  userId: number;
  packageId: number;
  months: number;
  totalAmount: number;
  quote: RenewQuote;
}) {
  const { rows: accountRows } = await pool.query(
    `SELECT id, account_name, account_code, service_package_id, subscription_expires_at::text AS expires
     FROM saas_accounts WHERE id = $1`,
    [params.accountId],
  );
  const account = accountRows[0];
  if (!account) throw new Error('Account not found');

  const { rows: userRows } = await pool.query(
    `SELECT id, mobile, user_name, is_account_admin
     FROM app_users WHERE id = $1 AND saas_account_id = $2`,
    [params.userId, params.accountId],
  );
  const user = userRows[0];
  if (!user || user.is_account_admin !== true) throw new Error('Only account admin can renew');
  const mobile = String(user.mobile ?? '').replace(/\D/g, '').slice(-10);
  if (mobile.length !== 10) throw new Error('Admin mobile is required for WhatsApp payment instructions');

  const renewFrom = renewFromDate(account.expires);

  const pay = await pool.query(
    `SELECT payment_qr_path, upi_id FROM platform_payment_settings WHERE id = 1`,
  );
  const paymentQrPath = pay.rows[0]?.payment_qr_path
    ? String(pay.rows[0].payment_qr_path)
    : null;
  const upiId = String(pay.rows[0]?.upi_id ?? '').trim();
  if (!upiId && !paymentQrPath) {
    throw new Error('SaaS payment QR / UPI is not configured yet.');
  }
  if (!upiId) {
    throw new Error(
      'SwimIT UPI ID is required to create an amount-locked payment QR. Set it under Payment details.',
    );
  }

  await pool.query(
    `UPDATE saas_package_renewals
     SET status = 'cancelled', notes = 'Superseded by chat renewal request'
     WHERE saas_account_id = $1 AND status = 'pending'`,
    [params.accountId],
  );

  const notes = [
    `Chat renew: package ${formatInrAmount(params.quote.packageAmount)}`,
    `GST ${params.quote.gstPercent}% ${formatInrAmount(params.quote.gstAmount)}`,
    `Broadcast ${params.quote.broadcastCount}×₹0.25 = ${formatInrAmount(params.quote.broadcastAmount)}`,
  ].join('; ');

  await pool.query(
    `INSERT INTO saas_package_renewals
     (saas_account_id, requested_by_user_id, from_mobile, current_package_id,
      renew_package_id, months, expected_amount, renew_from, status, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, 'pending', $9)`,
    [
      params.accountId,
      params.userId,
      mobile,
      account.service_package_id,
      params.packageId,
      params.months,
      params.totalAmount,
      renewFrom,
      notes,
    ],
  );

  const upiPayUri = buildUpiPayUri({
    upiId,
    amount: params.totalAmount,
    payeeName: 'SwimIT',
    note: `SwimIT renew ${params.quote.packageName}`.slice(0, 80),
  });
  const qrPng = await renderUpiPayQrPng({
    upiId,
    amount: params.totalAmount,
    payeeName: 'SwimIT',
    note: `SwimIT renew ${params.quote.packageName}`.slice(0, 80),
  });
  await postPlatformChatImage(params.accountId, {
    body: [
      'Payment request created.',
      `Total payable: *${formatInrAmount(params.totalAmount)}*`,
      '',
      'Scan this QR to pay, or tap it / the link to open your UPI app.',
      `Pay now: ${upiPayUri}`,
      `UPI: *${upiId}*`,
      `After paying, send the screenshot with visible *${upiId}* on WhatsApp.`,
    ].join('\n'),
    buffer: qrPng,
    displayName: `payment-qr.png`,
  });

  await notifyPackageRenewalPayment({
    saasAccountId: params.accountId,
    mobile,
    accountName: String(account.account_name ?? 'SwimIT'),
    packageName: params.quote.packageName,
    months: params.months,
    amount: params.totalAmount,
    paymentQrPath,
    upiId,
  });
}

export function isRenewStartCommand(text: string) {
  return /^(renew|renew now|renew package|package renew|start renew)$/i.test(
    String(text ?? '').trim(),
  );
}

/** Chip / numbered replies used by the renew bot — should not badge platform staff. */
export function isRenewChoiceMessage(text: string) {
  const raw = String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!raw) return false;
  if (/^\d{1,2}$/.test(raw)) return true;
  return /^(renew|renew now|renew package|package renew|start renew|same|same package|change|change package|confirm|confirm & pay|confirm and pay|remind me later|later|cancel|yes|no|one|two)$/.test(
    raw,
  );
}

/** Start / restart renew flow (used by account typing "renew" or SwimIT platform). */
export async function startManualRenewPrompt(accountId: number, ticketId: number) {
  await ensureRenewSessionTable();
  const { rows } = await pool.query<{
    account_name: string;
    subscription_expires_at: string | null;
  }>(
    `SELECT account_name, subscription_expires_at::text AS subscription_expires_at
     FROM saas_accounts WHERE id = $1`,
    [accountId],
  );
  const accountName = String(rows[0]?.account_name ?? 'your pool');
  const expiresOn = rows[0]?.subscription_expires_at
    ? String(rows[0].subscription_expires_at).slice(0, 10)
    : null;
  const expiryLine = expiresOn
    ? `Your SwimIT package for ${accountName} expires on ${expiresOn}.`
    : `Renew the SwimIT package for ${accountName}.`;

  await postPlatformChatMessage(
    accountId,
    [
      expiryLine,
      'Would you like to renew now?',
      '',
      'Reply:',
      '1. Renew now',
      '2. Remind me later',
    ].join('\n'),
  );
  await upsertSession({
    saasAccountId: accountId,
    ticketId,
    step: 'awaiting_renew',
    expiresOn,
    selectedPackageId: null,
    months: 1,
    packageAmount: 0,
    gstAmount: 0,
    broadcastCount: 0,
    broadcastAmount: 0,
    totalAmount: 0,
  });
  return choicesForStep('awaiting_renew');
}

type RenewReplyResult = {
  handled: boolean;
  choices: RenewChoice[];
  /** True only for renew chip/numbered replies — do not badge platform staff. */
  suppressPlatformUnread: boolean;
};

/** Handle admin chat reply when a renew session is active. */
export async function handleSupportRenewReply(params: {
  accountId: number;
  userId: number;
  ticketId: number;
  text: string;
}): Promise<RenewReplyResult> {
  await ensureRenewSessionTable();
  const session = await loadSession(params.accountId);
  const wantsRenew = isRenewStartCommand(params.text);
  const choiceLike = isRenewChoiceMessage(params.text);

  if (wantsRenew && (!session || session.step === 'done')) {
    const choices = await startManualRenewPrompt(params.accountId, params.ticketId);
    return { handled: true, choices, suppressPlatformUnread: true };
  }

  if (!session || session.step === 'done') {
    return { handled: false, choices: [], suppressPlatformUnread: false };
  }

  const choice = normalizeChoice(params.text);

  if (session.step === 'awaiting_renew') {
    if (choice === '1') {
      const current = await currentPackageName(params.accountId);
      await upsertSession({
        ...session,
        ticketId: params.ticketId,
        step: 'awaiting_same_or_change',
      });
      await postPlatformChatMessage(
        params.accountId,
        [
          `Would you like to continue with the same package (${current.packageName}) or change package?`,
          '',
          'Reply:',
          '1. Same package',
          '2. Change package',
        ].join('\n'),
      );
      return {
        handled: true,
        choices: choicesForStep('awaiting_same_or_change'),
        suppressPlatformUnread: true,
      };
    }
    if (choice === '2') {
      await upsertSession({ ...session, ticketId: params.ticketId, step: 'done' });
      await postPlatformChatMessage(
        params.accountId,
        'Okay — we will keep this chat open. Type "renew" here anytime before expiry to start again.',
      );
      return { handled: true, choices: [], suppressPlatformUnread: true };
    }
    await postPlatformChatMessage(
      params.accountId,
      'Please reply with 1 (Renew now) or 2 (Remind me later).',
    );
    // Free-text during renew = likely a discussion — badge platform.
    return {
      handled: true,
      choices: choicesForStep('awaiting_renew'),
      suppressPlatformUnread: choiceLike,
    };
  }

  if (session.step === 'awaiting_same_or_change') {
    if (choice === '1') {
      const current = await currentPackageName(params.accountId);
      if (!current.packageId) {
        await upsertSession({ ...session, step: 'awaiting_package' });
        const packages = await listPaidPackages();
        const lines = packages.map(
          (pkg, i) =>
            `${i + 1}. ${pkg.packageName} — ${formatInrAmount(pkg.price)} / ${pkg.billingPeriod}`,
        );
        await postPlatformChatMessage(
          params.accountId,
          ['No current paid package found. Please choose a package:', '', ...lines].join('\n'),
        );
        return {
          handled: true,
          choices: packages.map((pkg, i) => ({
            id: String(i + 1),
            label: `${pkg.packageName} — ${formatInrAmount(pkg.price)} / ${pkg.billingPeriod}`,
          })),
          suppressPlatformUnread: true,
        };
      }
      const quote = await buildRenewQuote({
        saasAccountId: params.accountId,
        packageId: current.packageId,
        months: 1,
      });
      if (!quote) {
        await postPlatformChatMessage(
          params.accountId,
          'Current package cannot be renewed (trial or inactive). Please choose another package (reply 2).',
        );
        return {
          handled: true,
          choices: choicesForStep('awaiting_same_or_change'),
          suppressPlatformUnread: true,
        };
      }
      await saveQuote(params.accountId, params.ticketId, quote, session.expiresOn);
      return {
        handled: true,
        choices: choicesForStep('quoted'),
        suppressPlatformUnread: true,
      };
    }
    if (choice === '2') {
      const packages = await listPaidPackages();
      await upsertSession({
        ...session,
        ticketId: params.ticketId,
        step: 'awaiting_package',
      });
      const lines = packages.map(
        (pkg, i) =>
          `${i + 1}. ${pkg.packageName} — ${formatInrAmount(pkg.price)} / ${pkg.billingPeriod}`,
      );
      await postPlatformChatMessage(
        params.accountId,
        ['Available packages:', '', ...lines, '', 'Reply with the package number.'].join('\n'),
      );
      return {
        handled: true,
        choices: packages.map((pkg, i) => ({
          id: String(i + 1),
          label: `${pkg.packageName} — ${formatInrAmount(pkg.price)} / ${pkg.billingPeriod}`,
        })),
        suppressPlatformUnread: true,
      };
    }
    await postPlatformChatMessage(
      params.accountId,
      'Please reply with 1 (Same package) or 2 (Change package).',
    );
    return {
      handled: true,
      choices: choicesForStep('awaiting_same_or_change'),
      suppressPlatformUnread: choiceLike,
    };
  }

  if (session.step === 'awaiting_package') {
    const packages = await listPaidPackages();
    const index = Number(choice) - 1;
    const selected = packages[index];
    if (!selected) {
      await postPlatformChatMessage(
        params.accountId,
        `Please reply with a package number from 1 to ${packages.length}.`,
      );
      return {
        handled: true,
        choices: packages.map((pkg, i) => ({
          id: String(i + 1),
          label: `${pkg.packageName} — ${formatInrAmount(pkg.price)} / ${pkg.billingPeriod}`,
        })),
        suppressPlatformUnread: choiceLike,
      };
    }
    const quote = await buildRenewQuote({
      saasAccountId: params.accountId,
      packageId: selected.id,
      months: 1,
    });
    if (!quote) {
      await postPlatformChatMessage(params.accountId, 'That package cannot be renewed. Pick another.');
      return {
        handled: true,
        choices: packages.map((pkg, i) => ({
          id: String(i + 1),
          label: `${pkg.packageName} — ${formatInrAmount(pkg.price)} / ${pkg.billingPeriod}`,
        })),
        suppressPlatformUnread: true,
      };
    }
    await saveQuote(params.accountId, params.ticketId, quote, session.expiresOn);
    return {
      handled: true,
      choices: choicesForStep('quoted'),
      suppressPlatformUnread: true,
    };
  }

  if (session.step === 'quoted') {
    if (choice === '1') {
      if (!session.selectedPackageId) {
        await upsertSession({ ...session, step: 'done' });
        return { handled: true, choices: [], suppressPlatformUnread: true };
      }
      const quote = await buildRenewQuote({
        saasAccountId: params.accountId,
        packageId: session.selectedPackageId,
        months: session.months,
      });
      if (!quote) {
        await postPlatformChatMessage(params.accountId, 'Unable to build quote. Please try again later.');
        await upsertSession({ ...session, step: 'done' });
        return { handled: true, choices: [], suppressPlatformUnread: true };
      }
      try {
        await startPaidRenewal({
          accountId: params.accountId,
          userId: params.userId,
          packageId: quote.packageId,
          months: quote.months,
          totalAmount: quote.totalAmount,
          quote,
        });
        await upsertSession({ ...session, step: 'done', totalAmount: quote.totalAmount });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to start renewal';
        await postPlatformChatMessage(
          params.accountId,
          `${message}\n\nYou can reply 1 to try again, or 2 to cancel.`,
        );
        return {
          handled: true,
          choices: choicesForStep('quoted'),
          suppressPlatformUnread: true,
        };
      }
      return { handled: true, choices: [], suppressPlatformUnread: true };
    }
    if (choice === '2') {
      await upsertSession({ ...session, step: 'done' });
      await postPlatformChatMessage(
        params.accountId,
        'Renewal cancelled. Type "renew" in this chat anytime to start again.',
      );
      return { handled: true, choices: [], suppressPlatformUnread: true };
    }
    await postPlatformChatMessage(
      params.accountId,
      'Please reply with 1 (Confirm & pay) or 2 (Cancel).',
    );
    return {
      handled: true,
      choices: choicesForStep('quoted'),
      suppressPlatformUnread: choiceLike,
    };
  }

  return { handled: false, choices: [], suppressPlatformUnread: false };
}
