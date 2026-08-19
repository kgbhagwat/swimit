import { pool } from '../db/pool.js';
import { renderPassCardPng, renderPassQrPng, renderUrlQrPng } from '../passCardImage.js';
import { buildUpiHttpsLaunchUrl, buildUpiPayUri, renderUpiPayQrPng } from '../upiPayQr.js';
import { getWhatsAppConfig } from './config.js';
import { ensureFormQrTemplates, ensurePassPayQrTemplate, ensureRegistrationHiTemplate, formQrTemplateStatus, passPayQrTemplateStatus } from './ensureFormQrTemplate.js';
import { WA_TEMPLATES } from './templateCatalog.js';
import {
  formatWhatsAppUserError,
  sendWhatsAppImage,
  sendWhatsAppImageByMediaId,
  sendWhatsAppTemplateWithBody,
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

async function sendTemplateInKnownLanguages(params: {
  mobile: string;
  templateName: string;
  bodyTexts: string[];
  copyCodeButton?: boolean;
  headerImage?: { id?: string; link?: string };
  urlButtonSuffix?: string;
}) {
  const preferred = String(process.env.WHATSAPP_OTP_TEMPLATE_LANG ?? 'en').trim() || 'en';
  // SwimIT templates were created as `en`. 132001 means that language has no translation,
  // so keep trying the other codes instead of stopping on the first miss.
  const languages = [...new Set(['en', preferred, 'en_US'])];
  let lastError = 'Template failed';
  const attempts = params.urlButtonSuffix
    ? [{ urlButtonSuffix: params.urlButtonSuffix }, { urlButtonSuffix: undefined }]
    : [{ urlButtonSuffix: undefined }];
  for (const attempt of attempts) {
    for (const lang of languages) {
      try {
        const sent = await sendWhatsAppTemplateWithBody(
          params.mobile,
          params.templateName,
          lang,
          params.bodyTexts,
          {
            copyCodeButton: params.copyCodeButton === true,
            headerImage: params.headerImage,
            urlButtonSuffix: attempt.urlButtonSuffix,
          },
        );
        if (!sent.skipped) return sent;
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Template failed';
      }
    }
  }
  throw new Error(lastError);
}

function templateText(value: string, max = 60) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return (text ? text.slice(0, max) : '-') || '-';
}

async function deliverNotice(params: {
  mobile: string;
  saasAccountId?: number;
  kind: string;
  templateName: string;
  bodyTexts: string[];
  fallbackBody: string;
  /** Session text is not delivered unless the person already chatted with the business. */
  allowTextFallback?: boolean;
  headerImage?: { id?: string; link?: string };
  urlButtonSuffix?: string;
  previewUrl?: boolean;
}): Promise<NotifyCredentialsResult> {
  const cfg = getWhatsAppConfig();
  if (!cfg.enabled) {
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: params.kind,
      body: params.fallbackBody,
      status: 'skipped',
      error: 'WhatsApp is not configured',
    });
    return { ok: true, skipped: true };
  }

  try {
    const sent = await sendTemplateInKnownLanguages({
      mobile: params.mobile,
      templateName: params.templateName,
      bodyTexts: params.bodyTexts,
      copyCodeButton: false,
      headerImage: params.headerImage,
      urlButtonSuffix: params.urlButtonSuffix,
    });
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: params.kind,
      body: params.templateName,
      status: 'sent',
    });
    return {
      ok: true,
      skipped: false,
      to: sent.to,
      messageId: sent.messageId,
    };
  } catch (templateErr) {
    const templateMessage =
      templateErr instanceof Error ? templateErr.message : 'Template failed';
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: `${params.kind}_template`,
      body: params.templateName,
      status: 'failed',
      error: templateMessage,
    });
    if (params.allowTextFallback === false) {
      return { ok: false, error: formatWhatsAppUserError(templateMessage, params.mobile) };
    }
  }

  try {
    const result = await sendWhatsAppText(params.mobile, params.fallbackBody, {
      previewUrl: params.previewUrl === true,
    });
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: params.kind,
      body: params.fallbackBody,
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
      kind: params.kind,
      body: params.fallbackBody,
      status: 'failed',
      error: message,
    });
    return { ok: false, error: formatWhatsAppUserError(message, params.mobile) };
  }
}

/**
 * Send login credentials on WhatsApp in a single message, including the temporary password.
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
  const passwordLine = String(params.temporaryPassword).trim();
  const body = [
    `Your SwimIT account ${params.accountName} is ready.`,
    `Code: ${params.accountCode}`,
    `Sign-in link: ${params.loginUrl}`,
    `User: ${params.userName}`,
    `Password: ${passwordLine}`,
    'This sign-in information sent on email as well.',
    'Please update it after first sign-in',
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

  const loginWithPasswordTexts = [
    templateText(params.accountName),
    templateText(params.accountCode, 32),
    templateText(params.loginUrl, 200),
    templateText(params.userName, 32),
    templateText(passwordLine, 32),
  ];
  // Older 4-variable template: username only (no trailing full stop — it can look like part of the login).
  const loginInfoTexts = [
    templateText(params.accountName),
    templateText(params.accountCode, 32),
    templateText(params.loginUrl, 200),
    templateText(params.userName, 32),
  ];

  async function sent(templateName: string, to: string, messageId: string): Promise<NotifyCredentialsResult> {
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: 'login_credentials',
      body: templateName,
      status: 'sent',
    });
    return { ok: true, skipped: false, to, messageId };
  }

  async function templateFailed(templateName: string, err: unknown) {
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.mobile,
      kind: 'login_credentials_template',
      body: templateName,
      status: 'failed',
      error: err instanceof Error ? err.message : 'Template failed',
    });
  }

  try {
    const readyTemplate = String(
      process.env.WHATSAPP_ACCOUNT_LOGIN_READY_TEMPLATE ?? WA_TEMPLATES.accountLoginReady,
    ).trim();
    if (readyTemplate) {
      try {
        const templated = await sendTemplateInKnownLanguages({
          mobile: params.mobile,
          templateName: readyTemplate,
          copyCodeButton: false,
          bodyTexts: loginWithPasswordTexts,
        });
        return sent(readyTemplate, templated.to, templated.messageId);
      } catch (templateErr) {
        await templateFailed(readyTemplate, templateErr);
      }
    }

    const loginWithPasswordTemplate = String(
      process.env.WHATSAPP_ACCOUNT_LOGIN_CREDS_TEMPLATE ?? WA_TEMPLATES.accountLoginWithPassword,
    ).trim();
    if (loginWithPasswordTemplate) {
      try {
        const templated = await sendTemplateInKnownLanguages({
          mobile: params.mobile,
          templateName: loginWithPasswordTemplate,
          copyCodeButton: false,
          bodyTexts: loginWithPasswordTexts,
        });
        return sent(loginWithPasswordTemplate, templated.to, templated.messageId);
      } catch (templateErr) {
        await templateFailed(loginWithPasswordTemplate, templateErr);
      }
    }

    const loginTemplate = String(
      process.env.WHATSAPP_ACCOUNT_LOGIN_TEMPLATE ?? WA_TEMPLATES.accountLogin,
    ).trim();
    if (loginTemplate) {
      try {
        const templated = await sendTemplateInKnownLanguages({
          mobile: params.mobile,
          templateName: loginTemplate,
          copyCodeButton: false,
          bodyTexts: loginWithPasswordTexts,
        });
        return sent(loginTemplate, templated.to, templated.messageId);
      } catch (fiveVarErr) {
        await templateFailed(`${loginTemplate}:5`, fiveVarErr);
        try {
          const templated = await sendTemplateInKnownLanguages({
            mobile: params.mobile,
            templateName: loginTemplate,
            copyCodeButton: false,
            bodyTexts: loginInfoTexts,
          });
          return sent(loginTemplate, templated.to, templated.messageId);
        } catch (templateErr) {
          await templateFailed(loginTemplate, templateErr);
        }
      }
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

/** Send signup mobile verification OTP on WhatsApp. */
export async function notifySignupOtp(params: {
  mobile: string;
  code: string;
}): Promise<NotifyCredentialsResult> {
  const code = String(params.code ?? '').trim();
  const body = [
    'SwimIT mobile verification',
    '',
    `Your OTP is: ${code}`,
    '',
    'This code expires in 10 minutes.',
    'If you did not request this, ignore this message.',
  ].join('\n');

  const cfg = getWhatsAppConfig();
  if (!cfg.enabled) {
    await logOutbound({
      toMobile: params.mobile,
      kind: 'signup_otp',
      body,
      status: 'skipped',
      error: 'WhatsApp is not configured',
    });
    return { ok: true, skipped: true };
  }

  try {
    const otpTemplate = String(process.env.WHATSAPP_OTP_TEMPLATE ?? WA_TEMPLATES.signupOtp).trim();
    if (otpTemplate) {
      try {
        const templated = await sendTemplateInKnownLanguages({
          mobile: params.mobile,
          templateName: otpTemplate,
          bodyTexts: [code],
          copyCodeButton: true,
        });
        await logOutbound({
          toMobile: params.mobile,
          kind: 'signup_otp',
          body: otpTemplate,
          status: 'sent',
        });
        return {
          ok: true,
          skipped: false,
          to: templated.to,
          messageId: templated.messageId,
        };
      } catch (templateErr) {
        const templateMessage =
          templateErr instanceof Error ? templateErr.message : 'OTP template failed';
        await logOutbound({
          toMobile: params.mobile,
          kind: 'signup_otp_template',
          body: otpTemplate,
          status: 'failed',
          error: templateMessage,
        });
      }
    }

    const result = await sendWhatsAppText(params.mobile, body);
    if (result.skipped) {
      await logOutbound({
        toMobile: params.mobile,
        kind: 'signup_otp',
        body,
        status: 'skipped',
      });
      return { ok: true, skipped: true };
    }

    await logOutbound({
      toMobile: params.mobile,
      kind: 'signup_otp',
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
      toMobile: params.mobile,
      kind: 'signup_otp',
      body,
      status: 'failed',
      error: message,
    });
    return {
      ok: false,
      error: formatWhatsAppUserError(
        `${message}. Create WhatsApp template ${
          process.env.WHATSAPP_OTP_TEMPLATE || 'swimit_signup_otp'
        } (Utility, body: Your SwimIT verification code is {{1}}.) so the OTP is delivered without Hello World.`,
        params.mobile,
      ),
    };
  }
}

const REGISTRATION_HI_REPLY = 'Please visit payment desk for batch selection and payment.';

function isRegistrationHiText(text: string) {
  return /^(hi+|hii+|hello|hey)[\s!.]*$/i.test(String(text ?? '').trim());
}

export async function notifyRegistrationConfirmation(params: {
  mobile: string;
  fullName: string;
  saasAccountId: number;
  poolName?: string;
}) {
  await ensureRegistrationHiTemplate();
  const body = `Hello ${params.fullName}, your registration at SwimIT has been submitted. Please respond Hi To this message`;

  return deliverNotice({
    mobile: params.mobile,
    saasAccountId: params.saasAccountId,
    kind: 'registration_confirmation',
    templateName: WA_TEMPLATES.registrationSayHi,
    bodyTexts: [templateText(params.fullName)],
    fallbackBody: body,
  });
}

/** After a new unpaid swimmer sends Hi, reply with the payment-desk instruction. */
export async function replyIfRegistrationHi(params: {
  fromMobileLast10: string;
  saasAccountId: number;
  registrationId: number | null;
  text: string;
}) {
  if (!isRegistrationHiText(params.text)) return false;
  if (params.registrationId == null) return false;

  const swimmer = await pool.query<{ id: number; pass_valid_until: string | null }>(
    `SELECT id, pass_valid_until
     FROM registrations
     WHERE id = $1 AND saas_account_id = $2
     LIMIT 1`,
    [params.registrationId, params.saasAccountId],
  );
  const row = swimmer.rows[0];
  if (!row || row.pass_valid_until != null) return false;

  const recent = await pool.query(
    `SELECT 1
     FROM whatsapp_outbound
     WHERE saas_account_id = $1
       AND RIGHT(regexp_replace(to_mobile, '\\D', '', 'g'), 10) = $2
       AND kind = 'registration_hi_reply'
       AND status = 'sent'
       AND created_at > NOW() - INTERVAL '1 day'
     LIMIT 1`,
    [params.saasAccountId, params.fromMobileLast10],
  );
  if (recent.rows[0]) return false;

  try {
    const result = await sendWhatsAppText(params.fromMobileLast10, REGISTRATION_HI_REPLY);
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.fromMobileLast10,
      kind: 'registration_hi_reply',
      body: REGISTRATION_HI_REPLY,
      status: result.skipped ? 'skipped' : 'sent',
    });
    return !result.skipped;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed';
    await logOutbound({
      saasAccountId: params.saasAccountId,
      toMobile: params.fromMobileLast10,
      kind: 'registration_hi_reply',
      body: REGISTRATION_HI_REPLY,
      status: 'failed',
      error: message,
    });
    return false;
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

  await deliverNotice({
    mobile: params.mobile,
    saasAccountId: params.saasAccountId,
    kind: 'pass_issued',
    templateName: WA_TEMPLATES.passReady,
    bodyTexts: [
      templateText(params.fullName),
      templateText(params.passType),
      templateText(validUntil),
    ],
    fallbackBody: passCaption,
  });

  try {
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

  return deliverNotice({
    mobile: params.mobile,
    saasAccountId: params.saasAccountId,
    kind: 'pass_expiry',
    templateName: WA_TEMPLATES.passExpiring,
    bodyTexts: [
      templateText(params.fullName),
      templateText(params.passType || '-'),
      templateText(params.passValidUntil),
    ],
    fallbackBody: body,
  });
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

  return deliverNotice({
    mobile: params.mobile,
    saasAccountId: params.saasAccountId,
    kind: 'saas_subscription_expiry_5d',
    templateName: WA_TEMPLATES.subExpiring,
    bodyTexts: [
      templateText(params.fullName),
      templateText(params.accountName),
      templateText(params.subscriptionExpiresAt),
      templateText(renewUrl, 200),
    ],
    fallbackBody: body,
  });
}

/** WhatsApp a public open-form link + QR to desk staff mobile. */
export async function notifyOpenFormQr(params: {
  mobile: string;
  form: 'swimmer' | 'staff';
  accountCode: string;
  poolName?: string;
  poolAddress?: string;
  saasAccountId: number;
}): Promise<NotifyCredentialsResult & { qrSent?: boolean }> {
  const cfg = getWhatsAppConfig();
  const path =
    params.form === 'staff'
      ? `/${params.accountCode}/open/staff-register`
      : `/${params.accountCode}/open/register`;
  if (!cfg.publicAppUrl) {
    return {
      ok: false,
      error: 'Public app URL is not configured, so the form link cannot be sent on WhatsApp.',
    };
  }
  const formUrl = `${cfg.publicAppUrl}${path}`;
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
  const bodyTexts = [
    templateText(params.form === 'staff' ? 'Staff' : 'Swimmer'),
    templateText(params.poolName || 'SwimIT'),
    templateText(formUrl, 200),
  ];

  const qrPngPromise = renderUrlQrPng(formUrl);
  await ensureFormQrTemplates();
  const [qrPng, statuses] = await Promise.all([qrPngPromise, formQrTemplateStatus()]);
  let mediaId = '';
  try {
    mediaId = await uploadWhatsAppMedia({
      buffer: qrPng,
      mimeType: 'image/png',
      filename: 'form-qr.png',
    });
  } catch (err) {
    console.warn('[whatsapp] form QR media upload failed', err);
  }
  const headerImage = mediaId ? { id: mediaId } : undefined;

  async function sendNamedTemplate(templateName: string, withHeader: boolean) {
    return deliverNotice({
      mobile: params.mobile,
      saasAccountId: params.saasAccountId,
      kind: 'open_form_qr',
      templateName,
      bodyTexts,
      fallbackBody: body,
      allowTextFallback: false,
      headerImage: withHeader ? headerImage : undefined,
    });
  }

  const attempts: Array<{ name: string; withHeader: boolean; followUpImage: boolean }> = [];
  if (statuses.qr === 'APPROVED') {
    attempts.push({ name: WA_TEMPLATES.openFormQr, withHeader: true, followUpImage: false });
  }
  if (statuses.desk === 'APPROVED') {
    attempts.push({ name: WA_TEMPLATES.openFormDesk, withHeader: false, followUpImage: true });
  }
  attempts.push({ name: WA_TEMPLATES.openForm, withHeader: false, followUpImage: true });

  let sent: (NotifyCredentialsResult & { qrSent?: boolean }) | null = null;
  for (const attempt of attempts) {
    if (attempt.withHeader && !headerImage) continue;
    try {
      sent = await sendNamedTemplate(attempt.name, attempt.withHeader);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Template failed';
      sent = { ok: false, error: formatWhatsAppUserError(message, params.mobile) };
    }
    if (sent.ok && sent.skipped) return sent;
    if (!sent.ok) continue;

    let qrSent = attempt.withHeader && Boolean(headerImage);
    if (!qrSent && attempt.followUpImage && mediaId) {
      try {
        await sendWhatsAppImageByMediaId(
          params.mobile,
          mediaId,
          params.poolName ? `${params.poolName} — ${title}\n${formUrl}` : `${title}\n${formUrl}`,
        );
        qrSent = true;
      } catch (qrErr) {
        console.warn('[whatsapp] form QR image send failed', qrErr);
      }
    }
    return { ...sent, qrSent };
  }

  return sent ?? { ok: false, error: 'Failed to send form link on WhatsApp' };
}

export async function sendBroadcast(params: {
  mobiles: string[];
  message: string;
  saasAccountId: number;
}) {
  const results: { mobile: string; ok: boolean; error?: string; messageId?: string }[] = [];
  for (const mobile of params.mobiles) {
    const sent = await deliverNotice({
      mobile,
      saasAccountId: params.saasAccountId,
      kind: 'broadcast',
      templateName: WA_TEMPLATES.broadcast,
      bodyTexts: [templateText(params.message, 500)],
      fallbackBody: params.message,
    });
    results.push({
      mobile,
      ok: Boolean(sent.ok && !sent.skipped),
      error: sent.ok ? undefined : sent.error,
      messageId: sent.ok && !sent.skipped ? sent.messageId : undefined,
    });
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
  const cfg = getWhatsAppConfig();
  const amountLabel = `₹${params.amount.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
  const hasAmountQr = Boolean(String(params.upiId ?? '').trim());
  const payLink = hasAmountQr
    ? buildUpiHttpsLaunchUrl({
        publicAppUrl: cfg.publicAppUrl,
        upiId: params.upiId,
        amount: params.amount,
        payeeName: 'SwimIT',
        note: `SwimIT renew ${params.packageName}`.slice(0, 80),
      }) ||
      buildUpiPayUri({
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
    payLink ? 'Pay now:' : '',
    payLink,
    params.upiId
      ? `After paying, send the screenshot with visible *${params.upiId}* on WhatsApp.`
      : 'After paying, send the payment screenshot on WhatsApp.',
    params.upiId ? `UPI ID: *${params.upiId}*` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const sent = await deliverNotice({
    mobile: params.mobile,
    saasAccountId: params.saasAccountId,
    kind: 'package_renewal_payment',
    templateName: WA_TEMPLATES.renewPay,
    bodyTexts: [
      templateText(params.accountName),
      templateText(params.packageName),
      templateText(`${params.months} month${params.months === 1 ? '' : 's'}`),
      templateText(amountLabel),
      templateText(payLink || params.upiId || 'pool desk', 400),
    ],
    fallbackBody: body,
  });
  if (!sent.ok || sent.skipped) return sent;

  const caption = [`Pay ${amountLabel} for ${params.packageName}`, payLink.startsWith('https://') ? payLink : '']
    .filter(Boolean)
    .join('\n');
  let amountQrSent = false;
  if (hasAmountQr) {
    try {
      const qrPng = await renderUpiPayQrPng({
        upiId: params.upiId,
        amount: params.amount,
        payeeName: 'SwimIT',
        note: `SwimIT renew ${params.packageName}`.slice(0, 80),
        qrContent: payLink.startsWith('https://') ? payLink : undefined,
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

  return sent;
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
  shareUrl?: string;
}): Promise<NotifyCredentialsResult & { message: string; payLink: string; qrSent?: boolean }> {
  const cfg = getWhatsAppConfig();
  const amountLabel = `₹${params.amount.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
  const hasAmountQr = Boolean(String(params.upiId ?? '').trim()) && params.amount > 0;
  const payeeName = String(params.poolName ?? 'SwimIT').trim() || 'SwimIT';
  const shareUrl = String(params.shareUrl ?? '').trim();
  const payLink =
    hasAmountQr && shareUrl.startsWith('https://') && !shareUrl.includes('@') ? shareUrl : '';
  const qrPayUrl =
    payLink ||
    (hasAmountQr
      ? buildUpiHttpsLaunchUrl({
          publicAppUrl: cfg.publicAppUrl,
          upiId: params.upiId,
          amount: params.amount,
          payeeName,
          note: `Pass ${params.passType}`.slice(0, 80),
        })
      : '');
  const body = [
    `Hello ${params.fullName},`,
    '',
    'Please complete your SwimIT pass payment.',
    `Pass: ${params.passType}`,
    `Amount: *${amountLabel}*`,
    `Valid until: ${params.passValidUntil}`,
    '',
    hasAmountQr
      ? payLink
        ? 'Scan the payment QR below, or tap the link to open your UPI app.'
        : 'Copy the payment QR and attach it in this chat so they can scan it.'
      : 'Pay using the pool QR code / UPI shown.',
    payLink ? `Pay now:\n\n${payLink}` : '',
    params.upiId
      ? `After paying, send the screenshot with visible *${params.upiId}* on WhatsApp.`
      : 'After paying, send the payment screenshot on WhatsApp.',
    params.upiId ? `UPI ID: *${params.upiId}*` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const bodyTexts = [
    templateText(params.fullName),
    templateText(amountLabel),
    templateText(params.passType),
    templateText(params.passValidUntil),
    templateText(payLink || params.upiId || 'pool desk', 400),
  ];
  const caption = [`Pay ${amountLabel} for ${params.passType}`, payLink || qrPayUrl]
    .filter(Boolean)
    .join('\n');

  let mediaId = '';
  if (hasAmountQr) {
    try {
      const qrPng = await renderUpiPayQrPng({
        upiId: params.upiId,
        amount: params.amount,
        payeeName,
        note: `Pass ${params.passType}`.slice(0, 80),
        qrContent: qrPayUrl.startsWith('https://') ? qrPayUrl : undefined,
      });
      mediaId = await uploadWhatsAppMedia({
        buffer: qrPng,
        mimeType: 'image/png',
        filename: `pass-pay-${params.saasAccountId}.png`,
      });
    } catch (qrErr) {
      console.warn('[whatsapp] pass payment QR upload failed', qrErr);
    }
  }

  await ensurePassPayQrTemplate();
  const qrTemplateStatus = mediaId ? await passPayQrTemplateStatus() : 'MISSING';
  const headerImage = mediaId ? { id: mediaId } : undefined;

  let sent: NotifyCredentialsResult;
  let qrSent = false;
  if (qrTemplateStatus === 'APPROVED' && headerImage) {
    sent = await deliverNotice({
      mobile: params.mobile,
      saasAccountId: params.saasAccountId,
      kind: 'pass_payment_request',
      templateName: WA_TEMPLATES.passPayQr,
      bodyTexts,
      fallbackBody: body,
      headerImage,
      allowTextFallback: false,
    });
    qrSent = Boolean(sent.ok && !sent.skipped);
    if (!sent.ok) {
      sent = await deliverNotice({
        mobile: params.mobile,
        saasAccountId: params.saasAccountId,
        kind: 'pass_payment_request',
        templateName: WA_TEMPLATES.passPay,
        bodyTexts,
        fallbackBody: body,
      });
      qrSent = false;
    }
  } else {
    sent = await deliverNotice({
      mobile: params.mobile,
      saasAccountId: params.saasAccountId,
      kind: 'pass_payment_request',
      templateName: WA_TEMPLATES.passPay,
      bodyTexts,
      fallbackBody: body,
    });
  }
  if (!sent.ok || sent.skipped) return { ...sent, message: body, payLink, qrSent };

  if (!qrSent && mediaId) {
    try {
      await sendWhatsAppImageByMediaId(params.mobile, mediaId, caption);
      qrSent = true;
    } catch (qrErr) {
      console.warn('[whatsapp] amount-locked pass payment QR failed', qrErr);
    }
  }
  if (!qrSent && cfg.publicAppUrl && params.paymentQrPath) {
    const qrUrl = `${cfg.publicAppUrl.replace(/\/$/, '')}/uploads/${params.paymentQrPath}`;
    try {
      await sendWhatsAppImage(params.mobile, qrUrl, caption);
      qrSent = true;
    } catch (qrErr) {
      console.warn('[whatsapp] pass payment QR send failed', qrErr);
    }
  }

  return { ...sent, message: body, payLink, qrSent };
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

  return deliverNotice({
    mobile: params.mobile,
    saasAccountId: params.saasAccountId,
    kind: 'batch_coach_over_limit',
    templateName: WA_TEMPLATES.batchLimit,
    bodyTexts: [
      templateText(params.adminName || 'Admin'),
      templateText(params.accountName),
      templateText(params.swimmerName),
      templateText(params.batch),
      templateText(`${params.currentCount} of ${params.limit}`),
    ],
    fallbackBody: body,
  });
}

export async function notifyRemoteLoginAlert(params: {
  mobile: string;
  adminName: string;
  accountName: string;
  accountCode: string;
  userName: string;
  distanceLabel: string;
  whenLabel: string;
  approveUrl: string;
  denyUrl: string;
  saasAccountId: number;
}): Promise<NotifyCredentialsResult> {
  const body = [
    `Hello ${params.adminName || 'Admin'},`,
    '',
    `Remote login request for ${params.accountName}.`,
    '',
    `User: ${params.userName}`,
    `Account code: ${params.accountCode}`,
    `Distance: ${params.distanceLabel}`,
    `Time: ${params.whenLabel}`,
    '',
    `Approve (24h remote access): ${params.approveUrl}`,
    `Deny: ${params.denyUrl}`,
  ].join('\n');

  return deliverNotice({
    mobile: params.mobile,
    saasAccountId: params.saasAccountId,
    kind: 'remote_login_alert',
    templateName: WA_TEMPLATES.remoteLogin,
    bodyTexts: [
      templateText(params.adminName || 'Admin'),
      templateText(params.accountName),
      templateText(params.userName),
      templateText(`${params.distanceLabel} at ${params.whenLabel}`, 80),
      templateText(params.approveUrl, 200),
    ],
    fallbackBody: body,
  });
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

  return deliverNotice({
    mobile: params.mobile,
    saasAccountId: params.saasAccountId,
    kind: params.reminderKind,
    templateName: WA_TEMPLATES.capacity,
    bodyTexts: [
      templateText(params.adminName || 'Admin'),
      templateText(params.accountName),
      templateText(`${params.thresholdPct}%`),
      templateText(params.packageName),
      templateText(renewUrl, 200),
    ],
    fallbackBody: body,
  });
}
