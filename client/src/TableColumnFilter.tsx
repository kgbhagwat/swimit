import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from './i18n';

export type ColumnSortDir = 'asc' | 'desc' | null;

type TableColumnFilterProps = {
  label: string;
  values: string[];
  selected: Set<string> | null;
  sortDir: ColumnSortDir;
  open: boolean;
  onToggleOpen: () => void;
  onClose: () => void;
  onSelectedChange: (next: Set<string> | null) => void;
  onSort: (dir: ColumnSortDir) => void;
};

export function TableColumnFilter({
  label,
  values,
  selected,
  sortDir,
  open,
  onToggleOpen,
  onClose,
  onSelectedChange,
  onSort,
}: TableColumnFilterProps) {
  const t = useT();
  const displayLabel = t(label);
  const rootRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const uniqueValues = useMemo(() => {
    const set = new Set(values.map((v) => (v.trim() ? v : '—')));
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [values]);

  const filteredValues = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return uniqueValues;
    return uniqueValues.filter((v) => v.toLowerCase().includes(q));
  }, [uniqueValues, search]);

  const active = selected !== null;
  const allSelected = !selected || filteredValues.every((v) => selected.has(v));
  const someSelected =
    selected !== null && filteredValues.some((v) => selected.has(v)) && !allSelected;

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  function clearFilter() {
    onSelectedChange(null);
    onSort(null);
    setSearch('');
  }

  function toggleAll() {
    if (allSelected) {
      onSelectedChange(new Set());
      return;
    }
    onSelectedChange(new Set(filteredValues));
  }

  function toggleValue(value: string) {
    const base = selected ? new Set(selected) : new Set(uniqueValues);
    if (base.has(value)) base.delete(value);
    else base.add(value);
    if (base.size === uniqueValues.length) onSelectedChange(null);
    else onSelectedChange(base);
  }

  return (
    <div className={`table-col-filter${active || sortDir ? ' is-active' : ''}`} ref={rootRef}>
      <button
        type="button"
        className={`table-col-filter-trigger${open ? ' is-open' : ''}`}
        onClick={onToggleOpen}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${t('Filter')} ${displayLabel}`}
      >
        <span className="table-col-filter-label">{displayLabel}</span>
        <span className="table-col-filter-chevron" aria-hidden>
          {open ? '▴' : '▾'}
        </span>
      </button>

      {open ? (
        <div className="table-col-filter-menu" role="dialog" aria-label={`${displayLabel} ${t('Filter')}`}>
          <div className="table-col-filter-menu-top">
            <button type="button" className="table-col-filter-clear" onClick={clearFilter}>
              {t('Clear')}
            </button>
            <div className="table-col-filter-sort-arrows">
              <button
                type="button"
                className={sortDir === 'asc' ? 'selected' : ''}
                onClick={() => onSort(sortDir === 'asc' ? null : 'asc')}
                aria-label={t('Sort ascending')}
                title={t('Sort ascending')}
              >
                ▲
              </button>
              <button
                type="button"
                className={sortDir === 'desc' ? 'selected' : ''}
                onClick={() => onSort(sortDir === 'desc' ? null : 'desc')}
                aria-label={t('Sort descending')}
                title={t('Sort descending')}
              >
                ▼
              </button>
            </div>
          </div>
          <input
            className="table-col-filter-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('Search…')}
            aria-label={`${t('Search')} ${displayLabel}`}
          />
          <div className="table-col-filter-list">
            <label className="table-col-filter-item table-col-filter-item--all">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={toggleAll}
              />
              <span>{t('Select all')}</span>
            </label>
            {filteredValues.map((value) => {
              const checked = !selected || selected.has(value);
              return (
                <label key={value} className="table-col-filter-item">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleValue(value)}
                  />
                  <span title={value}>{value}</span>
                </label>
              );
            })}
            {filteredValues.length === 0 ? (
              <p className="table-col-filter-empty">No matching values</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
