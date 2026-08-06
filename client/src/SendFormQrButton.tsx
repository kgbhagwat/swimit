import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { isApplicationDemo } from './applicationDemo';
import { isValidMobile, mobileHint, sanitizeMobileInput } from './formValidation';
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

/** Top-right Send QR — WhatsApps public form link + QR to the requester's mobile. */
export function SendFormQrButton({ form }: { form: 'swimmer' | 'staff' }) {
  const { pathname } = useLocation();
  const sessionMobile = readSessionMobile(getActiveAccountCode());
  const [sending, setSending] = useState(false);
  const [showMobileField, setShowMobileField] = useState(!sessionMobile);
  const [mobileDraft, setMobileDraft] = useState(sessionMobile ?? '');
  const [message, setMessage] = useState<{ type: 'info' | 'error'; text: string } | null>(null);

  if (isPublicOpenFormPath(pathname)) return null;

  async function onSend() {
    const mobile = sanitizeMobileInput(mobileDraft || sessionMobile || '');
    if (!isValidMobile(mobile)) {
      setShowMobileField(true);
      setMessage({
        type: 'error',
        text: mobileHint(mobile) || 'Enter your 10-digit WhatsApp number',
      });
      return;
    }

    setSending(true);
    setMessage(null);
    try {
      if (isApplicationDemo()) {
        setMessage({
          type: 'info',
          text:
            form === 'staff'
              ? 'Sample: staff form link + QR would be sent on WhatsApp'
              : 'Sample: registration form link + QR would be sent on WhatsApp',
        });
        window.setTimeout(() => setMessage(null), 4500);
        return;
      }

      const res = await fetch('/api/whatsapp/send-form-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form, mobile }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to send QR');
      setMessage({
        type: 'info',
        text:
          form === 'staff'
            ? 'Staff form link + QR sent on WhatsApp'
            : 'Registration form link + QR sent on WhatsApp',
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
      {showMobileField ? (
        <input
          className="send-form-qr-mobile"
          value={mobileDraft}
          onChange={(e) => setMobileDraft(sanitizeMobileInput(e.target.value))}
          placeholder="Your WhatsApp no."
          inputMode="numeric"
          maxLength={10}
          aria-label="WhatsApp number to receive the form QR"
        />
      ) : null}
      <button
        type="button"
        className="menu-send-qr send-form-qr-btn"
        disabled={sending}
        title="Send open form link + QR on WhatsApp so anyone can register without login"
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
