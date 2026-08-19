import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import QRCode from 'qrcode';
import { isApplicationDemo } from './applicationDemo';
import { isValidMobile } from './formValidation';
import { useT } from './i18n';
import { isPublicOpenFormPath } from './PublicOpenForm';
import { getActiveAccountCode } from './tenantSession';

function readSessionUser(accountCode: string | null): { mobile: string; userName: string } | null {
  if (!accountCode) return null;
  try {
    const raw = sessionStorage.getItem(`swimIT.accountSession.${accountCode}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { mobile?: string; userName?: string };
    const mobile = String(parsed.mobile ?? '').replace(/\D/g, '').slice(-10);
    return {
      mobile: mobile.length === 10 ? mobile : '',
      userName: String(parsed.userName ?? '').trim(),
    };
  } catch {
    return null;
  }
}

/** Top-right Send QR — WhatsApps public form link + QR to the signed-in user's mobile. */
export function SendFormQrButton({ form }: { form: 'swimmer' | 'staff' }) {
  const t = useT();
  const { pathname } = useLocation();
  const sessionUser = readSessionUser(getActiveAccountCode());
  const sessionMobile = sessionUser?.mobile && isValidMobile(sessionUser.mobile) ? sessionUser.mobile : '';
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ type: 'info' | 'error'; text: string } | null>(null);
  const [formUrl, setFormUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrSent, setQrSent] = useState<boolean | null>(null);
  const [sentTo, setSentTo] = useState('');

  useEffect(() => {
    if (!formUrl) {
      setQrDataUrl('');
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(formUrl, { width: 360, margin: 1, errorCorrectionLevel: 'M' }).then(
      (url) => {
        if (!cancelled) setQrDataUrl(url);
      },
      () => {
        if (!cancelled) setQrDataUrl('');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [formUrl]);

  if (isPublicOpenFormPath(pathname)) return null;

  async function onSend() {
    setSending(true);
    setMessage(null);
    setFormUrl('');
    setQrSent(null);
    setSentTo('');
    try {
      if (isApplicationDemo()) {
        setMessage({
          type: 'info',
          text:
            form === 'staff'
              ? t('Sample: staff form link + QR would be sent on WhatsApp')
              : t('Sample: registration form link + QR would be sent on WhatsApp'),
        });
        window.setTimeout(() => setMessage(null), 4500);
        return;
      }

      const res = await fetch('/api/whatsapp/send-form-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        formUrl?: string;
        qrSent?: boolean;
        mobile?: string;
      };
      if (body.formUrl) setFormUrl(body.formUrl);
      setQrSent(body.qrSent === true);
      const mobile = String(body.mobile ?? sessionMobile).replace(/\D/g, '').slice(-10);
      if (mobile) setSentTo(mobile);
      if (!res.ok) throw new Error(body.error ?? t('Failed to send QR'));
      setMessage({
        type: 'info',
        text: body.qrSent
          ? form === 'staff'
            ? `${t('Staff form link + QR sent on WhatsApp')} (${mobile})`
            : `${t('Registration form link + QR sent on WhatsApp')} (${mobile})`
          : `${t('Form link sent on WhatsApp')} (${mobile}). ${t('Save or share the QR below — WhatsApp did not deliver the image yet.')}`,
      });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : t('Failed to send QR on WhatsApp'),
      });
    } finally {
      setSending(false);
    }
  }

  function downloadQr() {
    if (!qrDataUrl) return;
    const anchor = document.createElement('a');
    anchor.href = qrDataUrl;
    anchor.download = form === 'staff' ? 'staff-form-qr.png' : 'registration-form-qr.png';
    anchor.click();
  }

  return (
    <div className="send-form-qr-wrap">
      {sessionMobile ? (
        <p className="send-form-qr-to">
          {t('Sends to your WhatsApp')} {sessionMobile}
        </p>
      ) : null}
      <button
        type="button"
        className="menu-send-qr send-form-qr-btn"
        disabled={sending}
        title={t('Send open form link + QR on WhatsApp so anyone can register without login')}
        onClick={() => void onSend()}
      >
        {sending ? t('Sending…') : t('Send QR')}
      </button>
      {message ? (
        <p className={message.type === 'error' ? 'error send-form-qr-msg' : 'success send-form-qr-msg'}>
          {message.text}
        </p>
      ) : null}
      {formUrl ? (
        <div className="send-form-qr-preview">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt={t('Form QR')} className="send-form-qr-image" />
          ) : null}
          <p className="send-form-qr-link">
            <a href={formUrl} target="_blank" rel="noreferrer">
              {formUrl}
            </a>
          </p>
          {sentTo ? (
            <p className="muted send-form-qr-hint">
              {t('Sends to your WhatsApp')} {sentTo}
            </p>
          ) : null}
          {qrDataUrl ? (
            <button type="button" className="csv-btn send-form-qr-download" onClick={downloadQr}>
              {t('Download QR')}
            </button>
          ) : null}
          {qrSent === false ? (
            <p className="muted send-form-qr-hint">
              {t('Print or share this QR if the WhatsApp image does not arrive.')}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
