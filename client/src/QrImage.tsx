import { useEffect, useState, type MouseEvent } from 'react';
import QRCode from 'qrcode';
import { UpiAppPicker } from './UpiAppPicker';
import { isPayLaunchValue, openPayLaunch, paymentQrPayload } from './upiPay';

export function QrImage({
  value,
  encodeValue,
  alt = 'QR code',
  className = 'pass-qr-image',
  size = 180,
  /** When true (default for payment QRs), tap opens the UPI app picker. */
  openOnClick,
}: {
  value: string;
  /** Encoded into the QR. Payment QRs use the same https pay page as the Pay now link. */
  encodeValue?: string;
  alt?: string;
  className?: string;
  size?: number;
  openOnClick?: boolean;
}) {
  const [src, setSrc] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const raw = String(value ?? '').trim();
  const encoded = String(encodeValue ?? '').trim();
  const payQr = isPayLaunchValue(raw) || isPayLaunchValue(encoded);
  const qrValue = payQr ? paymentQrPayload(encoded || raw) : encoded || raw;
  const clickable = openOnClick ?? payQr;
  const pickerUri = /^upi:\/\/pay\?/i.test(raw) ? raw : '';

  useEffect(() => {
    let cancelled = false;
    if (!qrValue) {
      setSrc('');
      return;
    }
    QRCode.toDataURL(qrValue, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc('');
      });
    return () => {
      cancelled = true;
    };
  }, [qrValue, size]);

  if (!src) return <div className={`${className} pass-qr-fallback`}>QR unavailable</div>;

  const image = <img src={src} alt={alt} className={className} width={size} height={size} />;
  if (!clickable || !qrValue) return image;

  function onOpen(event: MouseEvent<HTMLAnchorElement>) {
    if (!payQr) return;
    event.preventDefault();
    if (pickerUri) {
      setPickerOpen(true);
      return;
    }
    openPayLaunch(encoded || raw);
  }

  return (
    <>
      <a
        className="qr-pay-link"
        href={payQr ? qrValue : raw}
        title={payQr ? 'Choose a payment app' : alt}
        aria-label={payQr ? 'Choose a payment app' : alt}
        onClick={onOpen}
      >
        {image}
      </a>
      {pickerOpen && pickerUri ? (
        <UpiAppPicker uri={pickerUri} variant="sheet" onClose={() => setPickerOpen(false)} />
      ) : null}
    </>
  );
}
