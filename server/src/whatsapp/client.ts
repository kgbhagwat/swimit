import { getWhatsAppConfig, toE164 } from './config.js';

type GraphError = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    error_user_data?: { description?: string };
  };
};

export function formatWhatsAppUserError(raw: string, mobile?: string) {
  const message = String(raw || 'WhatsApp send failed').trim();
  const lower = message.toLowerCase();
  const m = mobile ? ` ${mobile}` : '';

  // Check allow-list / recipient errors before OAuth — Meta often tags these as OAuthException too.
  if (
    lower.includes('(#131030)') ||
    lower.includes('not in allowed') ||
    lower.includes('recipient phone number not in allowed list') ||
    lower.includes('not a valid whatsapp') ||
    lower.includes('undeliverable')
  ) {
    return (
      `${message}. ` +
      `This WhatsApp number is still in Meta test/development mode, so it can only message numbers on the allow list.` +
      ` Add${m} under Meta → WhatsApp → API Setup → To / Recipient phone numbers,` +
      ` or publish the app / complete Business verification to message any mobile.`
    );
  }

  if (
    lower.includes('authenticat') ||
    lower.includes('access token') ||
    lower.includes('session has expired') ||
    lower.includes('invalid oauth') ||
    (lower.includes('oauth') && !lower.includes('131030'))
  ) {
    return `${message}. The token in server .env is invalid or expired. Paste a fresh WHATSAPP_TOKEN, then run: docker compose -f docker-compose.lightsail.yml up -d --force-recreate app`;
  }

  if (lower.includes('recipient')) {
    return `${message}. Add${m} under Meta → WhatsApp → API Setup → Recipient / allow list.`;
  }

  return message;
}

function graphErrorMessage(json: GraphError, status: number) {
  const err = json.error;
  const parts = [
    err?.message,
    err?.type ? `(${err.type})` : null,
    err?.code != null ? `code ${err.code}` : null,
    err?.error_user_data?.description,
  ].filter(Boolean);
  return parts.join(' ') || `WhatsApp API error (${status})`;
}

async function graphPost(path: string, body: unknown) {
  const cfg = getWhatsAppConfig();
  const url = `https://graph.facebook.com/${cfg.apiVersion}/${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as GraphError & Record<string, unknown>;
  if (!res.ok) {
    throw new Error(graphErrorMessage(json, res.status));
  }
  return json;
}

/** Live check: env can look "connected" while the token is already dead. */
export async function probeWhatsAppAuth() {
  const cfg = getWhatsAppConfig();
  if (!cfg.enabled) {
    return {
      configured: false,
      tokenValid: false as const,
      error: null as string | null,
      displayPhoneNumber: null as string | null,
    };
  }
  try {
    const url = `https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}?fields=display_phone_number,verified_name`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${cfg.token}` },
    });
    const json = (await res.json().catch(() => ({}))) as GraphError & {
      display_phone_number?: string;
      verified_name?: string;
    };
    if (!res.ok) {
      const error = formatWhatsAppUserError(graphErrorMessage(json, res.status));
      return {
        configured: true,
        tokenValid: false as const,
        error,
        displayPhoneNumber: null as string | null,
      };
    }
    return {
      configured: true,
      tokenValid: true as const,
      error: null as string | null,
      displayPhoneNumber: String(json.display_phone_number ?? '') || null,
      verifiedName: String(json.verified_name ?? '') || null,
    };
  } catch (err) {
    return {
      configured: true,
      tokenValid: false as const,
      error: formatWhatsAppUserError(err instanceof Error ? err.message : 'Token check failed'),
      displayPhoneNumber: null as string | null,
    };
  }
}

export async function sendWhatsAppText(toMobile: string, body: string) {
  const cfg = getWhatsAppConfig();
  if (!cfg.enabled) {
    console.info('[whatsapp] skipped (not configured):', body.slice(0, 80));
    return { skipped: true as const };
  }
  const to = toE164(toMobile);
  if (!to) throw new Error('Invalid WhatsApp mobile number');

  const result = await graphPost(`${cfg.phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { preview_url: false, body },
  });
  const messages = Array.isArray(result.messages) ? result.messages : [];
  const messageId = String((messages[0] as { id?: string } | undefined)?.id ?? '');
  if (!messageId) {
    throw new Error(
      'WhatsApp API accepted the request but returned no message id. Check the recipient is on Meta’s allow list.',
    );
  }
  return { skipped: false as const, result, messageId, to };
}

/** Approved / sample template (Meta test numbers ship with hello_world). */
export async function sendWhatsAppTemplate(
  toMobile: string,
  templateName: string,
  languageCode = 'en_US',
) {
  const cfg = getWhatsAppConfig();
  if (!cfg.enabled) {
    console.info('[whatsapp] skipped template (not configured):', templateName);
    return { skipped: true as const };
  }
  const to = toE164(toMobile);
  if (!to) throw new Error('Invalid WhatsApp mobile number');

  const result = await graphPost(`${cfg.phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
    },
  });
  const messages = Array.isArray(result.messages) ? result.messages : [];
  const messageId = String((messages[0] as { id?: string } | undefined)?.id ?? '');
  if (!messageId) {
    throw new Error('WhatsApp API returned no message id for template send');
  }
  return { skipped: false as const, result, messageId, to };
}

export async function sendWhatsAppImage(toMobile: string, imageUrl: string, caption?: string) {
  const cfg = getWhatsAppConfig();
  if (!cfg.enabled) {
    console.info('[whatsapp] skipped image (not configured)');
    return { skipped: true as const };
  }
  const to = toE164(toMobile);
  if (!to) throw new Error('Invalid WhatsApp mobile number');

  const result = await graphPost(`${cfg.phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type: 'image',
    image: {
      link: imageUrl,
      ...(caption ? { caption } : {}),
    },
  });
  return { skipped: false as const, result };
}

export async function uploadWhatsAppMedia(params: {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}) {
  const cfg = getWhatsAppConfig();
  if (!cfg.enabled) {
    throw new Error('WhatsApp is not configured');
  }

  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', params.mimeType);
  form.append(
    'file',
    new Blob([new Uint8Array(params.buffer)], { type: params.mimeType }),
    params.filename,
  );

  const res = await fetch(
    `https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/media`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}` },
      body: form,
    },
  );
  const json = (await res.json().catch(() => ({}))) as GraphError & { id?: string };
  if (!res.ok || !json.id) {
    throw new Error(graphErrorMessage(json, res.status) || 'WhatsApp media upload failed');
  }
  return String(json.id);
}

export async function sendWhatsAppImageByMediaId(
  toMobile: string,
  mediaId: string,
  caption?: string,
) {
  const cfg = getWhatsAppConfig();
  if (!cfg.enabled) {
    console.info('[whatsapp] skipped image media (not configured)');
    return { skipped: true as const };
  }
  const to = toE164(toMobile);
  if (!to) throw new Error('Invalid WhatsApp mobile number');

  const result = await graphPost(`${cfg.phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type: 'image',
    image: {
      id: mediaId,
      ...(caption ? { caption } : {}),
    },
  });
  return { skipped: false as const, result };
}

export async function downloadWhatsAppMedia(mediaId: string, directUrl?: string) {
  const cfg = getWhatsAppConfig();
  if (!cfg.enabled) throw new Error('WhatsApp is not configured');

  let url = String(directUrl ?? '').trim();
  let mimeType = '';

  if (!url) {
    const metaRes = await fetch(`https://graph.facebook.com/${cfg.apiVersion}/${mediaId}`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
    });
    const meta = (await metaRes.json().catch(() => ({}))) as {
      url?: string;
      mime_type?: string;
      error?: { message?: string };
    };
    if (!metaRes.ok || !meta.url) {
      throw new Error(meta.error?.message ?? 'Failed to resolve WhatsApp media URL');
    }
    url = meta.url;
    mimeType = String(meta.mime_type ?? '');
  }

  const fileRes = await fetch(url, {
    headers: { Authorization: `Bearer ${cfg.token}` },
  });
  if (!fileRes.ok) throw new Error(`Failed to download WhatsApp media (${fileRes.status})`);
  const buffer = Buffer.from(await fileRes.arrayBuffer());
  return {
    buffer,
    mimeType: String(
      mimeType || fileRes.headers.get('content-type') || 'application/octet-stream',
    ),
  };
}
