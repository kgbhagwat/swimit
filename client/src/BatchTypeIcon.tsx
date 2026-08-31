type BatchIconKind = 'general' | 'ladies' | 'advance' | 'other';

const BATCH_ICON_SRC: Record<BatchIconKind, string> = {
  general: '/batch-icons/general.png',
  ladies: '/batch-icons/ladies.png',
  advance: '/batch-icons/advance.png',
  other: '/batch-icons/general.png',
};

function batchIconKind(type: string): BatchIconKind {
  const value = type.trim().toLowerCase();
  if (!value) return 'other';
  if (value === 'ladies' || value.includes('lady') || value.includes('women') || value === 'female') {
    return 'ladies';
  }
  if (
    value === 'advance' ||
    value.includes('advanced') ||
    value.includes('competitive') ||
    value.includes('competition')
  ) {
    return 'advance';
  }
  if (value === 'general' || value.includes('regular') || value.includes('mixed')) {
    return 'general';
  }
  return 'other';
}

export function BatchTypeIcon({
  type,
  className = 'pool-site-batch-icon',
}: {
  type: string;
  className?: string;
}) {
  const kind = batchIconKind(type);
  const mod =
    kind === 'general'
      ? ' pool-site-batch-icon--general'
      : kind === 'ladies'
        ? ' pool-site-batch-icon--ladies'
        : kind === 'advance'
          ? ' pool-site-batch-icon--advance'
          : ' pool-site-batch-icon--other';

  return (
    <span className={`${className}${mod}`} aria-hidden>
      <img src={BATCH_ICON_SRC[kind]} alt="" />
    </span>
  );
}
