import { useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { useT } from './i18n';
import {
  customBoxHasContent,
  hideLayoutRect,
  isLayoutRectVisible,
  layoutRectCss,
  rectStyle,
  resizeLayoutRect,
  showLayoutRect,
  WEBSITE_LAYOUT_SECTIONS,
  type LayoutRect,
  type LayoutRectEdge,
  type PoolWebsiteLayout,
  type WebsiteLayoutSectionKey,
} from './poolWebsite';

type BoxTarget =
  | { kind: 'section'; key: WebsiteLayoutSectionKey }
  | { kind: 'custom'; index: number };

function edgeHandleStyle(rect: LayoutRect, edge: LayoutRectEdge): CSSProperties {
  const box = layoutRectCss(rect);
  const base: CSSProperties = { position: 'absolute', pointerEvents: 'auto', touchAction: 'none' };
  if (edge === 'top') {
    return {
      ...base,
      left: `${box.left}%`,
      top: `${box.top}%`,
      width: `${box.width}%`,
      height: 0,
      transform: 'translateY(-50%)',
      cursor: 'row-resize',
    };
  }
  if (edge === 'bottom') {
    return {
      ...base,
      left: `${box.left}%`,
      top: `${box.top + box.height}%`,
      width: `${box.width}%`,
      height: 0,
      transform: 'translateY(-50%)',
      cursor: 'row-resize',
    };
  }
  if (edge === 'left') {
    return {
      ...base,
      left: `${box.left}%`,
      top: `${box.top}%`,
      width: 0,
      height: `${box.height}%`,
      transform: 'translateX(-50%)',
      cursor: 'col-resize',
    };
  }
  return {
    ...base,
    left: `${box.left + box.width}%`,
    top: `${box.top}%`,
    width: 0,
    height: `${box.height}%`,
    transform: 'translateX(-50%)',
    cursor: 'col-resize',
  };
}

function RectEdgeHandle({
  edge,
  rect,
  disabled,
  onDragStart,
  onDrag,
}: {
  edge: LayoutRectEdge;
  rect: LayoutRect;
  disabled?: boolean;
  onDragStart: () => void;
  onDrag: (deltaXPct: number, deltaYPct: number) => void;
}) {
  const onDragRef = useRef(onDrag);
  const onDragStartRef = useRef(onDragStart);
  onDragRef.current = onDrag;
  onDragStartRef.current = onDragStart;

  if (disabled) return null;

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    onDragStartRef.current();
    let lastX = event.clientX;
    let lastY = event.clientY;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);

    function onPointerMove(ev: PointerEvent) {
      const deltaX = ev.clientX - lastX;
      const deltaY = ev.clientY - lastY;
      lastX = ev.clientX;
      lastY = ev.clientY;
      if (deltaX !== 0 || deltaY !== 0) onDragRef.current(deltaX, deltaY);
    }

    function onPointerUp(ev: PointerEvent) {
      target.releasePointerCapture(ev.pointerId);
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerup', onPointerUp);
      target.removeEventListener('pointercancel', onPointerUp);
    }

    target.addEventListener('pointermove', onPointerMove);
    target.addEventListener('pointerup', onPointerUp);
    target.addEventListener('pointercancel', onPointerUp);
  }

  const axis = edge === 'top' || edge === 'bottom' ? 'y' : 'x';

  return (
    <div
      className={`pool-layout-editor-handle pool-layout-editor-handle--${axis} pool-layout-editor-handle--edge-${edge}`}
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      style={edgeHandleStyle(rect, edge)}
      onPointerDown={onPointerDown}
    />
  );
}

function LayoutBox({
  label,
  rect,
  className,
  disabled,
  onDelete,
}: {
  label: string;
  rect: LayoutRect;
  className?: string;
  disabled?: boolean;
  onDelete?: () => void;
}) {
  const t = useT();
  return (
    <div
      className={`pool-layout-editor-box${className ? ` ${className}` : ''}`}
      style={rectStyle(rect)}
    >
      {!disabled && onDelete ? (
        <button
          type="button"
          className="pool-layout-editor-box-delete"
          aria-label={t('Remove section from page')}
          title={t('Remove from page')}
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          ×
        </button>
      ) : null}
      <span>{label}</span>
    </div>
  );
}

export function WebsiteLayoutEditor({
  layout,
  disabled,
  onLayoutChange,
  onLayoutCheckpoint,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  layout: PoolWebsiteLayout;
  disabled?: boolean;
  onLayoutChange: (layout: PoolWebsiteLayout) => void;
  onLayoutCheckpoint: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const t = useT();
  const canvasRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const labels: Record<WebsiteLayoutSectionKey, string> = {
    banner: t('Welcome banner'),
    story: t('Background & history'),
    intro: t('Pool information'),
    batches: t('Our batches'),
    coaches: t('Our coaches'),
    achievements: t('Achievements'),
  };

  function applyLayout(next: PoolWebsiteLayout) {
    layoutRef.current = next;
    onLayoutChange(next);
  }

  function pxToPct(deltaPx: number, axisLength: number) {
    if (!axisLength) return 0;
    return (deltaPx / axisLength) * 100;
  }

  function dragEdge(target: BoxTarget, edge: LayoutRectEdge, deltaXPx: number, deltaYPx: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const deltaXPct =
      edge === 'top' || edge === 'bottom' ? 0 : pxToPct(deltaXPx, canvas.clientWidth);
    const deltaYPct =
      edge === 'left' || edge === 'right' ? 0 : pxToPct(deltaYPx, canvas.clientHeight);
    const current = layoutRef.current;

    if (target.kind === 'custom') {
      const box = current.customBoxes[target.index];
      if (!box) return;
      const rect = resizeLayoutRect(box.rect, edge, deltaXPct, deltaYPct);
      applyLayout({
        ...current,
        customBoxes: current.customBoxes.map((item, i) =>
          i === target.index ? { ...item, rect } : item,
        ),
      });
      return;
    }

    const rect = resizeLayoutRect(current[target.key], edge, deltaXPct, deltaYPct);
    applyLayout({ ...current, [target.key]: rect });
  }

  function deleteBox(target: BoxTarget) {
    onLayoutCheckpoint();
    const current = layoutRef.current;
    if (target.kind === 'custom') {
      applyLayout({
        ...current,
        customBoxes: current.customBoxes.filter((_, i) => i !== target.index),
      });
      return;
    }
    applyLayout({ ...current, [target.key]: hideLayoutRect(current[target.key]) });
  }

  function restoreSection(key: WebsiteLayoutSectionKey) {
    onLayoutCheckpoint();
    const current = layoutRef.current;
    applyLayout({ ...current, [key]: showLayoutRect(current[key]) });
  }

  const edges: LayoutRectEdge[] = ['top', 'bottom', 'left', 'right'];
  const visibleSections = WEBSITE_LAYOUT_SECTIONS.filter((key) => isLayoutRectVisible(layout[key]));
  const hiddenSections = WEBSITE_LAYOUT_SECTIONS.filter((key) => !isLayoutRectVisible(layout[key]));
  const visibleCustomBoxes = layout.customBoxes
    .map((box, index) => ({ box, index }))
    .filter(({ box }) => isLayoutRectVisible(box.rect) && customBoxHasContent(box));

  useEffect(() => {
    if (disabled) return;
    function onKeyDown(event: KeyboardEvent) {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        if (canUndo) onUndo();
        return;
      }
      if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault();
        if (canRedo) onRedo();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [disabled, canUndo, canRedo, onUndo, onRedo]);

  return (
    <div className="pool-layout-editor">
      <div className="pool-layout-editor-toolbar">
        <p className="hint pool-layout-editor-hint">
          {t(
            'Drag any edge to resize. Use × on a box to remove it from the public page. Ctrl+Z / Ctrl+Y to undo or redo.',
          )}
        </p>
        {!disabled ? (
          <div className="pool-layout-editor-history">
            <button type="button" className="ghost-btn" disabled={!canUndo} onClick={onUndo}>
              {t('Undo')}
            </button>
            <button type="button" className="ghost-btn" disabled={!canRedo} onClick={onRedo}>
              {t('Redo')}
            </button>
          </div>
        ) : null}
      </div>
      <div ref={canvasRef} className="pool-layout-editor-canvas pool-layout-editor-canvas--free">
        {visibleSections.map((key) => (
          <LayoutBox
            key={key}
            label={labels[key]}
            rect={layout[key]}
            disabled={disabled}
            onDelete={() => deleteBox({ kind: 'section', key })}
            className={
              key === 'banner'
                ? 'pool-layout-editor-box--banner'
                : key === 'intro'
                  ? 'pool-layout-editor-box--intro'
                  : undefined
            }
          />
        ))}

        {visibleCustomBoxes.map(({ box, index }) => (
          <LayoutBox
            key={box.id}
            label={box.title.trim() || t('Custom box')}
            rect={box.rect}
            disabled={disabled}
            onDelete={() => deleteBox({ kind: 'custom', index })}
            className="pool-layout-editor-box--custom"
          />
        ))}

        {!disabled ? (
          <div className="pool-layout-editor-overlay" aria-hidden>
            {visibleSections.map((key) =>
              edges.map((edge) => (
                <RectEdgeHandle
                  key={`${key}-${edge}`}
                  edge={edge}
                  rect={layout[key]}
                  onDragStart={onLayoutCheckpoint}
                  onDrag={(dx, dy) => dragEdge({ kind: 'section', key }, edge, dx, dy)}
                />
              )),
            )}
            {visibleCustomBoxes.map(({ box, index }) =>
              edges.map((edge) => (
                <RectEdgeHandle
                  key={`custom-${box.id}-${edge}`}
                  edge={edge}
                  rect={box.rect}
                  onDragStart={onLayoutCheckpoint}
                  onDrag={(dx, dy) => dragEdge({ kind: 'custom', index }, edge, dx, dy)}
                />
              )),
            )}
          </div>
        ) : null}
      </div>

      {!disabled && hiddenSections.length > 0 ? (
        <div className="pool-layout-editor-removed">
          <span className="label">{t('Removed from page')}</span>
          <div className="pool-layout-editor-removed-list">
            {hiddenSections.map((key) => (
              <button
                key={key}
                type="button"
                className="terms-link"
                onClick={() => restoreSection(key)}
              >
                {t('Restore')} {labels[key]}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
