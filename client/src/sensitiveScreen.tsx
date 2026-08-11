import {
  useEffect,
  type ReactNode,
  type SyntheticEvent,
} from 'react';

const BODY_CLASS = 'sensitive-screen-active';
const COVER_CLASS = 'sensitive-screen-cover-on';
let activeCount = 0;

function bumpActive(delta: number) {
  activeCount = Math.max(0, activeCount + delta);
  document.documentElement.classList.toggle(BODY_CLASS, activeCount > 0);
  if (activeCount === 0) {
    document.documentElement.classList.remove(COVER_CLASS);
  }
}

function flashCover(ms = 1600) {
  document.documentElement.classList.add(COVER_CLASS);
  window.setTimeout(() => {
    document.documentElement.classList.remove(COVER_CLASS);
  }, ms);
}

/**
 * While sensitive photos / ID cards are on screen, block common capture paths
 * (save-as, drag, print) and cover the UI on suspected screenshot shortcuts.
 * OS-level screenshots cannot be fully blocked in a browser.
 */
export function useSensitiveScreen(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    bumpActive(1);

    function blockContext(event: Event) {
      event.preventDefault();
    }

    function blockDrag(event: Event) {
      event.preventDefault();
    }

    function onKeyDown(event: KeyboardEvent) {
      const key = event.key;
      const lower = key.toLowerCase();
      if (key === 'PrintScreen') {
        event.preventDefault();
        flashCover();
        return;
      }
      // macOS / Windows screenshot chords commonly used with sensitive screens
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        (lower === '3' || lower === '4' || lower === 's' || lower === '5')
      ) {
        flashCover(2200);
      }
      if ((event.ctrlKey || event.metaKey) && lower === 'p') {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    function onVisibility() {
      if (document.visibilityState === 'hidden' && activeCount > 0) {
        document.documentElement.classList.add(COVER_CLASS);
      } else if (document.visibilityState === 'visible') {
        window.setTimeout(() => {
          document.documentElement.classList.remove(COVER_CLASS);
        }, 400);
      }
    }

    document.addEventListener('contextmenu', blockContext, true);
    document.addEventListener('dragstart', blockDrag, true);
    window.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      bumpActive(-1);
      document.removeEventListener('contextmenu', blockContext, true);
      document.removeEventListener('dragstart', blockDrag, true);
      window.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled]);
}

export function blockMediaInteraction(event: SyntheticEvent) {
  event.preventDefault();
}

/** Wrapper for ID cards / identity photos shown on screen. */
export function SensitiveSurface({
  children,
  className = '',
  label = 'Confidential',
  enabled = true,
  watermark = true,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
  enabled?: boolean;
  /** When false, keep capture blocks but leave the photo clear (no overlay). */
  watermark?: boolean;
}) {
  useSensitiveScreen(enabled);
  if (!enabled) return <>{children}</>;
  return (
    <div
      className={`sensitive-surface${className ? ` ${className}` : ''}`}
      onContextMenu={blockMediaInteraction}
      onDragStart={blockMediaInteraction}
    >
      <div className="sensitive-surface-content">{children}</div>
      {watermark ? (
        <div className="sensitive-surface-watermark" aria-hidden>
          <span>{label}</span>
          <span>{label}</span>
          <span>{label}</span>
          <span>{label}</span>
          <span>{label}</span>
          <span>{label}</span>
        </div>
      ) : null}
    </div>
  );
}
