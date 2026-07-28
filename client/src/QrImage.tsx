import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function QrImage({
  value,
  alt = 'QR code',
  className = 'pass-qr-image',
  size = 180,
}: {
  value: string;
  alt?: string;
  className?: string;
  size?: number;
}) {
  const [src, setSrc] = useState('');

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
  return <img src={src} alt={alt} className={className} width={size} height={size} />;
}
