import { FormEvent, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useT } from './i18n';
import { extractUpiPayUri } from './upiPay';

export const SUPPORT_INBOX_CHANGED = 'swimIT.supportInboxChanged';

export function notifySupportInboxChanged() {
  window.dispatchEvent(new Event(SUPPORT_INBOX_CHANGED));
}

export type SupportChatTarget = {
  id: number;
  accountCode: string;
  accountName: string;
};

type AuthorRole = 'account_admin' | 'platform';

type SupportTicket = {
  id: number;
  subject: string;
  status: 'open' | 'closed';
};

type SupportMessage = {
  id: number;
  authorRole: AuthorRole;
  authorUserName: string | null;
  body: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentMime?: string | null;
  createdAt: string;
};

type RenewChoice = { id: string; label: string };

function formatMsgTime(value: string | null | undefined) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function initials(label: string) {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

function isImageMime(mime: string | null | undefined, nameOrUrl?: string | null) {
  if (mime && mime.toLowerCase().startsWith('image/')) return true;
  const name = String(nameOrUrl ?? '').toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(name);
}

function renderInlineMarks(text: string, keyPrefix: string): ReactNode[] {
  const parts = String(text ?? '').split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, index) => {
    const bold =
      (part.startsWith('**') && part.endsWith('**') && part.length > 4) ||
      (part.startsWith('*') && part.endsWith('*') && part.length > 2 && !part.startsWith('**'));
    if (!bold) return <span key={`${keyPrefix}-${index}`}>{part}</span>;
    const inner = part.startsWith('**') ? part.slice(2, -2) : part.slice(1, -1);
    return <strong key={`${keyPrefix}-${index}`}>{inner}</strong>;
  });
}

/** Render *bold* markers and clickable upi:// / http(s) links. */
function ChatMessageBody({ text }: { text: string }) {
  const chunks = String(text ?? '').split(/(upi:\/\/pay\?[^\s]+|https?:\/\/[^\s]+)/gi);
  return (
    <p>
      {chunks.map((chunk, index) => {
        if (/^upi:\/\/pay\?/i.test(chunk)) {
          return (
            <a
              key={`upi-${index}`}
              className="wa-chat-upi-link"
              href={chunk}
              title="Open UPI payment app"
            >
              {chunk}
            </a>
          );
        }
        if (/^https?:\/\//i.test(chunk)) {
          return (
            <a
              key={`http-${index}`}
              className="wa-chat-upi-link"
              href={chunk}
              target="_blank"
              rel="noreferrer"
            >
              {chunk}
            </a>
          );
        }
        return <span key={`t-${index}`}>{renderInlineMarks(chunk, `t-${index}`)}</span>;
      })}
    </p>
  );
}

export function SupportBellIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M10.2 5.2a1.8 1.8 0 0 1 3.6 0" />
      <path d="M6.2 10.2a5.8 5.8 0 0 1 11.6 0c0 3.6 1.4 5.2 1.4 5.2H4.8s1.4-1.6 1.4-5.2z" />
      <path d="M9.6 18.6a2.4 2.4 0 0 0 4.8 0" />
    </svg>
  );
}

/** Right-side WhatsApp-style chat channel (no tickets / new-chat form). */
export function SupportChatPanel({
  open,
  onClose,
  mode,
  authorUserId,
  targetAccount,
}: {
  open: boolean;
  onClose: () => void;
  mode: 'account' | 'platform';
  authorUserId: number;
  targetAccount?: SupportChatTarget | null;
}) {
  const t = useT();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [topOffset, setTopOffset] = useState(60);
  const [renewChoices, setRenewChoices] = useState<RenewChoice[]>([]);
  const [clearing, setClearing] = useState(false);

  const peerLabel =
    mode === 'platform'
      ? targetAccount?.accountName || targetAccount?.accountCode || t('Account')
      : 'SwimIT';

  const title =
    mode === 'platform'
      ? `${t('Chat')} · ${targetAccount?.accountName || targetAccount?.accountCode || ''}`
      : t('Chat with SwimIT');

  const loadChannel = useCallback(async () => {
    if (mode === 'platform' && !targetAccount?.id) return;
    setLoading(true);
    setError('');
    try {
      const url =
        mode === 'platform'
          ? `/api/support/platform/channel?targetAccountId=${targetAccount!.id}&authorUserId=${authorUserId}`
          : `/api/support/channel?authorUserId=${authorUserId}`;
      const res = await fetch(url);
      const body = (await res.json().catch(() => ({}))) as {
        ticket?: SupportTicket;
        messages?: SupportMessage[];
        renewChoices?: RenewChoice[];
        error?: string;
      };
      if (!res.ok) throw new Error(body.error || 'Failed to open chat');
      setTicket(body.ticket ?? null);
      setMessages(Array.isArray(body.messages) ? body.messages : []);
      setRenewChoices(Array.isArray(body.renewChoices) ? body.renewChoices : []);
      notifySupportInboxChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open chat');
      setTicket(null);
      setMessages([]);
      setRenewChoices([]);
    } finally {
      setLoading(false);
    }
  }, [mode, targetAccount, authorUserId]);

  useEffect(() => {
    if (!open) return;
    setReply('');
    setAttachFile(null);
    setError('');
    void loadChannel();
  }, [open, loadChannel]);

  useEffect(() => {
    if (!open) return;
    function syncTop() {
      const bar = document.querySelector('.platform-main-topbar') as HTMLElement | null;
      const bottom = bar?.getBoundingClientRect().bottom;
      setTopOffset(bottom && bottom > 0 ? Math.round(bottom) : 60);
    }
    syncTop();
    window.addEventListener('resize', syncTop);
    return () => window.removeEventListener('resize', syncTop);
  }, [open]);

  useEffect(() => {
    if (!open || !ticket?.id) return;
    const timer = window.setInterval(() => void loadChannel(), 12_000);
    return () => window.clearInterval(timer);
  }, [open, ticket?.id, loadChannel]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  async function sendText(text: string, file: File | null = null) {
    if (!ticket?.id) return;
    const trimmed = text.trim();
    if ((!trimmed && !file) || sending) return;
    setSending(true);
    setError('');
    try {
      const url =
        mode === 'platform'
          ? `/api/support/platform/tickets/${ticket.id}/messages`
          : `/api/support/tickets/${ticket.id}/messages`;
      const form = new FormData();
      form.append('authorUserId', String(authorUserId));
      form.append('body', trimmed);
      if (file) form.append('attachment', file);
      const res = await fetch(url, { method: 'POST', body: form });
      const body = (await res.json().catch(() => ({}))) as {
        message?: SupportMessage;
        messages?: SupportMessage[];
        renewChoices?: RenewChoice[];
        error?: string;
      };
      if (!res.ok) throw new Error(body.error || 'Failed to send');
      setReply('');
      setAttachFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (Array.isArray(body.messages)) {
        setMessages(body.messages);
      } else if (body.message) {
        setMessages((prev) => [...prev, body.message!]);
      }
      if (Array.isArray(body.renewChoices)) {
        setRenewChoices(body.renewChoices);
      } else if (mode === 'account') {
        await loadChannel();
      }
      notifySupportInboxChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  async function sendReply() {
    await sendText(reply, attachFile);
  }

  async function onReply(e: FormEvent) {
    e.preventDefault();
    await sendReply();
  }

  async function clearChat() {
    if (!ticket?.id || mode !== 'platform' || clearing) return;
    if (
      !window.confirm(
        t('Clear all messages in this chat? This cannot be undone.'),
      )
    ) {
      return;
    }
    setClearing(true);
    setError('');
    try {
      const res = await fetch(`/api/support/platform/tickets/${ticket.id}/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authorUserId }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || 'Failed to clear chat');
      setMessages([]);
      setRenewChoices([]);
      setReply('');
      setAttachFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      notifySupportInboxChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear chat');
    } finally {
      setClearing(false);
    }
  }

  if (!open) return null;

  const panel = (
    <div
      className="wa-chat-overlay"
      role="presentation"
      style={{ ['--wa-chat-top' as string]: `${topOffset}px` }}
      onClick={onClose}
    >
      <div
        className="wa-chat-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="wa-chat-thread-header">
          <div className="wa-chat-avatar wa-chat-avatar--self" aria-hidden>
            {initials(peerLabel)}
          </div>
          <div className="wa-chat-thread-meta">
            <strong>{title}</strong>
            <span>{peerLabel}</span>
          </div>
          <button
            type="button"
            className="wa-chat-icon-btn"
            onClick={onClose}
            aria-label={t('Close')}
            title={t('Close')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        {error ? (
          <p className="wa-chat-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="wa-chat-messages">
          {loading && messages.length === 0 ? (
            <p className="wa-chat-muted">{t('Loading…')}</p>
          ) : null}
          {!loading && messages.length === 0 ? (
            <p className="wa-chat-muted wa-chat-muted--center">
              {t('Send a message to SwimIT for help or to share a complaint.')}
            </p>
          ) : null}
          {messages.map((msg) => {
            const mine =
              (mode === 'platform' && msg.authorRole === 'platform') ||
              (mode === 'account' && msg.authorRole === 'account_admin');
            return (
              <div
                key={msg.id}
                className={`wa-chat-bubble-row${mine ? ' wa-chat-bubble-row--mine' : ''}`}
              >
                <article className={`wa-chat-bubble${mine ? ' wa-chat-bubble--mine' : ''}`}>
                  {!mine ? (
                    <span className="wa-chat-bubble-author">
                      {msg.authorRole === 'platform'
                        ? t('SwimIT')
                        : msg.authorUserName || t('Account admin')}
                    </span>
                  ) : null}
                  {msg.attachmentUrl &&
                  isImageMime(msg.attachmentMime, msg.attachmentName || msg.attachmentUrl) ? (
                    (() => {
                      const upiHref = extractUpiPayUri(msg.body);
                      return (
                        <a
                          className="wa-chat-attach-image"
                          href={upiHref || msg.attachmentUrl}
                          target={upiHref ? undefined : '_blank'}
                          rel={upiHref ? undefined : 'noreferrer'}
                          title={upiHref ? t('Open UPI payment app') : t('Attachment')}
                        >
                          <img
                            src={msg.attachmentUrl}
                            alt={msg.attachmentName || t('Attachment')}
                          />
                        </a>
                      );
                    })()
                  ) : null}
                  {msg.attachmentUrl &&
                  !isImageMime(msg.attachmentMime, msg.attachmentName || msg.attachmentUrl) ? (
                    <a
                      className="wa-chat-attach-file"
                      href={msg.attachmentUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
                        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                        <path d="M14 3v5h5" />
                      </svg>
                      <span>{msg.attachmentName || t('Document')}</span>
                    </a>
                  ) : null}
                  {msg.body && !(msg.attachmentUrl && msg.body === msg.attachmentName) ? (
                    <ChatMessageBody text={msg.body} />
                  ) : null}
                  <time>{formatMsgTime(msg.createdAt)}</time>
                </article>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {mode === 'platform' ? (
          <div className="wa-chat-choices" role="group" aria-label={t('Quick actions')}>
            <button
              type="button"
              className="wa-chat-choice-btn"
              disabled={sending || clearing || !ticket}
              onClick={() => void sendText('renew')}
            >
              {t('Start renew')}
            </button>
            <button
              type="button"
              className="wa-chat-choice-btn wa-chat-choice-btn--danger"
              disabled={sending || clearing || !ticket || messages.length === 0}
              onClick={() => void clearChat()}
            >
              {clearing ? t('Clearing…') : t('Clear chat')}
            </button>
          </div>
        ) : null}

        {mode === 'account' && renewChoices.length > 0 ? (
          <div className="wa-chat-choices" role="group" aria-label={t('Quick replies')}>
            {renewChoices.map((choice) => (
              <button
                key={`${choice.id}-${choice.label}`}
                type="button"
                className="wa-chat-choice-btn"
                disabled={sending}
                onClick={() => void sendText(choice.id)}
              >
                {choice.label}
              </button>
            ))}
          </div>
        ) : null}

        {ticket && ticket.status === 'open' ? (
          <form className="wa-chat-composer" onSubmit={onReply}>
            <input
              ref={fileInputRef}
              type="file"
              className="wa-chat-file-input"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,application/pdf"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setAttachFile(file);
              }}
            />
            <button
              type="button"
              className="wa-chat-icon-btn wa-chat-attach-btn"
              onClick={() => fileInputRef.current?.click()}
              aria-label={t('Attach picture or document')}
              title={t('Attach picture or document')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M21.4 11.6 12 21a5 5 0 0 1-7.1-7.1l9.9-9.9a3.2 3.2 0 0 1 4.5 4.5l-9.2 9.2a1.4 1.4 0 0 1-2-2l8.1-8.1" />
              </svg>
            </button>
            <div className="wa-chat-composer-main">
              {attachFile ? (
                <div className="wa-chat-attach-chip">
                  <span>{attachFile.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setAttachFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    aria-label={t('Remove attachment')}
                  >
                    ×
                  </button>
                </div>
              ) : null}
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={1}
                maxLength={4000}
                placeholder={t('Type a message')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void sendReply();
                  }
                }}
              />
            </div>
            <button
              type="submit"
              className="wa-chat-send"
              disabled={sending || (!reply.trim() && !attachFile)}
              aria-label={t('Send')}
              title={t('Send')}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </form>
        ) : !loading ? (
          <div className="wa-chat-closed">{t('Chat unavailable.')}</div>
        ) : null}
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
