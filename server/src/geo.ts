/** Earth-mean radius in km (WGS84 approximation). */
const EARTH_RADIUS_KM = 6371;

/** How long an approved remote login stays valid for repeat logins. */
export const REMOTE_ACCESS_GRANT_HOURS = 24;
export const LOGIN_RADIUS_MIN_KM = 1;
export const LOGIN_RADIUS_MAX_KM = 500;

/** Per-user allowed auto-login distance from the pool (km). */
export type LoginGeoPolicy = {
  radiusKm: number;
};

export function parseLoginRadiusKm(value: unknown): number | null {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const n = Number(String(value).trim());
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < LOGIN_RADIUS_MIN_KM || rounded > LOGIN_RADIUS_MAX_KM) return null;
  return rounded;
}

export function parseLoginGeoPolicy(input: {
  loginRadiusKm?: unknown;
}): { ok: true; policy: LoginGeoPolicy } | { ok: false; error: string } {
  const radiusKm = parseLoginRadiusKm(input.loginRadiusKm);
  if (radiusKm == null) {
    return {
      ok: false,
      error: `Enter allowed login distance between ${LOGIN_RADIUS_MIN_KM} and ${LOGIN_RADIUS_MAX_KM} km`,
    };
  }
  return {
    ok: true,
    policy: { radiusKm },
  };
}

export function loginGeoFromRow(row: {
  login_geo_mode?: unknown;
  login_radius_km?: unknown;
}): LoginGeoPolicy | null {
  const radiusKm = parseLoginRadiusKm(row.login_radius_km);
  if (radiusKm == null) return null;
  return { radiusKm };
}

export function parseCoordinate(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) return null;
  return n;
}

export function isValidLatLng(
  lat: number | null,
  lng: number | null,
): lat is number {
  if (lat == null || lng == null) return false;
  if (lng < -180 || lng > 180) return false;
  return lat >= -90 && lat <= 90;
}

/** Narrow both coordinates after a successful isValidLatLng check. */
export function asLatLng(
  lat: number | null,
  lng: number | null,
): { lat: number; lng: number } | null {
  if (!isValidLatLng(lat, lng) || lng == null) return null;
  return { lat, lng };
}

/** Great-circle distance in kilometers. */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
