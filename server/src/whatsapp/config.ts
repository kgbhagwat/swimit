/** Meta WhatsApp Cloud API configuration (optional — no-ops when unset). */

export type WhatsAppConfig = {
  enabled: boolean;
  token: string;
  phoneNumberId: string;
  verifyToken: string;
  appSecret: string;
  apiVersion: string;
  /** Default country code for 10-digit Indian mobiles */
  defaultCountryCode: string;
  publicAppUrl: string;
};

export function getWhatsAppConfig(): WhatsAppConfig {
  const token = String(process.env.WHATSAPP_TOKEN ?? '').trim();
  const phoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID ?? '').trim();
  const enabled =
    String(process.env.WHATSAPP_ENABLED ?? '').toLowerCase() === 'true' ||
    (Boolean(token) && Boolean(phoneNumberId));

  return {
    enabled: enabled && Boolean(token) && Boolean(phoneNumberId),
    token,
    phoneNumberId,
    verifyToken: String(process.env.WHATSAPP_VERIFY_TOKEN ?? 'swimit-whatsapp-verify').trim(),
    appSecret: String(process.env.WHATSAPP_APP_SECRET ?? '').trim(),
    apiVersion: String(process.env.WHATSAPP_API_VERSION ?? 'v21.0').trim(),
    defaultCountryCode: String(process.env.WHATSAPP_DEFAULT_COUNTRY_CODE ?? '91').trim(),
    publicAppUrl: String(process.env.PUBLIC_APP_URL ?? process.env.CORS_ORIGIN ?? '')
      .trim()
      .replace(/\/$/, ''),
  };
}

export function toE164(mobile: string, countryCode = getWhatsAppConfig().defaultCountryCode) {
  const digits = String(mobile ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `${countryCode}${digits}`;
  if (digits.startsWith('0') && digits.length === 11) return `${countryCode}${digits.slice(1)}`;
  if (digits.startsWith(countryCode)) return digits;
  return digits;
}
