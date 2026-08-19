import { isPdfFile, isPdfUrl } from './uploadFile';
import { useT } from './i18n';

export function FilePreview({
  src,
  file,
  alt,
  className = 'preview pool-core-preview',
  draggable,
}: {
  src: string | null | undefined;
  file?: { type?: string; name?: string } | null;
  alt: string;
  className?: string;
  draggable?: boolean;
}) {
  const t = useT();
  if (!src) return null;
  const pdf = isPdfFile(file) || isPdfUrl(src);
  if (pdf) {
    const name = file?.name && isPdfNameSafe(file.name) ? file.name : t('PDF document');
    return (
      <a className="pdf-preview" href={src} target="_blank" rel="noreferrer">
        <span className="pdf-preview-badge">PDF</span>
        <span className="pdf-preview-name">{name}</span>
        <span className="pdf-preview-open">{t('Open')}</span>
      </a>
    );
  }
  return <img src={src} alt={alt} className={className} draggable={draggable} />;
}

function isPdfNameSafe(name: string) {
  return name.replace(/^.*[\\/]/, '').trim().length > 0;
}
