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
