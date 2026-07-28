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
  if (typeof window === 'undefined') return `/id-card/${id}`;
  return `${window.location.origin}/id-card/${id}`;
}

export function isPassPopupWindow() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('popup') === '1' || Boolean(window.opener);
}

export function openPassPopup(kind: 'qr' | 'pass', id: number) {
  const path = kind === 'qr' ? `/pass/${id}?popup=1` : `/id-card/${id}?popup=1`;
  const width = kind === 'qr' ? 380 : 540;
  const height = kind === 'qr' ? 460 : 680;
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
  const features = [
    'popup=yes',
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    'resizable=yes',
    'scrollbars=yes',
  ].join(',');
  const popup = window.open(path, `swimIT-${kind}-${id}`, features);
  popup?.focus();
  return popup;
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
