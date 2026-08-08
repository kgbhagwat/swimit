import { useCallback, useEffect, useState } from 'react';
import { useT } from './i18n';
import {
  notifySupportInboxChanged,
  SUPPORT_INBOX_CHANGED,
  SupportBellIcon,
  SupportChatPanel,
} from './SupportChatPanel';

export { notifySupportInboxChanged, SUPPORT_INBOX_CHANGED };
export const SUPPORT_OPEN_NEW = 'swimIT.supportOpenNew';

export function requestOpenSupportNew() {
  window.dispatchEvent(new Event(SUPPORT_OPEN_NEW));
}

/** Header bell for account admins: opens chat with SwimIT. */
export function SupportInboxButton({
  accountCode: _accountCode,
  authorUserId,
}: {
  accountCode: string;
  authorUserId: number;
}) {
  const t = useT();
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/support/inbox-summary');
      const body = (await res.json().catch(() => ({}))) as {
        unreadCount?: number;
        error?: string;
      };
      if (!res.ok) {
        setUnreadCount(0);
        return;
      }
      setUnreadCount(Math.max(0, Number(body.unreadCount ?? 0)));
    } catch {
      setUnreadCount(0);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
    const onFocus = () => void loadSummary();
    const onChanged = () => void loadSummary();
    const onOpenNew = () => setOpen(true);
    window.addEventListener('focus', onFocus);
    window.addEventListener(SUPPORT_INBOX_CHANGED, onChanged);
    window.addEventListener(SUPPORT_OPEN_NEW, onOpenNew);
    const timer = window.setInterval(() => void loadSummary(), 45_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(SUPPORT_INBOX_CHANGED, onChanged);
      window.removeEventListener(SUPPORT_OPEN_NEW, onOpenNew);
      window.clearInterval(timer);
    };
  }, [loadSummary]);

  return (
    <>
      <button
        type="button"
        className="tenant-support-btn"
        aria-label={
          unreadCount > 0 ? t('Chat with SwimIT') + ` (${unreadCount})` : t('Chat with SwimIT')
        }
        title={t('Chat with SwimIT')}
        onClick={() => setOpen(true)}
      >
        <SupportBellIcon />
        {unreadCount > 0 ? (
          <span className="tenant-support-badge" aria-hidden>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>
      <SupportChatPanel
        open={open}
        onClose={() => {
          setOpen(false);
          void loadSummary();
          notifySupportInboxChanged();
        }}
        mode="account"
        authorUserId={authorUserId}
      />
    </>
  );
}
