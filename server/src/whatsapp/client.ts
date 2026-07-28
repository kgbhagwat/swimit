import { getWhatsAppConfig, toE164 } from './config.js';

type GraphError = { error?: { message?: string; code?: number } };

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
    throw new Error(json.error?.message ?? `WhatsApp API error (${res.status})`);
  }
  return json;
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
    text: { preview_url: true, body },
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

export async function downloadWhatsAppMedia(mediaId: string) {
  const cfg = getWhatsAppConfig();
  if (!cfg.enabled) throw new Error('WhatsApp is not configured');

  const metaRes = await fetch(`https://graph.facebook.com/${cfg.apiVersion}/${mediaId}`, {
    headers: { Authorization: `Bearer ${cfg.token}` },
  });
  const meta = (await metaRes.json().catch(() => ({}))) as { url?: string; mime_type?: string };
  if (!metaRes.ok || !meta.url) {
    throw new Error('Failed to resolve WhatsApp media URL');
  }

  const fileRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${cfg.token}` },
  });
  if (!fileRes.ok) throw new Error('Failed to download WhatsApp media');
  const buffer = Buffer.from(await fileRes.arrayBuffer());
  return {
    buffer,
    mimeType: String(meta.mime_type ?? fileRes.headers.get('content-type') ?? 'application/octet-stream'),
  };
}
