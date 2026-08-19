import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from './i18n';
import { CameraActionIcon, FlipCameraIcon, LandscapePageIcon, PortraitPageIcon, UploadActionIcon } from './PhotoActionIcons';
import { ACCEPT_IMAGE_OR_PDF } from './uploadFile';
import { cropImageToDocument, cropImageToPortraitFace } from './compressImage';

export type CameraFacing = 'user' | 'environment';

export function prefersPhoneCapture() {
  if (typeof navigator === 'undefined') return false;
  return /Android|webOS|iPhone|iPod|Mobile/i.test(navigator.userAgent) && !/iPad/i.test(navigator.userAgent);
}

function getUserMediaFn(): ((constraints: MediaStreamConstraints) => Promise<MediaStream>) | null {
  if (typeof navigator === 'undefined') return null;
  if (navigator.mediaDevices?.getUserMedia) {
    return (constraints) => navigator.mediaDevices.getUserMedia(constraints);
  }
  const nav = navigator as Navigator & {
    getUserMedia?: (
      constraints: MediaStreamConstraints,
      success: (stream: MediaStream) => void,
      error: (err: Error) => void,
    ) => void;
    webkitGetUserMedia?: (
      constraints: MediaStreamConstraints,
      success: (stream: MediaStream) => void,
      error: (err: Error) => void,
    ) => void;
    mozGetUserMedia?: (
      constraints: MediaStreamConstraints,
      success: (stream: MediaStream) => void,
      error: (err: Error) => void,
    ) => void;
  };
  const legacy = nav.getUserMedia || nav.webkitGetUserMedia || nav.mozGetUserMedia;
  if (!legacy) return null;
  return (constraints) =>
    new Promise((resolve, reject) => {
      legacy.call(navigator, constraints, resolve, reject);
    });
}

function cameraErrorMessage(err: unknown): string {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'Camera needs http://localhost or https. This page is not secure.';
  }
  const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Camera permission was blocked. Allow camera for this site, then try Take photo again.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No camera was found on this computer. Use Upload instead.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return 'The camera is in use by another app. Close it, then try Take photo again.';
  }
  return 'Could not open the camera. Allow camera permission, or use Upload.';
}

function streamDeviceId(stream: MediaStream | null): string | undefined {
  return stream?.getVideoTracks()[0]?.getSettings().deviceId;
}

async function listVideoInputs(): Promise<MediaDeviceInfo[]> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === 'videoinput' && device.deviceId);
  } catch {
    return [];
  }
}

function labelMatchesFacing(label: string, facing: CameraFacing) {
  const text = label.toLowerCase();
  if (facing === 'user') return /front|user|face|facetime/.test(text);
  return /back|rear|environment|world|wide|ultra/.test(text);
}

async function openCameraStream(
  facing: CameraFacing,
  options: { switching?: boolean; previousDeviceId?: string } = {},
): Promise<MediaStream> {
  const gum = getUserMediaFn();
  if (!gum) throw new Error('unavailable');

  const facingVideo: MediaTrackConstraints = {
    facingMode: { ideal: facing },
    width: { ideal: facing === 'user' ? 720 : 1280 },
    height: { ideal: facing === 'user' ? 960 : 720 },
  };

  const attempts: MediaStreamConstraints[] = [];

  if (options.switching) {
    const cameras = await listVideoInputs();
    const byLabel = cameras.find(
      (device) =>
        device.deviceId !== options.previousDeviceId && labelMatchesFacing(device.label, facing),
    );
    const others = cameras.filter((device) => device.deviceId !== options.previousDeviceId);
    const nextDevice = byLabel ?? others[0];
    if (nextDevice) {
      attempts.push({ audio: false, video: { deviceId: { exact: nextDevice.deviceId } } });
    }
    attempts.push({ audio: false, video: { facingMode: { exact: facing } } });
    attempts.push({ audio: false, video: facingVideo });
  } else {
    // Simplest constraint first so the click still counts as a user gesture
    // (a failed facingMode attempt can consume the permission prompt on Windows).
    attempts.push({ audio: false, video: true });
    attempts.push({ audio: false, video: facingVideo });
  }

  let lastError: unknown;
  for (const constraints of attempts) {
    try {
      const stream = await gum(constraints);
      if (
        options.switching &&
        options.previousDeviceId &&
        streamDeviceId(stream) === options.previousDeviceId
      ) {
        stream.getTracks().forEach((track) => track.stop());
        continue;
      }
      return stream;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error('unavailable');
}

/** Source rectangle that matches a 3:4 object-fit:cover preview, biased toward the head. */
function faceCropRect(videoWidth: number, videoHeight: number) {
  const target = 3 / 4;
  const video = videoWidth / Math.max(1, videoHeight);
  if (video > target) {
    const sw = videoHeight * target;
    return { sx: (videoWidth - sw) / 2, sy: 0, sw, sh: videoHeight };
  }
  const sh = videoWidth / target;
  const extra = videoHeight - sh;
  return { sx: 0, sy: extra * 0.22, sw: videoWidth, sh };
}

/** Source rectangle matching object-fit:cover into a landscape (4:3) preview. */
function coverCropRect(videoWidth: number, videoHeight: number, targetRatio: number) {
  const video = videoWidth / Math.max(1, videoHeight);
  if (video > targetRatio) {
    const sw = videoHeight * targetRatio;
    return { sx: (videoWidth - sw) / 2, sy: 0, sw, sh: videoHeight };
  }
  const sh = videoWidth / targetRatio;
  return { sx: 0, sy: (videoHeight - sh) / 2, sw: videoWidth, sh };
}

/** Match the dashed document guide: cover crop, then inset 5% / 7%. */
function documentCropRect(
  videoWidth: number,
  videoHeight: number,
  orientation: 'landscape' | 'portrait',
) {
  const cover = coverCropRect(videoWidth, videoHeight, orientation === 'portrait' ? 3 / 4 : 4 / 3);
  const padX = cover.sw * 0.05;
  const padY = cover.sh * 0.07;
  return {
    sx: cover.sx + padX,
    sy: cover.sy + padY,
    sw: Math.max(1, cover.sw - padX * 2),
    sh: Math.max(1, cover.sh - padY * 2),
  };
}

function useWebcamCapture(initialFacing: CameraFacing) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const facingRef = useRef<CameraFacing>(initialFacing);
  const initialFacingRef = useRef(initialFacing);
  const flippingRef = useRef(false);
  initialFacingRef.current = initialFacing;
  const [facing, setFacing] = useState<CameraFacing>(initialFacing);
  const [live, setLive] = useState(false);
  const [ready, setReady] = useState(false);
  const [flipping, setFlipping] = useState(false);
  const [error, setError] = useState('');

  const attachStream = useCallback((video: HTMLVideoElement | null, stream: MediaStream | null) => {
    if (!video || !stream) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    const markReady = () => {
      if (video.videoWidth > 1) setReady(true);
    };
    video.addEventListener('loadedmetadata', markReady, { once: true });
    video.addEventListener('playing', markReady, { once: true });
    void video.play().then(markReady).catch(() => {});
  }, []);

  const bindVideo = useCallback(
    (node: HTMLVideoElement | null) => {
      videoRef.current = node;
      attachStream(node, streamRef.current);
    },
    [attachStream],
  );

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const stop = useCallback(() => {
    stopTracks();
    facingRef.current = initialFacingRef.current;
    flippingRef.current = false;
    setFacing(initialFacingRef.current);
    setFlipping(false);
    setReady(false);
    setLive(false);
  }, [stopTracks]);

  useEffect(() => () => stop(), [stop]);

  useEffect(() => {
    if (!live) return;
    attachStream(videoRef.current, streamRef.current);
  }, [attachStream, live]);

  const applyStream = useCallback(
    (stream: MediaStream, nextFacing: CameraFacing) => {
      streamRef.current = stream;
      facingRef.current = nextFacing;
      setFacing(nextFacing);
      setError('');
      setReady(false);
      setLive(true);
      attachStream(videoRef.current, stream);
    },
    [attachStream],
  );

  const start = useCallback(async () => {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setError('Camera needs http://localhost or https. This page is not secure.');
      return false;
    }
    if (!getUserMediaFn()) {
      setError('Camera is not available in this browser. Use Upload image.');
      return false;
    }
    try {
      const nextFacing = facingRef.current;
      const stream = await openCameraStream(nextFacing);
      applyStream(stream, nextFacing);
      return true;
    } catch (err) {
      setLive(false);
      setError(cameraErrorMessage(err));
      return false;
    }
  }, [applyStream]);

  const flip = useCallback(async () => {
    if (!streamRef.current || flippingRef.current) return;
    flippingRef.current = true;
    const previousId = streamDeviceId(streamRef.current);
    const previousFacing = facingRef.current;
    const nextFacing: CameraFacing = previousFacing === 'user' ? 'environment' : 'user';
    setFlipping(true);
    setReady(false);
    setError('');
    stopTracks();
    try {
      const stream = await openCameraStream(nextFacing, {
        switching: true,
        previousDeviceId: previousId,
      });
      applyStream(stream, nextFacing);
    } catch {
      try {
        const restored = await openCameraStream(previousFacing);
        applyStream(restored, previousFacing);
        setError('Could not switch camera.');
      } catch (err) {
        setLive(false);
        setError(cameraErrorMessage(err));
      }
    } finally {
      flippingRef.current = false;
      setFlipping(false);
    }
  }, [applyStream, stopTracks]);

  const capture = useCallback(async (
    frame: 'face' | 'document' = 'document',
    orientation: 'landscape' | 'portrait' = 'landscape',
  ) => {
    const video = videoRef.current;
    if (!video || video.videoWidth < 2) return null;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    if (frame === 'face') {
      const { sx, sy, sw, sh } = faceCropRect(video.videoWidth, video.videoHeight);
      const outH = 960;
      const outW = Math.round(outH * (3 / 4));
      canvas.width = outW;
      canvas.height = outH;
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH);
    } else {
      const { sx, sy, sw, sh } = documentCropRect(
        video.videoWidth,
        video.videoHeight,
        orientation,
      );
      const outW = orientation === 'portrait' ? 720 : 1280;
      const outH = Math.max(1, Math.round(outW * (sh / sw)));
      canvas.width = outW;
      canvas.height = outH;
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH);
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) return null;
    stop();
    return new File([blob], `webcam-${Date.now()}.jpg`, { type: 'image/jpeg' });
  }, [stop]);

  return { bindVideo, live, ready, error, facing, flipping, start, stop, flip, capture };
}

type PhotoPickerButtonsProps = {
  disabled?: boolean;
  takeLabel: string;
  uploadLabel: string;
  onPickFile: (file: File) => void;
  onPickFiles?: (files: FileList | null) => void;
  multiple?: boolean;
  facing?: CameraFacing;
  /** Face oval is only for portraits. Documents/IDs never show it, even after flip. */
  guide?: 'face' | 'document';
};

/** Take photo opens the webcam in the page. Upload is the only control that opens a file picker. */
export function PhotoPickerButtons({
  disabled,
  takeLabel,
  uploadLabel,
  onPickFile,
  onPickFiles,
  multiple = false,
  facing = 'user',
  guide,
}: PhotoPickerButtonsProps) {
  const t = useT();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const startingRef = useRef(false);
  const webcam = useWebcamCapture(facing);
  const phone = prefersPhoneCapture();
  const faceFrame = (guide ?? (facing === 'user' ? 'face' : 'document')) === 'face';
  const [page, setPage] = useState<'landscape' | 'portrait'>('landscape');

  async function onTakePhoto() {
    if (startingRef.current) return;
    if (webcam.live) {
      const file = await webcam.capture(faceFrame ? 'face' : 'document', page);
      if (file) onPickFile(file);
      return;
    }
    startingRef.current = true;
    try {
      const opened = await webcam.start();
      if (!opened && phone) cameraRef.current?.click();
    } finally {
      startingRef.current = false;
    }
  }

  function onUpload() {
    webcam.stop();
    fileRef.current?.click();
  }

  return (
    <>
      <div className={`webcam-capture${webcam.live ? '' : ' webcam-capture--idle'}${faceFrame ? ' webcam-capture--face' : ` webcam-capture--document webcam-capture--${page}`}`}>
        <div className="webcam-capture-stage">
          <video
            ref={webcam.bindVideo}
            className="webcam-capture-video"
            autoPlay
            playsInline
            muted
          />
          {webcam.live && faceFrame ? <span className="webcam-face-guide" aria-hidden /> : null}
          {webcam.live && !faceFrame ? <span className="webcam-document-guide" aria-hidden /> : null}
          {webcam.live && !faceFrame ? (
            <div className="webcam-page-toggle" role="group" aria-label={t('Document orientation')}>
              <button
                type="button"
                className={`webcam-page-btn${page === 'landscape' ? ' is-selected' : ''}`}
                onClick={() => setPage('landscape')}
                aria-pressed={page === 'landscape'}
                aria-label={t('Landscape')}
                title={t('Landscape')}
              >
                <LandscapePageIcon />
              </button>
              <button
                type="button"
                className={`webcam-page-btn${page === 'portrait' ? ' is-selected' : ''}`}
                onClick={() => setPage('portrait')}
                aria-pressed={page === 'portrait'}
                aria-label={t('Portrait')}
                title={t('Portrait')}
              >
                <PortraitPageIcon />
              </button>
            </div>
          ) : null}
          {webcam.live ? (
            <button
              type="button"
              className="webcam-flip-btn"
              disabled={disabled || webcam.flipping}
              onClick={() => void webcam.flip()}
              aria-label={t('Flip camera')}
              title={t('Flip camera')}
            >
              <FlipCameraIcon />
            </button>
          ) : null}
        </div>
      </div>
      <div className="photo-actions">
        <button type="button" className="photo-btn" disabled={disabled} onClick={() => void onTakePhoto()}>
          <CameraActionIcon />
          {webcam.live ? t('Capture photo') : takeLabel}
        </button>
        <button type="button" className="photo-btn" disabled={disabled} onClick={onUpload}>
          <UploadActionIcon />
          {uploadLabel}
        </button>
      </div>
      {webcam.error ? <p className="field-error">{t(webcam.error)}</p> : null}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture={webcam.facing === 'user' ? 'user' : 'environment'}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
            if (file) {
              if (faceFrame) {
                void cropImageToPortraitFace(file).then(onPickFile).catch(() => onPickFile(file));
              } else {
                void cropImageToDocument(file, page).then(onPickFile).catch(() => onPickFile(file));
              }
            }
          e.target.value = '';
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT_IMAGE_OR_PDF}
        multiple={multiple}
        hidden
        onChange={(e) => {
          if (multiple && onPickFiles) onPickFiles(e.target.files);
          else {
            const file = e.target.files?.[0];
            if (file) onPickFile(file);
          }
          e.target.value = '';
        }}
      />
    </>
  );
}
