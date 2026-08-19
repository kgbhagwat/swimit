import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useT } from './i18n';

export type InPageSelectOption = {
  value: string;
  label: string;
  /** When searchable, match against this instead of the full label (e.g. pass name). */
  searchText?: string;
};

function optionMatches(option: InPageSelectOption, needle: string) {
  if (!needle) return true;
  const haystack = String(option.searchText ?? option.label)
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return haystack.includes(needle);
}

export function InPageSelect({
  value,
  onChange,
  options,
  placeholder,
  required,
  disabled,
  searchable = false,
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: InPageSelectOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  searchable?: boolean;
  'aria-label'?: string;
}) {
  const t = useT();
  const resolvedPlaceholder = placeholder ?? t('Select…');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dropUp, setDropUp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const selected = options.find((option) => option.value === value);
  const needle = query.trim().toLowerCase().replace(/\s+/g, ' ');
  const visibleOptions = useMemo(
    () => (searchable && needle ? options.filter((option) => optionMatches(option, needle)) : options),
    [needle, options, searchable],
  );

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (target && rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !searchable) return;
    inputRef.current?.focus();
  }, [open, searchable]);

  useLayoutEffect(() => {
    if (!open) {
      setDropUp(false);
      return;
    }
    const root = rootRef.current;
    if (!root) return;

    function clipBottom(node: HTMLElement) {
      let current = node.parentElement;
      let bottom = window.innerHeight;
      let top = 0;
      while (current) {
        const { overflowY } = getComputedStyle(current);
        if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'hidden') {
          const clip = current.getBoundingClientRect();
          bottom = Math.min(bottom, clip.bottom);
          top = Math.max(top, clip.top);
        }
        current = current.parentElement;
      }
      return { top, bottom };
    }

    function update() {
      const el = rootRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const { top, bottom } = clipBottom(el);
      const menuHeight = menuRef.current?.offsetHeight ?? 180;
      const spaceBelow = bottom - rect.bottom;
      const spaceAbove = rect.top - top;
      setDropUp(spaceBelow < menuHeight + 8 && spaceAbove > spaceBelow);
    }

    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [open, visibleOptions.length]);

  function choose(next: string) {
    onChange(next);
    setQuery('');
    setOpen(false);
  }

  return (
    <div
      className={`inpage-select${open ? ' is-open' : ''}${dropUp ? ' is-dropup' : ''}${
        disabled ? ' is-disabled' : ''
      }${searchable ? ' inpage-select--searchable' : ''}`}
      ref={rootRef}
    >
      {searchable ? (
        <div className="inpage-select-trigger inpage-select-trigger--search">
          <input
            ref={inputRef}
            className={`inpage-select-search${open || selected ? '' : ' inpage-select-placeholder'}`}
            value={open ? query : selected?.label ?? ''}
            placeholder={open && selected ? selected.label : resolvedPlaceholder}
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-label={ariaLabel}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                if (visibleOptions.length === 1) choose(visibleOptions[0].value);
              }
            }}
          />
          <span className="inpage-select-caret" aria-hidden>
            ▾
          </span>
        </div>
      ) : (
        <button
          type="button"
          className="inpage-select-trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={ariaLabel}
          disabled={disabled}
          onClick={() => setOpen((prev) => !prev)}
        >
          <span className={selected ? undefined : 'inpage-select-placeholder'}>
            {selected?.label ?? resolvedPlaceholder}
          </span>
          <span className="inpage-select-caret" aria-hidden>
            ▾
          </span>
        </button>
      )}
      {open ? (
        <ul className="inpage-select-menu" role="listbox" id={listId} ref={menuRef}>
          {!required && !(searchable && needle) ? (
            <li role="option" aria-selected={!value}>
              <button
                type="button"
                className={`inpage-select-option${!value ? ' is-selected' : ''}`}
                onClick={() => choose('')}
              >
                {resolvedPlaceholder}
              </button>
            </li>
          ) : null}
          {visibleOptions.length === 0 ? (
            <li className="inpage-select-empty">{t('No matching passes')}</li>
          ) : (
            visibleOptions.map((option) => {
              const isSelected = option.value === value;
              return (
                <li key={option.value} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    className={`inpage-select-option${isSelected ? ' is-selected' : ''}`}
                    onClick={() => choose(option.value)}
                  >
                    {option.label}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
