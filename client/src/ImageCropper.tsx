import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useObjectUrl } from './useObjectUrl';

type Size = { width: number; height: number };
type Offset = { x: number; y: number };
type Point = { x: number; y: number };
type Corners = { topLeft: Point; topRight: Point; bottomRight: Point; bottomLeft: Point };

type ImageCropperProps = {
  file: File;
  aspect: number;
  documentMode?: boolean;
  onCancel: () => void;
  onComplete: (file: File) => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function cropFileName(name: string) {
  const stem = name.replace(/\.[^.]+$/, '') || 'image';
  return `${stem}-cropped.jpg`;
}

const INITIAL_CORNERS: Corners = {
  topLeft: { x: 0.06, y: 0.06 },
  topRight: { x: 0.94, y: 0.06 },
  bottomRight: { x: 0.94, y: 0.94 },
  bottomLeft: { x: 0.06, y: 0.94 },
};

function pointDistance(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function bilinear(corners: Corners, x: number, y: number): Point {
  const top = {
    x: corners.topLeft.x + (corners.topRight.x - corners.topLeft.x) * x,
    y: corners.topLeft.y + (corners.topRight.y - corners.topLeft.y) * x,
  };
  const bottom = {
    x: corners.bottomLeft.x + (corners.bottomRight.x - corners.bottomLeft.x) * x,
    y: corners.bottomLeft.y + (corners.bottomRight.y - corners.bottomLeft.y) * x,
  };
  return {
    x: top.x + (bottom.x - top.x) * y,
    y: top.y + (bottom.y - top.y) * y,
  };
}

function drawTriangle(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  source: [Point, Point, Point],
  destination: [Point, Point, Point],
) {
  const [s0, s1, s2] = source;
  const [d0, d1, d2] = destination;
  const denominator =
    s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
  if (Math.abs(denominator) < 0.000001) return;
  const a =
    (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) /
    denominator;
  const b =
    (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) /
    denominator;
  const c =
    (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) /
    denominator;
  const d =
    (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) /
    denominator;
  const e =
    (d0.x * (s1.x * s2.y - s2.x * s1.y) +
      d1.x * (s2.x * s0.y - s0.x * s2.y) +
      d2.x * (s0.x * s1.y - s1.x * s0.y)) /
    denominator;
  const f =
    (d0.y * (s1.x * s2.y - s2.x * s1.y) +
      d1.y * (s2.x * s0.y - s0.x * s2.y) +
      d2.y * (s0.x * s1.y - s1.x * s0.y)) /
    denominator;
  context.save();
  context.beginPath();
  context.moveTo(d0.x, d0.y);
  context.lineTo(d1.x, d1.y);
  context.lineTo(d2.x, d2.y);
  context.closePath();
  context.clip();
  context.setTransform(a, b, c, d, e, f);
  context.drawImage(image, 0, 0);
  context.restore();
}

export function ImageCropper({
  file,
  aspect,
  documentMode = false,
  onCancel,
  onComplete,
}: ImageCropperProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; offset: Offset } | null>(
    null,
  );
  const objectUrl = useObjectUrl(file);
  const [imageSize, setImageSize] = useState<Size>({ width: 0, height: 0 });
  const [stageSize, setStageSize] = useState<Size>({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [corners, setCorners] = useState<Corners>(INITIAL_CORNERS);
  const cornerDragRef = useRef<{ pointerId: number; key: keyof Corners } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () =>
      setStageSize({ width: stage.clientWidth, height: stage.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !saving) onCancel();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel, saving]);

  const baseScale =
    imageSize.width && imageSize.height && stageSize.width && stageSize.height
      ? Math.max(stageSize.width / imageSize.width, stageSize.height / imageSize.height)
      : 1;
  const scale = baseScale * zoom;
  const renderedWidth = imageSize.width * scale;
  const renderedHeight = imageSize.height * scale;
  const maxOffsetX = Math.max(0, (renderedWidth - stageSize.width) / 2);
  const maxOffsetY = Math.max(0, (renderedHeight - stageSize.height) / 2);

  function constrained(next: Offset): Offset {
    return {
      x: clamp(next.x, -maxOffsetX, maxOffsetX),
      y: clamp(next.y, -maxOffsetY, maxOffsetY),
    };
  }

  function reset() {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setCorners(INITIAL_CORNERS);
  }

  function moveCorner(event: ReactPointerEvent<HTMLButtonElement>, key: keyof Corners) {
    const stage = stageRef.current;
    const drag = cornerDragRef.current;
    if (!stage || !drag || drag.pointerId !== event.pointerId || drag.key !== key) return;
    const bounds = stage.getBoundingClientRect();
    const ranges: Record<keyof Corners, { minX: number; maxX: number; minY: number; maxY: number }> = {
      topLeft: { minX: 0.01, maxX: 0.49, minY: 0.01, maxY: 0.49 },
      topRight: { minX: 0.51, maxX: 0.99, minY: 0.01, maxY: 0.49 },
      bottomRight: { minX: 0.51, maxX: 0.99, minY: 0.51, maxY: 0.99 },
      bottomLeft: { minX: 0.01, maxX: 0.49, minY: 0.51, maxY: 0.99 },
    };
    const range = ranges[key];
    const next = {
      x: clamp((event.clientX - bounds.left) / bounds.width, range.minX, range.maxX),
      y: clamp((event.clientY - bounds.top) / bounds.height, range.minY, range.maxY),
    };
    setCorners((current) => ({ ...current, [key]: next }));
  }

  function stopCornerDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (cornerDragRef.current?.pointerId !== event.pointerId) return;
    cornerDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!imageSize.width) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offset,
    };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setOffset(
      constrained({
        x: drag.offset.x + event.clientX - drag.x,
        y: drag.offset.y + event.clientY - drag.y,
      }),
    );
  }

  function stopDragging(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function changeZoom(nextZoom: number) {
    const nextScale = baseScale * nextZoom;
    const nextMaxX = Math.max(0, (imageSize.width * nextScale - stageSize.width) / 2);
    const nextMaxY = Math.max(0, (imageSize.height * nextScale - stageSize.height) / 2);
    setZoom(nextZoom);
    setOffset((current) => ({
      x: clamp(current.x, -nextMaxX, nextMaxX),
      y: clamp(current.y, -nextMaxY, nextMaxY),
    }));
  }

  async function saveDocumentCrop() {
    const image = imageRef.current;
    if (!image || !imageSize.width || saving) return;
    setSaving(true);
    try {
      const sourceCorners: Corners = {
        topLeft: {
          x: corners.topLeft.x * imageSize.width,
          y: corners.topLeft.y * imageSize.height,
        },
        topRight: {
          x: corners.topRight.x * imageSize.width,
          y: corners.topRight.y * imageSize.height,
        },
        bottomRight: {
          x: corners.bottomRight.x * imageSize.width,
          y: corners.bottomRight.y * imageSize.height,
        },
        bottomLeft: {
          x: corners.bottomLeft.x * imageSize.width,
          y: corners.bottomLeft.y * imageSize.height,
        },
      };
      const measuredWidth =
        (pointDistance(sourceCorners.topLeft, sourceCorners.topRight) +
          pointDistance(sourceCorners.bottomLeft, sourceCorners.bottomRight)) /
        2;
      const measuredHeight =
        (pointDistance(sourceCorners.topLeft, sourceCorners.bottomLeft) +
          pointDistance(sourceCorners.topRight, sourceCorners.bottomRight)) /
        2;
      const outputScale = Math.min(
        1,
        1600 / Math.max(1, measuredWidth),
        1600 / Math.max(1, measuredHeight),
      );
      const outputWidth = Math.max(1, Math.round(measuredWidth * outputScale));
      const outputHeight = Math.max(1, Math.round(measuredHeight * outputScale));
      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas is not available');
      const columns = 24;
      const rows = Math.max(12, Math.round(columns * (outputHeight / outputWidth)));
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const x0 = column / columns;
          const x1 = (column + 1) / columns;
          const y0 = row / rows;
          const y1 = (row + 1) / rows;
          const s00 = bilinear(sourceCorners, x0, y0);
          const s10 = bilinear(sourceCorners, x1, y0);
          const s11 = bilinear(sourceCorners, x1, y1);
          const s01 = bilinear(sourceCorners, x0, y1);
          const d00 = { x: x0 * outputWidth, y: y0 * outputHeight };
          const d10 = { x: x1 * outputWidth, y: y0 * outputHeight };
          const d11 = { x: x1 * outputWidth, y: y1 * outputHeight };
          const d01 = { x: x0 * outputWidth, y: y1 * outputHeight };
          drawTriangle(context, image, [s00, s10, s11], [d00, d10, d11]);
          drawTriangle(context, image, [s00, s11, s01], [d00, d11, d01]);
        }
      }
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.94),
      );
      if (!blob) throw new Error('Unable to crop image');
      onComplete(
        new File([blob], cropFileName(file.name), {
          type: 'image/jpeg',
          lastModified: Date.now(),
        }),
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveCrop() {
    const image = imageRef.current;
    if (!image || !imageSize.width || !stageSize.width || saving) return;
    setSaving(true);
    try {
      const imageLeft = (stageSize.width - renderedWidth) / 2 + offset.x;
      const imageTop = (stageSize.height - renderedHeight) / 2 + offset.y;
      const sx = clamp(-imageLeft / scale, 0, imageSize.width);
      const sy = clamp(-imageTop / scale, 0, imageSize.height);
      const sw = Math.min(stageSize.width / scale, imageSize.width - sx);
      const sh = Math.min(stageSize.height / scale, imageSize.height - sy);
      const outputWidth = Math.max(1, Math.min(1600, Math.round(sw)));
      const outputHeight = Math.max(1, Math.round(outputWidth / aspect));
      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas is not available');
      context.drawImage(image, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.92),
      );
      if (!blob) throw new Error('Unable to crop image');
      onComplete(
        new File([blob], cropFileName(file.name), {
          type: 'image/jpeg',
          lastModified: Date.now(),
        }),
      );
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div
      className="image-crop-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onCancel();
      }}
    >
      <section
        className="image-crop-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-crop-title"
      >
        <div className="image-crop-head">
          <div>
            <h2 id="image-crop-title">
              {documentMode ? 'Select document corners' : 'Crop image'}
            </h2>
            <p>
              {documentMode
                ? 'Drag each corner marker to the matching document corner. The result will be straightened into a rectangle.'
                : 'Drag the image and zoom until the required portion fills the frame.'}
            </p>
          </div>
          <button type="button" onClick={onCancel} disabled={saving} aria-label="Close">
            ×
          </button>
        </div>
        <div
          ref={stageRef}
          className={`image-crop-stage${documentMode ? ' image-crop-stage--document' : ''}`}
          style={{
            aspectRatio: String(
              documentMode && imageSize.width ? imageSize.width / imageSize.height : aspect,
            ),
            width: `min(100%, 34rem, calc(58dvh * ${
              documentMode && imageSize.width ? imageSize.width / imageSize.height : aspect
            }))`,
          }}
          onPointerDown={documentMode ? undefined : onPointerDown}
          onPointerMove={documentMode ? undefined : onPointerMove}
          onPointerUp={documentMode ? undefined : stopDragging}
          onPointerCancel={documentMode ? undefined : stopDragging}
        >
          <img
            ref={imageRef}
            src={objectUrl ?? undefined}
            alt="Image to crop"
            draggable={false}
            onLoad={(event) => {
              setImageSize({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              });
              reset();
            }}
            style={{
              width: documentMode ? '100%' : imageSize.width ? `${renderedWidth}px` : 'auto',
              height: documentMode ? '100%' : imageSize.height ? `${renderedHeight}px` : 'auto',
              transform: documentMode
                ? 'none'
                : `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
            }}
          />
          {documentMode ? (
            <>
              <svg className="image-crop-corner-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                <polygon
                  points={`${corners.topLeft.x * 100},${corners.topLeft.y * 100} ${
                    corners.topRight.x * 100
                  },${corners.topRight.y * 100} ${corners.bottomRight.x * 100},${
                    corners.bottomRight.y * 100
                  } ${corners.bottomLeft.x * 100},${corners.bottomLeft.y * 100}`}
                />
              </svg>
              {(Object.keys(corners) as (keyof Corners)[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  className="image-crop-corner"
                  style={{
                    left: `${corners[key].x * 100}%`,
                    top: `${corners[key].y * 100}%`,
                  }}
                  aria-label={`Move ${key.replace(/([A-Z])/g, ' $1').toLowerCase()} corner`}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    cornerDragRef.current = { pointerId: event.pointerId, key };
                  }}
                  onPointerMove={(event) => moveCorner(event, key)}
                  onPointerUp={stopCornerDrag}
                  onPointerCancel={stopCornerDrag}
                />
              ))}
            </>
          ) : (
            <span className="image-crop-frame" aria-hidden />
          )}
        </div>
        {!documentMode ? (
          <label className="image-crop-zoom">
            <span>Zoom</span>
            <input
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={zoom}
              onChange={(event) => changeZoom(Number(event.target.value))}
            />
          </label>
        ) : null}
        <div className="image-crop-actions">
          <button type="button" className="csv-btn" onClick={reset} disabled={saving}>
            Reset
          </button>
          <button type="button" className="csv-btn" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="submit"
            onClick={() => void (documentMode ? saveDocumentCrop() : saveCrop())}
            disabled={saving || !imageSize.width}
          >
            {saving ? 'Cropping…' : documentMode ? 'Use document' : 'Use cropped image'}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
