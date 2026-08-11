export type LoginGeoFix = {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
};

/** Best-effort browser geolocation for login geofencing. Never throws. */
export async function captureLoginLocation(timeoutMs = 12000): Promise<LoginGeoFix | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: LoginGeoFix | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(timer);
        finish({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyM:
            typeof pos.coords.accuracy === 'number' && Number.isFinite(pos.coords.accuracy)
              ? pos.coords.accuracy
              : null,
        });
      },
      () => {
        window.clearTimeout(timer);
        finish(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}

export type RemoteAccessPending = {
  requestId: number;
  statusToken: string;
  distanceKm: number | null;
  thresholdKm: number;
  message: string;
};

export function parseRemoteAccessRequired(body: Record<string, unknown>): RemoteAccessPending | null {
  if (String(body.code ?? '') !== 'REMOTE_ACCESS_REQUIRED') return null;
  const requestId = Number(body.requestId);
  const statusToken = String(body.statusToken ?? '').trim();
  if (!Number.isFinite(requestId) || requestId <= 0 || !statusToken) return null;
  return {
    requestId,
    statusToken,
    distanceKm:
      body.distanceKm == null || body.distanceKm === ''
        ? null
        : Number(body.distanceKm),
    thresholdKm: Number(body.thresholdKm ?? 20) || 20,
    message: String(
      body.error ||
        'You are signing in far from the pool. An admin must approve remote access before you can continue.',
    ),
  };
}

export class RemoteAccessRequiredError extends Error {
  pending: RemoteAccessPending;
  constructor(pending: RemoteAccessPending) {
    super(pending.message);
    this.name = 'RemoteAccessRequiredError';
    this.pending = pending;
  }
}
