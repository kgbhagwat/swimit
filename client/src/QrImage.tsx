import { useEffect, useState, type MouseEvent } from 'react';
import QRCode from 'qrcode';
import { UpiAppPicker } from './UpiAppPicker';
import { isMobileUpiClient, openUpiPay } from './upiPay';

export function QrImage({
  value,
  alt = 'QR code',
  className = 'pass-qr-image',
  size = 180,
  /** When true (default for upi:// values), tap opens UPI app chooser on mobile. */
  openOnClick,
}: {
  value: string;
  alt?: string;
  className?: string;
  size?: number;
  openOnClick?: boolean;
}) {
  const [src, setSrc] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const isUpi = value.trim().toLowerCase().startsWith('upi://');
  const clickable = openOnClick ?? isUpi;

  useEffect(() => {
    let cancelled = false;
    if (!value) {
      setSrc('');
      return;
    }
    QRCode.toDataURL(value, {
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
  }, [value, size]);

  if (!src) return <div className={`${className} pass-qr-fallback`}>QR unavailable</div>;

  const image = <img src={src} alt={alt} className={className} width={size} height={size} />;
  if (!clickable || !value) return image;

  function onOpen(event: MouseEvent<HTMLAnchorElement>) {
    if (!isUpi) return;
    event.preventDefault();
    if (isMobileUpiClient()) {
      setPickerOpen(true);
      return;
    }
    openUpiPay(value);
  }

  return (
    <>
      <a
        className="qr-pay-link"
        href={value}
        title={isUpi ? 'Choose a payment app' : alt}
        aria-label={isUpi ? 'Choose a payment app' : alt}
        onClick={onOpen}
      >
        {image}
      </a>
      {pickerOpen ? (
        <UpiAppPicker uri={value} variant="sheet" onClose={() => setPickerOpen(false)} />
      ) : null}
    </>
  );
}
