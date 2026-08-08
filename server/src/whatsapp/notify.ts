import { pool } from '../db/pool.js';
import { renderPassCardPng, renderPassQrPng } from '../passCardImage.js';
import { buildUpiPayUri, renderUpiPayQrPng } from '../upiPayQr.js';
import { getWhatsAppConfig } from './config.js';
import {
  formatWhatsAppUserError,
  sendWhatsAppImage,
  sendWhatsAppImageByMediaId,
  sendWhatsAppTemplate,
  sendWhatsAppText,
  uploadWhatsAppMedia,
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

function formatWhatsAppPassDate(value: string) {
  const raw = String(value ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return String(value ?? '').trim() || '—';
  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return date
    .toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
    .replace(',', '');
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
  // Put the password alone on the next line (monospace) so it is easy to select.
  // A second bubble with only the password lets them long-press → Copy that bubble alone.
  const passwordLine = String(params.temporaryPassword).trim();
  const body = [
    `SwimIT login for ${params.accountName}`,
    '',
    `Account code: ${params.accountCode}`,
    `Login URL: ${params.loginUrl}`,
    `User name: ${params.userName}`,
    'Temporary password:',
    `\`${passwordLine}\``,
    '',
    'Please change the password after first login.',
    'Tip: the next message is only the password — long-press it to copy.',
  ].join('\n');
  const passwordOnlyBody = passwordLine;

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

    // Separate bubble: long-press → Copy selects only the password.
    try {
      const passwordMsg = await sendWhatsAppText(params.mobile, passwordOnlyBody);
      await logOutbound({
        saasAccountId: params.saasAccountId,
        toMobile: params.mobile,
        kind: 'login_credentials_password',
        body: passwordOnlyBody,
        status: passwordMsg.skipped ? 'skipped' : 'sent',
      });
    } catch (passwordErr) {
      const passwordMessage =
        passwordErr instanceof Error ? passwordErr.message : 'Password-only send failed';
      await logOutbound({
        saasAccountId: params.saasAccountId,
        toMobile: params.mobile,
        kind: 'login_credentials_password',
        body: passwordOnlyBody,
        status: 'failed',
        error: passwordMessage,
      });
      // Main credentials already sent — treat overall as success.
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
  const validUntil = formatWhatsAppPassDate(params.passValidUntil);
  const passCaption = [
    `Hello ${params.fullName},`,
    'Your SwimIT pass is active.',
    `Pass type: ${params.passType}`,
    `Valid until: ${validUntil}`,
  ].join('\n');
  const qrCaption = [
    `Hello ${params.fullName},`,
    'Your SwimIT pass is active.',
    `Pass type: ${params.passType}`,
    `Valid until: ${validUntil}`,
    'Show this QR at the gate for attendance.',
  ].join('\n');

  const cfg = getWhatsAppConfig();
  if (!cfg.enabled) {
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: 'pass_issued',
      body: passCaption,
      status: 'skipped',
      error: 'WhatsApp is not configured',
    });
    return { skipped: true as const };
  }

  try {
    // Open / refresh the business chat (needed on Meta sandbox for free-form messages).
    try {
      await sendWhatsAppTemplate(params.mobile, 'hello_world', 'en_US');
      await logOutbound({
        saasAccountId: params.saasAccountId,
        toMobile: params.mobile,
        kind: 'pass_issued_session',
        body: 'hello_world',
        status: 'sent',
      });
    } catch (sessionErr) {
      const sessionMessage = sessionErr instanceof Error ? sessionErr.message : 'Template failed';
      await logOutbound({
        saasAccountId: params.saasAccountId,
        toMobile: params.mobile,
        kind: 'pass_issued_session',
        body: 'hello_world',
        status: 'failed',
        error: sessionMessage,
      });
    }

    const { rows } = await pool.query(
      `SELECT r.id, r.full_name, r.pass_type, r.batch, r.coach, r.pass_valid_until,
              r.swimmer_photo_path, pt.duration AS pass_duration,
              pci.pool_name, pci.pool_address, pci.pool_logo_path
       FROM registrations r
       LEFT JOIN pass_types pt
         ON LOWER(TRIM(pt.pass_name)) = LOWER(TRIM(COALESCE(r.pass_type, '')))
        AND pt.saas_account_id = r.saas_account_id
       LEFT JOIN pool_core_info pci ON pci.saas_account_id = r.saas_account_id
       WHERE r.id = $1 AND r.saas_account_id = $2
       LIMIT 1`,
      [params.registrationId, params.saasAccountId],
    );
    const row = rows[0];

    let passSent = false;
    let qrSent = false;
    let lastError = '';

    // 1) Full pass card image
    try {
      const passPng = await renderPassCardPng({
        id: params.registrationId,
        fullName: String(row?.full_name ?? params.fullName),
        passType: String(row?.pass_type ?? params.passType),
        duration: row?.pass_duration ? String(row.pass_duration) : undefined,
        batch: String(row?.batch ?? ''),
        coach: String(row?.coach ?? ''),
        passValidUntil: String(row?.pass_valid_until ?? params.passValidUntil).slice(0, 10),
        photoPath: row?.swimmer_photo_path ? String(row.swimmer_photo_path) : null,
        poolName: String(row?.pool_name ?? ''),
        poolAddress: String(row?.pool_address ?? ''),
        poolLogoPath: row?.pool_logo_path ? String(row.pool_logo_path) : null,
      });
      const passMediaId = await uploadWhatsAppMedia({
        buffer: passPng,
        mimeType: 'image/png',
        filename: `pass-${params.registrationId}.png`,
      });
      const passResult = await sendWhatsAppImageByMediaId(params.mobile, passMediaId, passCaption);
      passSent = !passResult.skipped;
      await logOutbound({
        saasAccountId: params.saasAccountId,
        toMobile: params.mobile,
        kind: 'pass_issued_card',
        body: `${passCaption}\n[full pass image]`,
        status: passResult.skipped ? 'skipped' : 'sent',
      });
    } catch (passErr) {
      console.warn('[whatsapp] full pass image send failed', passErr);
      lastError = passErr instanceof Error ? passErr.message : 'Full pass image failed';
      await logOutbound({
        saasAccountId: params.saasAccountId,
        toMobile: params.mobile,
        kind: 'pass_issued_card',
        body: passCaption,
        status: 'failed',
        error: lastError,
      });
    }

    // 2) Pass QR image
    try {
      const qrPng = await renderPassQrPng(params.registrationId);
      const qrMediaId = await uploadWhatsAppMedia({
        buffer: qrPng,
        mimeType: 'image/png',
        filename: `pass-qr-${params.registrationId}.png`,
      });
      const qrResult = await sendWhatsAppImageByMediaId(params.mobile, qrMediaId, qrCaption);
      qrSent = !qrResult.skipped;
      await logOutbound({
        saasAccountId: params.saasAccountId,
        toMobile: params.mobile,
        kind: 'pass_issued_qr',
        body: `${qrCaption}\n[pass QR image]`,
        status: qrResult.skipped ? 'skipped' : 'sent',
      });
    } catch (qrErr) {
      console.warn('[whatsapp] pass QR image send failed; trying public QR link', qrErr);
      try {
        const qrApi = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(
          `SWIMIT:${params.registrationId}`,
        )}`;
        const imageResult = await sendWhatsAppImage(params.mobile, qrApi, qrCaption);
        qrSent = !imageResult.skipped;
        await logOutbound({
          saasAccountId: params.saasAccountId,
          toMobile: params.mobile,
          kind: 'pass_issued_qr',
          body: `${qrCaption}\n[pass QR image link]`,
          status: imageResult.skipped ? 'skipped' : 'sent',
        });
      } catch (qrLinkErr) {
        const qrMessage = qrLinkErr instanceof Error ? qrLinkErr.message : 'Pass QR image failed';
        lastError = qrMessage;
        await logOutbound({
          saasAccountId: params.saasAccountId,
          toMobile: params.mobile,
          kind: 'pass_issued_qr',
          body: qrCaption,
          status: 'failed',
          error: qrMessage,
        });
      }
    }

    if (!passSent && !qrSent) {
      // Last resort: text only so the swimmer still gets something.
      try {
        await sendWhatsAppText(
          params.mobile,
          [
            passCaption,
            '',
            'Show your pass QR at the gate for attendance.',
            '(Pass/QR images could not be sent right now — ask the desk to Resend.)',
          ].join('\n'),
        );
      } catch {
        /* ignore */
      }
      return {
        skipped: true as const,
        error: formatWhatsAppUserError(lastError || 'Pass and QR send failed', params.mobile),
      };
    }

    if (passSent && qrSent) {
      return { skipped: false as const, result: 'pass_and_qr' as const };
    }

    return {
      skipped: false as const,
      result: passSent ? ('pass_only' as const) : ('qr_only' as const),
      error: formatWhatsAppUserError(
        lastError || (passSent ? 'Pass QR image failed' : 'Full pass image failed'),
        params.mobile,
      ),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed';
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: 'pass_issued',
      body: passCaption,
      status: 'failed',
      error: message,
    });
    return {
      skipped: true as const,
      error: formatWhatsAppUserError(message, params.mobile),
    };
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
  const amountLabel = `₹${params.amount.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
  const hasAmountQr = Boolean(String(params.upiId ?? '').trim());
  const upiPayUri = hasAmountQr
    ? buildUpiPayUri({
        upiId: params.upiId,
        amount: params.amount,
        payeeName: 'SwimIT',
        note: `SwimIT renew ${params.packageName}`.slice(0, 80),
      })
    : '';
  const body = [
    `SwimIT subscription renewal for ${params.accountName}`,
    '',
    `You selected to renew for package: ${params.packageName}`,
    `Duration: ${params.months} month${params.months === 1 ? '' : 's'}`,
    `Amount: *${amountLabel}*`,
    '',
    hasAmountQr
      ? 'Scan the payment QR below, or tap the link to open your UPI app.'
      : 'Please pay the mentioned amount using the QR code shown.',
    upiPayUri ? `Pay now: ${upiPayUri}` : '',
    params.upiId
      ? `After paying, send the screenshot with visible *${params.upiId}* on WhatsApp.`
      : 'After paying, send the payment screenshot on WhatsApp.',
    params.upiId ? `UPI ID: *${params.upiId}*` : '',
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

    if (!result.skipped) {
      const caption = `Pay ${amountLabel} for ${params.packageName}`;
      let amountQrSent = false;
      if (hasAmountQr) {
        try {
          const qrPng = await renderUpiPayQrPng({
            upiId: params.upiId,
            amount: params.amount,
            payeeName: 'SwimIT',
            note: `SwimIT renew ${params.packageName}`.slice(0, 80),
          });
          const mediaId = await uploadWhatsAppMedia({
            buffer: qrPng,
            mimeType: 'image/png',
            filename: `renew-pay-${params.saasAccountId}.png`,
          });
          await sendWhatsAppImageByMediaId(params.mobile, mediaId, caption);
          amountQrSent = true;
        } catch (qrErr) {
          console.warn('[whatsapp] amount-locked renewal QR failed', qrErr);
        }
      }
      if (!amountQrSent && cfg.publicAppUrl && params.paymentQrPath) {
        const qrUrl = `${cfg.publicAppUrl.replace(/\/$/, '')}/uploads/${params.paymentQrPath}`;
        try {
          await sendWhatsAppImage(params.mobile, qrUrl, caption);
        } catch (qrErr) {
          console.warn('[whatsapp] renewal QR image send failed', qrErr);
        }
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
  poolName?: string;
}): Promise<NotifyCredentialsResult> {
  const amountLabel = `₹${params.amount.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
  const hasAmountQr = Boolean(String(params.upiId ?? '').trim()) && params.amount > 0;
  const payeeName = String(params.poolName ?? 'SwimIT').trim() || 'SwimIT';
  const upiPayUri = hasAmountQr
    ? buildUpiPayUri({
        upiId: params.upiId,
        amount: params.amount,
        payeeName,
        note: `Pass ${params.passType}`.slice(0, 80),
      })
    : '';
  const body = [
    `Hello ${params.fullName},`,
    '',
    'Please complete your SwimIT pass payment.',
    `Pass: ${params.passType}`,
    `Amount: *${amountLabel}*`,
    `Valid until: ${params.passValidUntil}`,
    '',
    hasAmountQr
      ? 'Scan the payment QR below, or tap the link to open your UPI app.'
      : 'Pay using the pool QR code / UPI shown.',
    upiPayUri ? `Pay now: ${upiPayUri}` : '',
    params.upiId
      ? `After paying, send the screenshot with visible *${params.upiId}* on WhatsApp.`
      : 'After paying, send the payment screenshot on WhatsApp.',
    params.upiId ? `UPI ID: *${params.upiId}*` : '',
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

    if (!result.skipped) {
      const caption = `Pay ${amountLabel} for ${params.passType}`;
      let amountQrSent = false;
      if (hasAmountQr) {
        try {
          const qrPng = await renderUpiPayQrPng({
            upiId: params.upiId,
            amount: params.amount,
            payeeName,
            note: `Pass ${params.passType}`.slice(0, 80),
          });
          const mediaId = await uploadWhatsAppMedia({
            buffer: qrPng,
            mimeType: 'image/png',
            filename: `pass-pay-${params.saasAccountId}.png`,
          });
          await sendWhatsAppImageByMediaId(params.mobile, mediaId, caption);
          amountQrSent = true;
        } catch (qrErr) {
          console.warn('[whatsapp] amount-locked pass payment QR failed', qrErr);
        }
      }
      if (!amountQrSent && cfg.publicAppUrl && params.paymentQrPath) {
        const qrUrl = `${cfg.publicAppUrl.replace(/\/$/, '')}/uploads/${params.paymentQrPath}`;
        try {
          await sendWhatsAppImage(params.mobile, qrUrl, caption);
        } catch (qrErr) {
          console.warn('[whatsapp] pass payment QR send failed', qrErr);
        }
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

export async function notifyAccountAdminBatchOverLimit(params: {
  mobile: string;
  adminName: string;
  accountName: string;
  swimmerName: string;
  passType: string;
  batch: string;
  coach: string;
  currentCount: number;
  limit: number;
  saasAccountId: number;
  source: 'desk_payment' | 'whatsapp_request' | 'whatsapp_verified';
}): Promise<NotifyCredentialsResult> {
  const sourceLabel =
    params.source === 'desk_payment'
      ? 'desk payment'
      : params.source === 'whatsapp_request'
        ? 'WhatsApp payment request'
        : 'WhatsApp payment confirmation';

  const body = [
    `Hello ${params.adminName || 'Admin'},`,
    '',
    `Batch capacity warning for ${params.accountName}.`,
    '',
    `A swimmer was assigned over the coach limit during ${sourceLabel}.`,
    `Swimmer: ${params.swimmerName}`,
    `Pass: ${params.passType}`,
    `Batch: ${params.batch}`,
    `Coach: ${params.coach}`,
    `Active swimmers with this coach in batch: ${params.currentCount} (limit ${params.limit})`,
    '',
    'Please review batch and coach allocation if needed.',
  ].join('\n');

  if (!getWhatsAppConfig().enabled) {
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: 'batch_coach_over_limit',
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
        kind: 'batch_coach_over_limit_session',
        body: 'hello_world',
        status: 'sent',
      });
    } catch {
      // Continue — free text may still work if a session is open.
    }

    const result = await sendWhatsAppText(params.mobile, body);
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: 'batch_coach_over_limit',
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
      kind: 'batch_coach_over_limit',
      body,
      status: 'failed',
      error: message,
    });
    return { ok: false, error: formatWhatsAppUserError(message, params.mobile) };
  }
}

export async function notifyPackageCapacityWarning(params: {
  saasAccountId: number;
  mobile: string;
  adminName: string;
  accountName: string;
  accountCode: string;
  packageName: string;
  activeSwimmers: number;
  maxActiveSwimmers: number;
  thresholdPct: number;
  reminderKind: string;
}): Promise<NotifyCredentialsResult> {
  const cfg = getWhatsAppConfig();
  const accountCodeLower = String(params.accountCode ?? '').trim().toLowerCase();
  const renewPath = `/${accountCodeLower}/renew-payment`;
  const renewUrl = cfg.publicAppUrl ? `${cfg.publicAppUrl}${renewPath}` : renewPath;
  const usedPct = Math.min(
    100,
    Math.round((params.activeSwimmers / Math.max(1, params.maxActiveSwimmers)) * 100),
  );

  const body = [
    `Hello ${params.adminName || 'Admin'},`,
    '',
    `Warning: active swimmer capacity for ${params.accountName} has reached ${params.thresholdPct}%.`,
    '',
    `Package: ${params.packageName}`,
    `Active swimmers: ${params.activeSwimmers} / ${params.maxActiveSwimmers} (${usedPct}%)`,
    '',
    'Please renew or upgrade your SwimIT package so new swimmers can keep joining.',
    `Renew / upgrade here: ${renewUrl}`,
    '',
    'After paying online, send the payment screenshot here on WhatsApp.',
  ].join('\n');

  if (!cfg.enabled) {
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: params.reminderKind,
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
        kind: `${params.reminderKind}_session`,
        body: 'hello_world',
        status: 'sent',
      });
    } catch {
      // Continue — free text may still work with an open session.
    }

    const result = await sendWhatsAppText(params.mobile, body);
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: params.reminderKind,
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
      kind: params.reminderKind,
      body,
      status: 'failed',
      error: message,
    });
    return { ok: false, error: formatWhatsAppUserError(message, params.mobile) };
  }
}
