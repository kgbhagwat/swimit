import nodemailer from 'nodemailer';

export type SendEmailResult =
  | { ok: true; skipped: false; messageId?: string }
  | { ok: true; skipped: true }
  | { ok: false; error: string };

function smtpConfigured() {
  return Boolean(
    String(process.env.SMTP_HOST ?? '').trim() &&
      String(process.env.SMTP_FROM ?? '').trim(),
  );
}

export function isEmailDeliveryConfigured() {
  return smtpConfigured();
}

function createTransport() {
  const host = String(process.env.SMTP_HOST ?? '').trim();
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = String(process.env.SMTP_USER ?? '').trim();
  const pass = String(process.env.SMTP_PASS ?? '');
  const secure = String(process.env.SMTP_SECURE ?? '').toLowerCase() === 'true' || port === 465;

  return nodemailer.createTransport({
    host,
    port: Number.isFinite(port) ? port : 587,
    secure,
    auth: user ? { user, pass } : undefined,
  });
}

/** Send a signup verification OTP by email when SMTP is configured. */
export async function sendOtpEmail(params: {
  to: string;
  code: string;
}): Promise<SendEmailResult> {
  const to = String(params.to ?? '').trim();
  const code = String(params.code ?? '').trim();
  if (!to) return { ok: false, error: 'Email address is empty' };
  if (!/^\d{6}$/.test(code)) return { ok: false, error: 'Invalid OTP code' };
  if (!smtpConfigured()) {
    return { ok: true, skipped: true };
  }

  const from = String(process.env.SMTP_FROM ?? '').trim();
  const subject = 'SwimIT verification code';
  const text = [
    'Your SwimIT email verification code is:',
    '',
    code,
    '',
    'This code expires in 10 minutes.',
    'If you did not request this, you can ignore this email.',
  ].join('\n');

  try {
    const info = await createTransport().sendMail({
      from,
      to,
      subject,
      text,
    });
    return { ok: true, skipped: false, messageId: info.messageId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to send email' };
  }
}

/** Alert an admin that a user is trying to sign in far from the pool. */
export async function sendRemoteLoginAlertEmail(params: {
  to: string;
  adminName: string;
  accountName: string;
  accountCode: string;
  userName: string;
  distanceLabel: string;
  whenLabel: string;
  approveUrl: string;
  denyUrl: string;
}): Promise<SendEmailResult> {
  const to = String(params.to ?? '').trim();
  if (!to) return { ok: false, error: 'Email address is empty' };
  if (!smtpConfigured()) {
    return { ok: true, skipped: true };
  }

  const from = String(process.env.SMTP_FROM ?? '').trim();
  const subject = `SwimIT remote login request — ${params.accountName}`;
  const text = [
    `Hello ${params.adminName || 'Admin'},`,
    '',
    `A user is signing in far from the pool and needs remote access approval.`,
    '',
    `Account: ${params.accountName} (${params.accountCode})`,
    `User: ${params.userName}`,
    `Distance: ${params.distanceLabel}`,
    `Time: ${params.whenLabel}`,
    '',
    `Approve remote access (24 hours): ${params.approveUrl}`,
    `Deny: ${params.denyUrl}`,
    '',
    'If you did not expect this, deny the request.',
  ].join('\n');

  try {
    const info = await createTransport().sendMail({
      from,
      to,
      subject,
      text,
    });
    return { ok: true, skipped: false, messageId: info.messageId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to send email' };
  }
}

/** Send a temporary login password by email when SMTP is configured. */
export async function sendTempPasswordEmail(params: {
  to: string;
  accountName: string;
  accountCode: string;
  loginUrl: string;
  userName: string;
  temporaryPassword: string;
}): Promise<SendEmailResult> {
  const to = String(params.to ?? '').trim();
  if (!to) return { ok: false, error: 'Email address is empty' };
  if (!smtpConfigured()) {
    return { ok: true, skipped: true };
  }

  const from = String(process.env.SMTP_FROM ?? '').trim();
  const subject = `SwimIT temporary password — ${params.accountName}`;
  const text = [
    `SwimIT login for ${params.accountName}`,
    '',
    `Account code: ${params.accountCode}`,
    `Login URL: ${params.loginUrl}`,
    `User name: ${params.userName}`,
    `Temporary password: ${params.temporaryPassword}`,
    '',
    'Please change the password after you sign in.',
    'If you did not request this, contact your pool administrator.',
  ].join('\n');

  try {
    const info = await createTransport().sendMail({
      from,
      to,
      subject,
      text,
    });
    return { ok: true, skipped: false, messageId: info.messageId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to send email' };
  }
}
