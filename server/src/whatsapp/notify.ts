import { pool } from '../db/pool.js';
import { getWhatsAppConfig } from './config.js';
import {
  formatWhatsAppUserError,
  sendWhatsAppImage,
  sendWhatsAppTemplate,
  sendWhatsAppText,
} from './client.js';

async function logOutbound(params: {
  saasAccountId?: number | null;
  toMobile: string;
  kind: string;
  body: string;
  status: 'sent' | 'skipped' | 'failed';
  error?: string;
}) {
  try {
    await pool.query(
      `INSERT INTO whatsapp_outbound
       (saas_account_id, to_mobile, kind, body, status, error)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        params.saasAccountId ?? null,
        params.toMobile,
        params.kind,
        params.body,
        params.status,
        params.error ?? null,
      ],
    );
  } catch (err) {
    console.error('[whatsapp] failed to log outbound', err);
  }
}

export type NotifyCredentialsResult =
  | { ok: true; skipped: false; to: string; messageId: string }
  | { ok: true; skipped: true }
  | { ok: false; error: string };

/**
 * Send login credentials on WhatsApp.
 * Meta test numbers often drop free text until a template opens the chat,
 * so we send hello_world first, then the credentials text.
 */
export async function notifyLoginCredentials(params: {
  mobile: string;
  accountName: string;
  accountCode: string;
  loginUrl: string;
  userName: string;
  temporaryPassword: string;
  saasAccountId?: number;
}): Promise<NotifyCredentialsResult> {
  const body = [
    `SwimIT login for ${params.accountName}`,
    '',
    `Account code: ${params.accountCode}`,
    `Login URL: ${params.loginUrl}`,
    `User name: ${params.userName}`,
    `Temporary password: ${params.temporaryPassword}`,
    '',
    'Please change the password after first login.',
  ].join('\n');

  const cfg = getWhatsAppConfig();
  if (!cfg.enabled) {
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: 'login_credentials',
      body,
      status: 'skipped',
      error: 'WhatsApp is not configured',
    });
    return { ok: true, skipped: true };
  }

  try {
    // Open / refresh the business chat (required on Meta sandbox for free text).
    try {
      await sendWhatsAppTemplate(params.mobile, 'hello_world', 'en_US');
      await logOutbound({
        saasAccountId: params.saasAccountId,
        toMobile: params.mobile,
        kind: 'login_credentials_session',
        body: 'hello_world',
        status: 'sent',
      });
    } catch (sessionErr) {
      const sessionMessage = sessionErr instanceof Error ? sessionErr.message : 'Template failed';
      await logOutbound({
        saasAccountId: params.saasAccountId,
        toMobile: params.mobile,
        kind: 'login_credentials_session',
        body: 'hello_world',
        status: 'failed',
        error: sessionMessage,
      });
      // Continue — text may still work if a session is already open.
    }

    const result = await sendWhatsAppText(params.mobile, body);
    if (result.skipped) {
      await logOutbound({
        saasAccountId: params.saasAccountId,
        toMobile: params.mobile,
        kind: 'login_credentials',
        body,
        status: 'skipped',
      });
      return { ok: true, skipped: true };
    }

    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: 'login_credentials',
      body,
      status: 'sent',
    });
    return {
      ok: true,
      skipped: false,
      to: result.to,
      messageId: result.messageId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed';
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: 'login_credentials',
      body,
      status: 'failed',
      error: message,
    });
    return {
      ok: false,
      error: formatWhatsAppUserError(message, params.mobile),
    };
  }
}

export async function notifyRegistrationConfirmation(params: {
  mobile: string;
  fullName: string;
  saasAccountId: number;
  poolName?: string;
}) {
  const atPool = params.poolName ? ` at ${params.poolName}` : '';
  const body = [
    `Hello ${params.fullName},`,
    '',
    `Your registration form${atPool} has been successfully submitted.`,
    '',
    'After online payment, please send the payment screenshot here.',
  ].join('\n');

  try {
    const result = await sendWhatsAppText(params.mobile, body);
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: 'registration_confirmation',
      body,
      status: result.skipped ? 'skipped' : 'sent',
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed';
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: 'registration_confirmation',
      body,
      status: 'failed',
      error: message,
    });
    return { skipped: true as const, error: message };
  }
}

export async function notifyPassIssued(params: {
  mobile: string;
  fullName: string;
  passType: string;
  passValidUntil: string;
  registrationId: number;
  accountCode: string;
  saasAccountId: number;
}) {
  const cfg = getWhatsAppConfig();
  const passPath = `/${params.accountCode}/pass/${params.registrationId}`;
  const passUrl = cfg.publicAppUrl ? `${cfg.publicAppUrl}${passPath}` : passPath;
  const idPath = `/${params.accountCode}/id-card/${params.registrationId}`;
  const idUrl = cfg.publicAppUrl ? `${cfg.publicAppUrl}${idPath}` : idPath;

  const body = [
    `Hello ${params.fullName},`,
    '',
    'Your SwimIT pass is active.',
    `Pass type: ${params.passType}`,
    `Valid until: ${params.passValidUntil}`,
    '',
    `Digital pass: ${passUrl}`,
    `ID card: ${idUrl}`,
    '',
    'Show the QR at the gate for attendance.',
  ].join('\n');

  try {
    const result = await sendWhatsAppText(params.mobile, body);
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: 'pass_issued',
      body,
      status: result.skipped ? 'skipped' : 'sent',
    });

    // Public URL image for QR works when PUBLIC_APP_URL is reachable by Meta
    if (cfg.publicAppUrl && !result.skipped) {
      const qrApi = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(`SWIMIT:${params.registrationId}`)}`;
      try {
        await sendWhatsAppImage(params.mobile, qrApi, 'Your SwimIT pass QR');
      } catch (qrErr) {
        console.warn('[whatsapp] QR image send failed', qrErr);
      }
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed';
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: 'pass_issued',
      body,
      status: 'failed',
      error: message,
    });
    return { skipped: true as const, error: message };
  }
}

export async function notifyPassExpiring(params: {
  mobile: string;
  fullName: string;
  passType: string;
  passValidUntil: string;
  saasAccountId: number;
}) {
  const body = [
    `Hello ${params.fullName},`,
    '',
    'Your SwimIT pass is expiring soon.',
    `Pass type: ${params.passType || '—'}`,
    `Valid until: ${params.passValidUntil}`,
    '',
    'Please renew at the pool desk to continue entry.',
  ].join('\n');

  try {
    const result = await sendWhatsAppText(params.mobile, body);
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: 'pass_expiry',
      body,
      status: result.skipped ? 'skipped' : 'sent',
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed';
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: 'pass_expiry',
      body,
      status: 'failed',
      error: message,
    });
    return { skipped: true as const, error: message };
  }
}

export async function notifySubscriptionExpiring(params: {
  mobile: string;
  fullName: string;
  accountName: string;
  accountCode: string;
  subscriptionExpiresAt: string;
  saasAccountId: number;
}): Promise<NotifyCredentialsResult> {
  const cfg = getWhatsAppConfig();
  const accountCodeLower = String(params.accountCode ?? '').trim().toLowerCase();
  const renewPath = `/${accountCodeLower}/renew-payment`;
  const renewUrl = cfg.publicAppUrl ? `${cfg.publicAppUrl}${renewPath}` : renewPath;

  const body = [
    `Hello ${params.fullName},`,
    '',
    `Your SwimIT subscription for ${params.accountName} will expire on ${params.subscriptionExpiresAt}.`,
    '',
    'Please renew now to keep your pool operations running.',
    `Renew here: ${renewUrl}`,
    '',
    'After renewing and paying online, send the payment screenshot here on WhatsApp.',
  ].join('\n');

  if (!cfg.enabled) {
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: 'saas_subscription_expiry_5d',
      body,
      status: 'skipped',
      error: 'WhatsApp is not configured',
    });
    return { ok: true, skipped: true };
  }

  try {
    // Open / refresh the business chat.
    try {
      await sendWhatsAppTemplate(params.mobile, 'hello_world', 'en_US');
      await logOutbound({
        saasAccountId: params.saasAccountId,
        toMobile: params.mobile,
        kind: 'saas_subscription_expiry_5d_session',
        body: 'hello_world',
        status: 'sent',
      });
    } catch {
      // Continue — free text often still works once a session is open.
    }

    const result = await sendWhatsAppText(params.mobile, body);
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: 'saas_subscription_expiry_5d',
      body,
      status: result.skipped ? 'skipped' : 'sent',
    });

    return result.skipped
      ? { ok: true, skipped: true }
      : {
          ok: true,
          skipped: false,
          to: result.to,
          messageId: result.messageId,
        };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed';
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: 'saas_subscription_expiry_5d',
      body,
      status: 'failed',
      error: message,
    });
    return { ok: false, error: formatWhatsAppUserError(message, params.mobile) };
  }
}

/** WhatsApp a public open-form link + QR to desk staff mobile. */
export async function notifyOpenFormQr(params: {
  mobile: string;
  form: 'swimmer' | 'staff';
  accountCode: string;
  poolName?: string;
  poolAddress?: string;
  saasAccountId: number;
}): Promise<NotifyCredentialsResult> {
  const cfg = getWhatsAppConfig();
  const path =
    params.form === 'staff'
      ? `/${params.accountCode}/open/staff-register`
      : `/${params.accountCode}/open/register`;
  const formUrl = cfg.publicAppUrl ? `${cfg.publicAppUrl}${path}` : path;
  const title = params.form === 'staff' ? 'Staff registration' : 'Swimmer registration';
  const body = [
    params.poolName ? `${params.poolName}` : 'SwimIT',
    params.poolAddress ? params.poolAddress : null,
    '',
    `${title} form:`,
    formUrl,
    '',
    'Scan the QR code or open the link to fill the form.',
  ]
    .filter((line) => line !== null)
    .join('\n');

  if (!cfg.enabled) {
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: 'open_form_qr',
      body,
      status: 'skipped',
      error: 'WhatsApp is not configured',
    });
    return { ok: true, skipped: true };
  }

  try {
    try {
      await sendWhatsAppTemplate(params.mobile, 'hello_world', 'en_US');
    } catch {
      // Session may already be open.
    }

    const result = await sendWhatsAppText(params.mobile, body);
    if (result.skipped) {
      await logOutbound({
        saasAccountId: params.saasAccountId,
        toMobile: params.mobile,
        kind: 'open_form_qr',
        body,
        status: 'skipped',
      });
      return { ok: true, skipped: true };
    }

    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: 'open_form_qr',
      body,
      status: 'sent',
    });

    if (cfg.publicAppUrl) {
      const qrApi = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(formUrl)}`;
      try {
        await sendWhatsAppImage(
          params.mobile,
          qrApi,
          params.poolName ? `${params.poolName} — ${title} QR` : `${title} QR`,
        );
      } catch (qrErr) {
        console.warn('[whatsapp] form QR image send failed', qrErr);
      }
    }

    return {
      ok: true,
      skipped: false,
      to: result.to,
      messageId: result.messageId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed';
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: 'open_form_qr',
      body,
      status: 'failed',
      error: message,
    });
    return { ok: false, error: formatWhatsAppUserError(message, params.mobile) };
  }
}

export async function sendBroadcast(params: {
  mobiles: string[];
  message: string;
  saasAccountId: number;
}) {
  const results: { mobile: string; ok: boolean; error?: string; messageId?: string }[] = [];
  for (const mobile of params.mobiles) {
    try {
      const result = await sendWhatsAppText(mobile, params.message);
      await logOutbound({
        saasAccountId: params.saasAccountId,
        toMobile: mobile,
        kind: 'broadcast',
        body: params.message,
        status: result.skipped ? 'skipped' : 'sent',
      });
      results.push({
        mobile,
        ok: !result.skipped,
        messageId: 'messageId' in result ? result.messageId : undefined,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Send failed';
      await logOutbound({
        saasAccountId: params.saasAccountId,
        toMobile: mobile,
        kind: 'broadcast',
        body: params.message,
        status: 'failed',
        error,
      });
      results.push({ mobile, ok: false, error });
    }
  }
  return results;
}

export async function notifyPackageRenewalPayment(params: {
  mobile: string;
  accountName: string;
  packageName: string;
  months: number;
  amount: number;
  upiId: string;
  paymentQrPath?: string | null;
  saasAccountId: number;
}): Promise<NotifyCredentialsResult> {
  const amountLabel = `₹${params.amount.toLocaleString('en-IN')}`;
  const body = [
    `SwimIT subscription renewal for ${params.accountName}`,
    '',
    `You selected to renew for package: ${params.packageName}`,
    `Duration: ${params.months} month${params.months === 1 ? '' : 's'}`,
    `Amount: ${amountLabel}`,
    '',
    'Please pay the mentioned amount using the QR code shown and send the payment screenshot here.',
    params.upiId ? `UPI ID: ${params.upiId}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const cfg = getWhatsAppConfig();
  if (!cfg.enabled) {
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: 'package_renewal_payment',
      body,
      status: 'skipped',
      error: 'WhatsApp is not configured',
    });
    return { ok: true, skipped: true };
  }

  try {
    try {
      await sendWhatsAppTemplate(params.mobile, 'hello_world', 'en_US');
      await logOutbound({
        saasAccountId: params.saasAccountId,
        toMobile: params.mobile,
        kind: 'package_renewal_session',
        body: 'hello_world',
        status: 'sent',
      });
    } catch (sessionErr) {
      const sessionMessage = sessionErr instanceof Error ? sessionErr.message : 'Template failed';
      await logOutbound({
        saasAccountId: params.saasAccountId,
        toMobile: params.mobile,
        kind: 'package_renewal_session',
        body: 'hello_world',
        status: 'failed',
        error: sessionMessage,
      });
    }

    const result = await sendWhatsAppText(params.mobile, body);
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: 'package_renewal_payment',
      body,
      status: result.skipped ? 'skipped' : 'sent',
    });

    if (cfg.publicAppUrl && params.paymentQrPath && !result.skipped) {
      const qrUrl = `${cfg.publicAppUrl.replace(/\/$/, '')}/uploads/${params.paymentQrPath}`;
      try {
        await sendWhatsAppImage(
          params.mobile,
          qrUrl,
          `Pay ${amountLabel} for ${params.packageName}`,
        );
      } catch (qrErr) {
        console.warn('[whatsapp] renewal QR image send failed', qrErr);
      }
    }

    return result.skipped
      ? { ok: true, skipped: true }
      : {
          ok: true,
          skipped: false,
          to: result.to,
          messageId: result.messageId,
        };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed';
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: 'package_renewal_payment',
      body,
      status: 'failed',
      error: message,
    });
    return { ok: false, error: formatWhatsAppUserError(message, params.mobile) };
  }
}

/** Ask swimmer to pay pool UPI/QR and send payment screenshot on WhatsApp. */
export async function notifyPassPaymentRequest(params: {
  mobile: string;
  fullName: string;
  passType: string;
  amount: number;
  passValidUntil: string;
  upiId: string;
  paymentQrPath?: string | null;
  saasAccountId: number;
}): Promise<NotifyCredentialsResult> {
  const amountLabel = `₹${params.amount.toLocaleString('en-IN')}`;
  const body = [
    `Hello ${params.fullName},`,
    '',
    'Please complete your SwimIT pass payment.',
    `Pass: ${params.passType}`,
    `Amount: ${amountLabel}`,
    `Valid until: ${params.passValidUntil}`,
    '',
    'Pay using the pool QR code / UPI shown and send the payment screenshot here.',
    params.upiId ? `UPI ID: ${params.upiId}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const cfg = getWhatsAppConfig();
  if (!cfg.enabled) {
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: 'pass_payment_request',
      body,
      status: 'skipped',
      error: 'WhatsApp is not configured',
    });
    return { ok: true, skipped: true };
  }

  try {
    try {
      await sendWhatsAppTemplate(params.mobile, 'hello_world', 'en_US');
    } catch {
      // Session may already be open.
    }

    const result = await sendWhatsAppText(params.mobile, body);
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: 'pass_payment_request',
      body,
      status: result.skipped ? 'skipped' : 'sent',
    });

    if (cfg.publicAppUrl && params.paymentQrPath && !result.skipped) {
      const qrUrl = `${cfg.publicAppUrl.replace(/\/$/, '')}/uploads/${params.paymentQrPath}`;
      try {
        await sendWhatsAppImage(
          params.mobile,
          qrUrl,
          `Pay ${amountLabel} for ${params.passType}`,
        );
      } catch (qrErr) {
        console.warn('[whatsapp] pass payment QR send failed', qrErr);
      }
    }

    return result.skipped
      ? { ok: true, skipped: true }
      : {
          ok: true,
          skipped: false,
          to: result.to,
          messageId: result.messageId,
        };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed';
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: 'pass_payment_request',
      body,
      status: 'failed',
      error: message,
    });
    return { ok: false, error: formatWhatsAppUserError(message, params.mobile) };
  }
}
