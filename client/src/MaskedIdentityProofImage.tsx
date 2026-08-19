import { useEffect, useState } from 'react';
import { FilePreview } from './FilePreview';
import { shouldMaskIdentityNumber } from './identityNumber';
import { maskIdentityProofImage } from './maskIdentityProofImage';
import { headerLooksLikePdf, isPdfFile, isPdfUrl } from './uploadFile';

/**
 * Shows an identity-proof image with the identity number masked on the pixels
 * (last 4 digits only). PDFs are shown as a document link without masking.
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
  const [displayFile, setDisplayFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    const number = String(identityNumber ?? '').trim();

    async function run() {
      setDisplayFile(null);
      if (!src) {
        setDisplaySrc(src);
        return;
      }
      setBusy(true);
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error('Failed to load identity proof');
        const blob = await res.blob();
        const head = await blob.slice(0, 5).arrayBuffer();
        const isPdf = blob.type.includes('pdf') || isPdfUrl(src) || headerLooksLikePdf(head);
        const file = new File([blob], isPdf ? 'identity-proof.pdf' : 'identity-proof.jpg', {
          type: isPdf ? 'application/pdf' : blob.type || 'image/jpeg',
        });
        if (cancelled) return;
        if (isPdfFile(file) || !shouldMaskIdentityNumber(number)) {
          objectUrl = URL.createObjectURL(blob);
          setDisplayFile(file);
          setDisplaySrc(objectUrl);
          return;
        }
        const masked = await maskIdentityProofImage(file, number);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(masked);
        setDisplayFile(masked);
        setDisplaySrc(objectUrl);
      } catch {
        if (!cancelled) {
          setDisplayFile(null);
          setDisplaySrc(src);
        }
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
      <FilePreview src={displaySrc} file={displayFile} alt={alt} className={className} draggable={false} />
      {busy ? (
        <span className="visually-hidden">Masking identity number…</span>
      ) : null}
    </>
  );
}
