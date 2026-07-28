import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { isPublicOpenFormPath } from './PublicOpenForm';
import { getActiveAccountCode } from './tenantSession';

function readSessionMobile(accountCode: string | null): string | null {
  if (!accountCode) return null;
  try {
    const raw = sessionStorage.getItem(`swimIT.accountSession.${accountCode}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { mobile?: string };
    const mobile = String(parsed.mobile ?? '').replace(/\D/g, '').slice(-10);
    return mobile.length === 10 ? mobile : null;
  } catch {
    return null;
  }
}

/** Top-right Send QR — WhatsApps public form link to the logged-in desk user's mobile. */
export function SendFormQrButton({ form }: { form: 'swimmer' | 'staff' }) {
  const { pathname } = useLocation();
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ type: 'info' | 'error'; text: string } | null>(null);

  if (isPublicOpenFormPath(pathname)) return null;

  const mobile = readSessionMobile(getActiveAccountCode());
  if (!mobile) return null;

  async function onSend() {
    setSending(true);
    setMessage(null);
    try {
      const res = await fetch('/api/whatsapp/send-form-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form, mobile }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to send QR');
      setMessage({
        type: 'info',
        text: form === 'staff' ? 'Staff form QR sent on WhatsApp' : 'Registration form QR sent on WhatsApp',
      });
      window.setTimeout(() => setMessage(null), 4000);
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to send QR on WhatsApp',
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="send-form-qr-wrap">
      <button
        type="button"
        className="menu-send-qr send-form-qr-btn"
        disabled={sending}
        title="Send form link + QR on WhatsApp to your mobile"
        onClick={() => void onSend()}
      >
        {sending ? 'Sending…' : 'Send QR'}
      </button>
      {message ? (
        <p className={message.type === 'error' ? 'error send-form-qr-msg' : 'success send-form-qr-msg'}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
