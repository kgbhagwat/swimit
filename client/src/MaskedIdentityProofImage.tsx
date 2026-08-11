import { useEffect, useState } from 'react';
import { maskIdentityProofImage } from './maskIdentityProofImage';

/**
 * Shows an identity-proof image with the identity number masked on the pixels
 * (last 4 digits only). Used when viewing already-stored proofs.
 */
export function MaskedIdentityProofImage({
  src,
  identityNumber,
  alt,
  className,
}: {
  src: string;
  identityNumber?: string | null;
  alt: string;
  className?: string;
}) {
  const [displaySrc, setDisplaySrc] = useState(src);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    const number = String(identityNumber ?? '').trim();

    async function run() {
      if (!src || number.replace(/[\s\-_/]/g, '').length < 4) {
        setDisplaySrc(src);
        return;
      }
      setBusy(true);
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error('Failed to load identity proof');
        const blob = await res.blob();
        const file = new File([blob], 'identity-proof.jpg', {
          type: blob.type || 'image/jpeg',
        });
        const masked = await maskIdentityProofImage(file, number);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(masked);
        setDisplaySrc(objectUrl);
      } catch {
        if (!cancelled) setDisplaySrc(src);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, identityNumber]);

  return (
    <>
      <img src={displaySrc} alt={alt} className={className} draggable={false} />
      {busy ? (
        <span className="visually-hidden">Masking identity number…</span>
      ) : null}
    </>
  );
}
