import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';

type Size = { width: number; height: number };
type Offset = { x: number; y: number };

type ImageCropperProps = {
  file: File;
  aspect: number;
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

export function ImageCropper({ file, aspect, onCancel, onComplete }: ImageCropperProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; offset: Offset } | null>(
    null,
  );
  const objectUrl = useMemo(() => URL.createObjectURL(file), [file]);
  const [imageSize, setImageSize] = useState<Size>({ width: 0, height: 0 });
  const [stageSize, setStageSize] = useState<Size>({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => () => URL.revokeObjectURL(objectUrl), [objectUrl]);

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
            <h2 id="image-crop-title">Crop image</h2>
            <p>Drag the image and zoom until the required portion fills the frame.</p>
          </div>
          <button type="button" onClick={onCancel} disabled={saving} aria-label="Close">
            ×
          </button>
        </div>
        <div
          ref={stageRef}
          className="image-crop-stage"
          style={{
            aspectRatio: String(aspect),
            width: `min(100%, 34rem, calc(58dvh * ${aspect}))`,
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
        >
          <img
            ref={imageRef}
            src={objectUrl}
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
              width: imageSize.width ? `${renderedWidth}px` : 'auto',
              height: imageSize.height ? `${renderedHeight}px` : 'auto',
              transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
            }}
          />
          <span className="image-crop-frame" aria-hidden />
        </div>
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
            onClick={() => void saveCrop()}
            disabled={saving || !imageSize.width}
          >
            {saving ? 'Cropping…' : 'Use cropped image'}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
