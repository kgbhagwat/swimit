import { useT } from './i18n';

type ListPagerProps = {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  disabled?: boolean;
};

export function ListPager({ page, pageSize, total, onPage, disabled }: ListPagerProps) {
  const t = useT();
  const pages = Math.max(1, Math.ceil(total / Math.max(pageSize, 1)));
  if (total <= pageSize) return null;
  return (
    <div className="list-pager">
      <button
        type="button"
        className="ghost-btn"
        disabled={disabled || page <= 1}
        onClick={() => onPage(page - 1)}
      >
        {t('Previous')}
      </button>
      <span className="muted">
        {t('Page')} {page} {t('of')} {pages}
      </span>
      <button
        type="button"
        className="ghost-btn"
        disabled={disabled || page >= pages}
        onClick={() => onPage(page + 1)}
      >
        {t('Next')}
      </button>
    </div>
  );
}
