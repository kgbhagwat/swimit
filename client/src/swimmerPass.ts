import { tenantPath } from './tenantSession';
import { requestPassPopup } from './passPopupEvents';

export type SwimmerPassDetails = {
  id: number;
  fullName: string;
  contact: string;
  email: string;
  birthdate: string;
  sex: string;
  bloodGroup: string;
  isActive: boolean;
  passType: string;
  duration: string;
  batch: string;
  coach: string;
  passValidUntil: string;
  photoUrl: string | null;
  emergencyName: string;
  emergencyRelation: string;
  emergencyMobile: string;
  parentName: string;
  parentRelation: string;
  parentMobile: string;
  qrCode: string;
  hasPass: boolean;
};

export function idCardUrl(id: number) {
  const path = tenantPath(`/id-card/${id}`);
  if (typeof window === 'undefined') return path;
  return `${window.location.origin}${path}`;
}

export function isPassPopupWindow() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('popup') === '1' || Boolean(window.opener);
}

/** Opens Pass QR / Pass as an in-page popup (not a new browser tab). */
export function openPassPopup(kind: 'qr' | 'pass', id: number) {
  requestPassPopup(kind, id);
}

export function formatDisplayDate(value: string) {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export async function fetchSwimmerPass(id: number): Promise<SwimmerPassDetails> {
  const res = await fetch(`/api/registrations/${id}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? 'Failed to load pass');
  return body as SwimmerPassDetails;
}
