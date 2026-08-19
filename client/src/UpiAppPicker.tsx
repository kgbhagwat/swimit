import { useState } from 'react';
import { useT } from './i18n';
import {
  UPI_APP_CHOICES,
  chromeHttpsIntent,
  copyUpiPayee,
  isAndroidDevice,
  isInAppBrowser,
  isMobileUpiClient,
  openUpiAppChoice,
  openUpiPay,
  parseUpiPayFields,
  upiAppLaunchHref,
  upiPayQuery,
} from './upiPay';

export function UpiAppPicker({
  uri,
  variant = 'page',
  onClose,
}: {
  uri: string;
  variant?: 'page' | 'sheet';
  onClose?: () => void;
}) {
  const t = useT();
  const query = upiPayQuery(uri);
  const fields = parseUpiPayFields(uri);
  const [copied, setCopied] = useState(false);
  if (!uri || !query) return null;

  async function copyPayee() {
    const ok = await copyUpiPayee(uri);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
    return ok;
  }

  async function openApp(appId: (typeof UPI_APP_CHOICES)[number]['id']) {
    await copyPayee();
    openUpiAppChoice(upiAppLaunchHref(appId, query));
  }

  function openNativeChooser() {
    void copyPayee();
    if (isAndroidDevice() && isInAppBrowser()) {
      openUpiAppChoice(chromeHttpsIntent(window.location.href));
      return;
    }
    openUpiPay(uri);
  }

  const list = (
    <div className="upi-app-picker">
      <p className="upi-app-picker-title">{t('Choose a payment app')}</p>
      <div className="upi-pay-summary">
        {fields.am ? (
          <p className="upi-pay-summary-amount">
            {t('Amount to pay')}: <strong>₹{fields.am}</strong>
          </p>
        ) : null}
        {fields.pa ? (
          <p className="upi-pay-summary-vpa">
            {t('UPI ID')}: <strong>{fields.pa}</strong>
          </p>
        ) : null}
        <p className="upi-pay-summary-hint">
          {t('Open the app, enter this amount, and complete payment to the UPI ID.')}
        </p>
        <button type="button" className="upi-pay-copy" onClick={() => void copyPayee()}>
          {copied ? t('Copied') : t('Copy UPI ID')}
        </button>
      </div>
      <div className="upi-app-picker-grid">
        {UPI_APP_CHOICES.map((app) => (
          <button
            key={app.id}
            type="button"
            className="upi-app-choice"
            onClick={() => void openApp(app.id)}
          >
            {t(app.label)}
          </button>
        ))}
        <button type="button" className="upi-app-choice upi-app-choice-more" onClick={openNativeChooser}>
          {t('More payment apps')}
        </button>
      </div>
    </div>
  );

  if (variant === 'page') return list;

  return (
    <div className="upi-app-sheet-backdrop" role="presentation" onClick={onClose}>
      <div
        className="upi-app-sheet"
        role="dialog"
        aria-label={t('Choose a payment app')}
        onClick={(event) => event.stopPropagation()}
      >
        {list}
        {onClose ? (
          <button type="button" className="upi-app-sheet-cancel" onClick={onClose}>
            {t('Cancel')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function UpiPayAppButton({
  uri,
  className,
  children,
}: {
  uri: string;
  className?: string;
  children: string;
}) {
  const [open, setOpen] = useState(false);
  if (!uri) return null;
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          if (isMobileUpiClient()) {
            setOpen(true);
            return;
          }
          openUpiPay(uri);
        }}
      >
        {children}
      </button>
      {open ? <UpiAppPicker uri={uri} variant="sheet" onClose={() => setOpen(false)} /> : null}
    </>
  );
}
