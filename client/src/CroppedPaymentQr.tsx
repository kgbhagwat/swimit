import { useEffect, useState } from 'react';
import { cropPaymentQrFromUrl } from './cropPaymentQr';

export function CroppedPaymentQr({
  src,
  alt,
  className = 'online-payment-qr',
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [out, setOut] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    setOut(null);
    void cropPaymentQrFromUrl(src)
      .then((blob) => {
        if (cancelled) return;
        if (!blob) {
          setOut(src);
          return;
        }
        created = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(created);
          return;
        }
        setOut(created);
      })
      .catch(() => {
        if (!cancelled) setOut(src);
      });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [src]);

  if (!out) return <div className={`${className} cropped-payment-qr-pending`} aria-hidden="true" />;
  return <img src={out} alt={alt} className={className} />;
}
