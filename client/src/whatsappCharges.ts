export const WHATSAPP_CHARGES_EVENT = 'swimit:whatsapp-charges';

export type WhatsAppNoticeSettings = {
  enabled: boolean;
  days: number;
  chargesAccepted: boolean;
  chargesAcceptedAt: string | null;
  broadcastEnabled: boolean;
};

export type WhatsAppChargesChangedDetail = {
  broadcastEnabled: boolean;
};

export function notifyWhatsAppChargesChanged(detail: WhatsAppChargesChangedDetail) {
  window.dispatchEvent(new CustomEvent(WHATSAPP_CHARGES_EVENT, { detail }));
}

function parseNoticeSettings(body: {
  enabled?: boolean;
  days?: number;
  chargesAccepted?: boolean;
  chargesAcceptedAt?: string | null;
  broadcastEnabled?: boolean;
}): WhatsAppNoticeSettings {
  return {
    enabled: Boolean(body.enabled),
    days: Math.min(9, Math.max(1, Number(body.days) || 3)),
    chargesAccepted: Boolean(body.chargesAccepted),
    chargesAcceptedAt: body.chargesAcceptedAt ? String(body.chargesAcceptedAt) : null,
    broadcastEnabled: Boolean(body.broadcastEnabled),
  };
}

export async function fetchWhatsAppNoticeSettings(): Promise<WhatsAppNoticeSettings | null> {
  try {
    const res = await fetch('/api/whatsapp/pass-expiry-notice');
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    return parseNoticeSettings(body);
  } catch {
    return null;
  }
}

export async function saveWhatsAppNoticeSettings(params: {
  enabled: boolean;
  days: number;
  broadcastEnabled: boolean;
}): Promise<WhatsAppNoticeSettings> {
  const res = await fetch('/api/whatsapp/pass-expiry-notice', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? 'Failed to save WhatsApp settings');
  const settings = parseNoticeSettings(body);
  notifyWhatsAppChargesChanged({ broadcastEnabled: settings.broadcastEnabled });
  return settings;
}
