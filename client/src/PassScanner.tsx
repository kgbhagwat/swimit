import { FormEvent, useEffect, useRef, useState } from 'react';
import type { Html5Qrcode } from 'html5-qrcode';
import { IdCard, fetchPoolBrand, type PoolBrand } from './IdCard';
import { useT } from './i18n';
import { PlatformPage } from './PlatformPage';
import { FlipCameraIcon } from './PhotoActionIcons';

type ScannedSwimmer = {
  id: number;
  fullName: string;
  contact: string;
  email: string;
  isActive: boolean;
  passType: string;
  duration: string;
  batch: string;
  coach: string;
  passValidUntil: string;
  birthdate: string;
  sex: string;
  bloodGroup: string;
  emergencyName: string;
  emergencyMobile: string;
  hasValidPassToday: boolean;
  photoUrl: string | null;
  alreadyMarkedToday: boolean;
  qrCode: string;
  verificationMode?: 'ok_not_ok' | 'face';
};

type View = 'idle' | 'scanning' | 'preview' | 'done';

const emptyBrand: PoolBrand = { poolName: '', poolAddress: '', poolLogoUrl: null };

export function PassScanner() {
  const t = useT();
  const [view, setView] = useState<View>('idle');
  const [swimmer, setSwimmer] = useState<ScannedSwimmer | null>(null);
  const [brand, setBrand] = useState<PoolBrand>(emptyBrand);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [passNo, setPassNo] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [faceVerified, setFaceVerified] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handlingRef = useRef(false);
  const cameraFacingRef = useRef<'user' | 'environment'>('environment');
  const [flippingCamera, setFlippingCamera] = useState(false);
  const scannerElementId = 'pass-qr-reader';

  useEffect(() => {
    let cancelled = false;
    void fetchPoolBrand().then((poolBrand) => {
      if (!cancelled) setBrand(poolBrand);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function stopScanner() {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      if (scanner.isScanning) {
        await scanner.stop();
      }
      scanner.clear();
    } catch {
      // ignore stop errors when camera already closed
    }
    scannerRef.current = null;
  }

  async function lookupCode(code: string, fallbackView: View = 'idle') {
    if (handlingRef.current) return;
    handlingRef.current = true;
    setLookingUp(true);
    setError('');
    setInfo('');
    try {
      await stopScanner();
      const res = await fetch(`/api/pass-scan/lookup?code=${encodeURIComponent(code)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Lookup failed');
      setSwimmer(body as ScannedSwimmer);
      setFaceVerified(false);
      setView('preview');
    } catch (err) {
      setSwimmer(null);
      setError(err instanceof Error ? err.message : 'Lookup failed');
      setView(fallbackView);
    } finally {
      setLookingUp(false);
      handlingRef.current = false;
    }
  }

  async function openQrCamera(facing: 'user' | 'environment') {
    await stopScanner();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const { Html5Qrcode } = await import('html5-qrcode');
    const scanner = new Html5Qrcode(scannerElementId);
    scannerRef.current = scanner;
    await scanner.start(
      { facingMode: facing },
      { fps: 8, qrbox: { width: 240, height: 240 } },
      (decoded) => {
        void lookupCode(decoded, 'scanning');
      },
      () => undefined,
    );
    cameraFacingRef.current = facing;
  }

  async function startScanner() {
    setError('');
    setInfo('');
    setSwimmer(null);
    cameraFacingRef.current = 'environment';
    setView('scanning');
    await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      await openQrCamera('environment');
    } catch {
      setView('idle');
      setError('Unable to open camera for QR scanning');
      await stopScanner();
    }
  }

  async function flipScannerCamera() {
    if (flippingCamera) return;
    const next: 'user' | 'environment' = cameraFacingRef.current === 'user' ? 'environment' : 'user';
    setFlippingCamera(true);
    setError('');
    try {
      await openQrCamera(next);
    } catch {
      try {
        await openQrCamera(cameraFacingRef.current);
        setError('Could not switch camera.');
      } catch {
        setView('idle');
        setError('Unable to open camera for QR scanning');
        await stopScanner();
      }
    } finally {
      setFlippingCamera(false);
    }
  }

  async function onPassNoSubmit(e: FormEvent) {
    e.preventDefault();
    const code = passNo.trim();
    if (!code) {
      setError('Enter Pass No.');
      return;
    }
    await lookupCode(code, 'idle');
  }

  async function onConfirmAttendance() {
    if (!swimmer) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/pass-scan/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationId: swimmer.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Failed to mark attendance');
      setInfo(body.message ?? 'Attendance marked for today');
      setView('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark attendance');
    } finally {
      setSaving(false);
    }
  }

  function onReset() {
    void stopScanner();
    setView('idle');
    setSwimmer(null);
    setPassNo('');
    setFaceVerified(false);
    setFlippingCamera(false);
    cameraFacingRef.current = 'environment';
    setError('');
    setInfo('');
    handlingRef.current = false;
  }

  useEffect(() => {
    return () => {
      void stopScanner();
    };
  }, []);

  const needsFaceCheck = swimmer?.verificationMode === 'face';
  const canMark = Boolean(
    swimmer &&
      swimmer.isActive &&
      swimmer.hasValidPassToday &&
      !swimmer.alreadyMarkedToday &&
      (!needsFaceCheck || faceVerified),
  );

  const attendanceStatus = !swimmer
    ? ''
    : !swimmer.isActive
      ? t('Inactive')
      : !swimmer.hasValidPassToday
        ? t('Pass not valid today')
        : swimmer.alreadyMarkedToday
          ? t('Already marked for this batch')
          : t('Ready for attendance');

  return (
    <PlatformPage title="Pass Scanner">
      <div className="pass-form-card pool-core-form">
        {view === 'idle' ? (
          <section className="scanner-panel">
            <div className="scanner-entry">
              <button type="button" className="scanner-start-btn" onClick={() => void startScanner()}>
                {t('Start QR scanner')}
              </button>
              <span className="scanner-or" aria-hidden>
                {t('OR')}
              </span>
              <form className="scanner-pass-form" onSubmit={(e) => void onPassNoSubmit(e)}>
                <label className="scanner-pass-field">
                  <input
                    value={passNo}
                    onChange={(e) => setPassNo(e.target.value)}
                    placeholder={t('Pass No.')}
                    inputMode="numeric"
                    autoComplete="off"
                    aria-label={t('Pass No.')}
                  />
                </label>
                <button type="submit" className="scanner-ok-btn" disabled={lookingUp}>
                  {lookingUp ? '…' : t('OK')}
                </button>
              </form>
            </div>
          </section>
        ) : null}

        {view === 'scanning' ? (
          <section className="scanner-panel">
            <div className="scanner-viewport-wrap">
              <div id={scannerElementId} className="scanner-viewport" />
              <button
                type="button"
                className="webcam-flip-btn"
                disabled={flippingCamera || lookingUp}
                onClick={() => void flipScannerCamera()}
                aria-label={t('Flip camera')}
                title={t('Flip camera')}
              >
                <FlipCameraIcon />
              </button>
            </div>
            {lookingUp ? <p className="scanner-hint">{t('Looking up swimmer…')}</p> : null}
            <p className="scanner-hint">
              {flippingCamera
                ? t('Switching camera…')
                : t('Point the camera at the swimmer QR code on their pass.')}
            </p>
            <div className="webcam-capture-toolbar">
              <button
                type="button"
                className="photo-btn webcam-flip-text-btn"
                disabled={flippingCamera || lookingUp}
                onClick={() => void flipScannerCamera()}
              >
                <FlipCameraIcon />
                {t('Flip camera')}
              </button>
              <button type="button" className="pass-cancel" onClick={onReset}>
                {t('Cancel')}
              </button>
            </div>
          </section>
        ) : null}

        {view === 'preview' && swimmer ? (
          <section className="scanner-preview scanner-id-preview">
            <div
              className={`scanner-pass-wrap${
                swimmer.alreadyMarkedToday ? ' is-already-marked' : ''
              }`}
            >
              <IdCard
                data={{
                  id: swimmer.id,
                  fullName: swimmer.fullName,
                  photoUrl: swimmer.photoUrl,
                  passType: swimmer.passType,
                  duration: swimmer.duration,
                  batch: swimmer.batch,
                  coach: swimmer.coach,
                  passValidUntil: swimmer.passValidUntil,
                  poolName: brand.poolName,
                  poolAddress: brand.poolAddress,
                  poolLogoUrl: brand.poolLogoUrl,
                }}
              />
              {swimmer.alreadyMarkedToday ? (
                <div className="scanner-already-marked-line" aria-hidden>
                  <span>{t('Attendance already marked for this batch')}</span>
                </div>
              ) : null}
            </div>
            <p
              className={`scanner-attendance-status${
                swimmer.alreadyMarkedToday ? ' is-already-marked' : ''
              }`}
            >
              <strong>{t('Attendance')}:</strong> {attendanceStatus}
            </p>
            {needsFaceCheck ? (
              <label className="scanner-face-check">
                <input
                  type="checkbox"
                  checked={faceVerified}
                  disabled={
                    !swimmer.isActive ||
                    !swimmer.hasValidPassToday ||
                    swimmer.alreadyMarkedToday
                  }
                  onChange={(e) => setFaceVerified(e.target.checked)}
                />
                <span>{t('Face matches the pass photo')}</span>
              </label>
            ) : null}
            <div className="pass-form-actions">
              <button type="button" className="pass-cancel" onClick={onReset}>
                {t('Cancel')}
              </button>
              <button
                type="button"
                className="scanner-ok-btn"
                disabled={saving || !canMark}
                onClick={() => void onConfirmAttendance()}
              >
                {saving ? t('Saving…') : t('OK')}
              </button>
            </div>
          </section>
        ) : null}

        {view === 'done' && swimmer ? (
          <section className="scanner-done">
            <p className="success">{info ? t(info) : t('Attendance registered.')}</p>
            <p className="scanner-hint">{swimmer.fullName}</p>
            <div className="pass-form-actions">
              <button type="button" className="scanner-start-btn" onClick={onReset}>
                {t('Next')}
              </button>
            </div>
          </section>
        ) : null}

        {error ? <p className="error">{t(error)}</p> : null}
      </div>
    </PlatformPage>
  );
}
