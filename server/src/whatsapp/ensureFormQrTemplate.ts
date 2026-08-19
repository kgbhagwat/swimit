import { renderUrlQrPng } from '../passCardImage.js';
import { getWhatsAppConfig } from './config.js';
import { WA_TEMPLATES } from './templateCatalog.js';

type TemplateStatus = 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED' | 'MISSING';

type GraphError = { error?: { message?: string; code?: number } };

const DEFAULT_WABA = '1031245536486079';
const FORM_QR_BODY =
  '{{1}} registration form for {{2}} is ready. Open: {{3}}';
const FORM_QR_EXAMPLE = [
  'Swimmer',
  'SMPool',
  'https://staging.swimit.co.in/smpool/open/register',
];

function wabaId() {
  return String(process.env.WHATSAPP_WABA_ID ?? '').trim() || DEFAULT_WABA;
}

async function graphJson(path: string, init?: RequestInit) {
  const cfg = getWhatsAppConfig();
  const url = `https://graph.facebook.com/${cfg.apiVersion}/${path}`;
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${cfg.token}`);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(url, { ...init, headers });
  const json = (await res.json().catch(() => ({}))) as GraphError & Record<string, unknown>;
  return { ok: res.ok, json };
}

async function templateStatus(name: string): Promise<TemplateStatus> {
  const listed = await graphJson(
    `${wabaId()}/message_templates?name=${encodeURIComponent(name)}&limit=10&fields=name,status,language`,
  );
  const rows = Array.isArray(listed.json.data) ? listed.json.data : [];
  const match = rows.find((row) => String((row as { name?: string }).name) === name) as
    | { status?: string }
    | undefined;
  const status = String(match?.status ?? '').toUpperCase();
  if (status === 'APPROVED' || status === 'PENDING' || status === 'REJECTED' || status === 'PAUSED') {
    return status;
  }
  return 'MISSING';
}

async function resolveAppId() {
  const cfg = getWhatsAppConfig();
  const fromEnv = String(process.env.WHATSAPP_APP_ID ?? '').trim();
  if (fromEnv) return fromEnv;
  const url = `https://graph.facebook.com/${cfg.apiVersion}/debug_token?input_token=${encodeURIComponent(
    cfg.token,
  )}&access_token=${encodeURIComponent(cfg.token)}`;
  const res = await fetch(url);
  const json = (await res.json().catch(() => ({}))) as {
    data?: { app_id?: string };
  };
  return String(json.data?.app_id ?? '').trim();
}

async function uploadTemplateHeaderHandle(samplePng: Buffer) {
  const cfg = getWhatsAppConfig();
  const appId = await resolveAppId();
  if (!appId) throw new Error('WhatsApp app id is not available for template media upload');

  const sessionUrl = new URL(`https://graph.facebook.com/${cfg.apiVersion}/${appId}/uploads`);
  sessionUrl.searchParams.set('file_name', 'form-qr.png');
  sessionUrl.searchParams.set('file_length', String(samplePng.length));
  sessionUrl.searchParams.set('file_type', 'image/png');
  sessionUrl.searchParams.set('access_token', cfg.token);
  const sessionRes = await fetch(sessionUrl, { method: 'POST' });
  const sessionJson = (await sessionRes.json().catch(() => ({}))) as GraphError & { id?: string };
  if (!sessionRes.ok || !sessionJson.id) {
    throw new Error(sessionJson.error?.message || 'Could not start WhatsApp template image upload');
  }

  const uploadRes = await fetch(`https://graph.facebook.com/${cfg.apiVersion}/${sessionJson.id}`, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${cfg.token}`,
      file_offset: '0',
      'Content-Type': 'application/octet-stream',
    },
    body: new Uint8Array(samplePng),
  });
  const uploadJson = (await uploadRes.json().catch(() => ({}))) as GraphError & { h?: string };
  const handle = String(uploadJson.h ?? '').trim();
  if (!uploadRes.ok || !handle) {
    throw new Error(uploadJson.error?.message || 'Could not upload WhatsApp template sample QR');
  }
  return handle;
}

async function createTemplate(payload: Record<string, unknown>) {
  const created = await graphJson(`${wabaId()}/message_templates`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!created.ok) {
    throw new Error(created.json.error?.message || 'Could not create WhatsApp template');
  }
}

/** Create the form-QR templates in Meta if they are missing (approval can take a while). */
export async function ensureFormQrTemplates() {
  const cfg = getWhatsAppConfig();
  if (!cfg.enabled) return;

  try {
    const deskStatus = await templateStatus(WA_TEMPLATES.openFormDesk);
    if (deskStatus === 'MISSING') {
      await createTemplate({
        name: WA_TEMPLATES.openFormDesk,
        language: 'en',
        category: 'UTILITY',
        components: [
          {
            type: 'BODY',
            text: FORM_QR_BODY,
            example: { body_text: [FORM_QR_EXAMPLE] },
          },
        ],
      });
      console.info('[whatsapp] submitted template', WA_TEMPLATES.openFormDesk);
    }
  } catch (err) {
    console.warn('[whatsapp] could not ensure', WA_TEMPLATES.openFormDesk, err);
  }

  try {
    const qrStatus = await templateStatus(WA_TEMPLATES.openFormQr);
    if (qrStatus !== 'MISSING') return;
    const samplePng = await renderUrlQrPng(FORM_QR_EXAMPLE[2]);
    const headerHandle = await uploadTemplateHeaderHandle(samplePng);
    await createTemplate({
      name: WA_TEMPLATES.openFormQr,
      language: 'en',
      category: 'UTILITY',
      components: [
        {
          type: 'HEADER',
          format: 'IMAGE',
          example: { header_handle: [headerHandle] },
        },
        {
          type: 'BODY',
          text: FORM_QR_BODY,
          example: { body_text: [FORM_QR_EXAMPLE] },
        },
      ],
    });
    console.info('[whatsapp] submitted template', WA_TEMPLATES.openFormQr);
  } catch (err) {
    console.warn('[whatsapp] could not ensure', WA_TEMPLATES.openFormQr, err);
  }
}

export async function formQrTemplateStatus() {
  const [qr, desk, open] = await Promise.all([
    templateStatus(WA_TEMPLATES.openFormQr),
    templateStatus(WA_TEMPLATES.openFormDesk),
    templateStatus(WA_TEMPLATES.openForm),
  ]);
  return { qr, desk, open };
}

const PASS_PAY_QR_BODY =
  'Hello {{1}}, please pay {{2}} for your {{3}} pass (valid until {{4}}). Pay now: {{5}}';
const PASS_PAY_QR_EXAMPLE = [
  'Abhiram',
  'Rs 10',
  'General',
  '18 Sep 2026',
  'https://staging.swimit.co.in/open/upi-pay?t=sample',
];

/** Create IMAGE-header pass-pay template so the QR can go in the first WhatsApp message. */
export async function ensurePassPayQrTemplate() {
  const cfg = getWhatsAppConfig();
  if (!cfg.enabled) return;
  try {
    const status = await templateStatus(WA_TEMPLATES.passPayQr);
    if (status !== 'MISSING') return;
    const samplePng = await renderUrlQrPng(PASS_PAY_QR_EXAMPLE[4]);
    const headerHandle = await uploadTemplateHeaderHandle(samplePng);
    await createTemplate({
      name: WA_TEMPLATES.passPayQr,
      language: 'en',
      category: 'UTILITY',
      components: [
        {
          type: 'HEADER',
          format: 'IMAGE',
          example: { header_handle: [headerHandle] },
        },
        {
          type: 'BODY',
          text: PASS_PAY_QR_BODY,
          example: { body_text: [PASS_PAY_QR_EXAMPLE] },
        },
      ],
    });
    console.info('[whatsapp] submitted template', WA_TEMPLATES.passPayQr);
  } catch (err) {
    console.warn('[whatsapp] could not ensure', WA_TEMPLATES.passPayQr, err);
  }
}

export async function passPayQrTemplateStatus() {
  return templateStatus(WA_TEMPLATES.passPayQr);
}

async function deleteTemplate(name: string) {
  await graphJson(`${wabaId()}/message_templates?name=${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
}

const REGISTRATION_HI_BODY =
  'Hello {{1}}, your registration at SwimIT has been submitted. Please respond Hi To this message';

/** Submit the post-registration Hi template if it is missing (approval can take a while). */
export async function ensureRegistrationHiTemplate() {
  const cfg = getWhatsAppConfig();
  if (!cfg.enabled) return;
  const name = WA_TEMPLATES.registrationSayHi;
  try {
    const status = await templateStatus(name);
    if (status === 'APPROVED' || status === 'PENDING' || status === 'PAUSED') return;
    if (status === 'REJECTED') {
      try {
        await deleteTemplate(name);
      } catch (err) {
        console.warn('[whatsapp] could not delete rejected template', name, err);
        return;
      }
    }

    await createTemplate({
      name,
      language: 'en',
      category: 'UTILITY',
      components: [
        {
          type: 'BODY',
          text: REGISTRATION_HI_BODY,
          example: { body_text: [['Kishor']] },
        },
      ],
    });
    console.info('[whatsapp] submitted template', name);
  } catch (err) {
    console.warn('[whatsapp] could not ensure', name, err);
  }
}
