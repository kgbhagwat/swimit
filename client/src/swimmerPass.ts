import { isApplicationDemo } from './applicationDemo';
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

function endOfMonthIso() {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const y = end.getFullYear();
  const m = String(end.getMonth() + 1).padStart(2, '0');
  const d = String(end.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Sample swimmer passes for Application (no-account) preview. */
const SAMPLE_PASSES: Record<number, SwimmerPassDetails> = {
  [-101]: {
    id: -101,
    fullName: 'Aarav Patil',
    contact: '9876543210',
    email: 'aarav@example.com',
    birthdate: '2005-06-15',
    sex: 'Male',
    bloodGroup: 'B+',
    isActive: true,
    passType: 'Monthly Swim',
    duration: '1 Month',
    batch: 'Morning A — Mixed — 06:00 to 07:00',
    coach: 'Riya Kulkarni',
    passValidUntil: endOfMonthIso(),
    photoUrl: null,
    emergencyName: 'Parent / Guardian',
    emergencyRelation: 'Parent',
    emergencyMobile: '9876543210',
    parentName: 'Parent / Guardian',
    parentRelation: 'Parent',
    parentMobile: '9876543210',
    qrCode: 'SWIMIT:-101',
    hasPass: true,
  },
  [-102]: {
    id: -102,
    fullName: 'Sana Joshi',
    contact: '9123456780',
    email: 'sana@example.com',
    birthdate: '2008-03-22',
    sex: 'Female',
    bloodGroup: 'O+',
    isActive: true,
    passType: 'Quarterly Swim',
    duration: '3 Months',
    batch: 'Evening B — Mixed — 18:00 to 19:00',
    coach: 'Amit Sharma',
    passValidUntil: endOfMonthIso(),
    photoUrl: null,
    emergencyName: 'Parent / Guardian',
    emergencyRelation: 'Parent',
    emergencyMobile: '9123456780',
    parentName: 'Parent / Guardian',
    parentRelation: 'Parent',
    parentMobile: '9123456780',
    qrCode: 'SWIMIT:-102',
    hasPass: true,
  },
  [-103]: {
    id: -103,
    fullName: 'Vihaan Kulkarni',
    contact: '9988776655',
    email: 'vihaan@example.com',
    birthdate: '2010-11-08',
    sex: 'Male',
    bloodGroup: 'A+',
    isActive: true,
    passType: 'Monthly Swim',
    duration: '1 Month',
    batch: 'Morning A — Mixed — 06:00 to 07:00',
    coach: 'Riya Kulkarni',
    passValidUntil: endOfMonthIso(),
    photoUrl: null,
    emergencyName: 'Parent / Guardian',
    emergencyRelation: 'Parent',
    emergencyMobile: '9988776655',
    parentName: 'Parent / Guardian',
    parentRelation: 'Parent',
    parentMobile: '9988776655',
    qrCode: 'SWIMIT:-103',
    hasPass: true,
  },
  [-104]: {
    id: -104,
    fullName: 'Neha Deshmukh',
    contact: '9090909090',
    email: 'neha@example.com',
    birthdate: '2006-01-30',
    sex: 'Female',
    bloodGroup: 'AB+',
    isActive: false,
    passType: 'Monthly Swim',
    duration: '1 Month',
    batch: 'Evening B — Mixed — 18:00 to 19:00',
    coach: 'Amit Sharma',
    passValidUntil: endOfMonthIso(),
    photoUrl: null,
    emergencyName: 'Parent / Guardian',
    emergencyRelation: 'Parent',
    emergencyMobile: '9090909090',
    parentName: 'Parent / Guardian',
    parentRelation: 'Parent',
    parentMobile: '9090909090',
    qrCode: 'SWIMIT:-104',
    hasPass: true,
  },
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

/** Opens Pass QR / Pass / invoices as an in-page popup (not a new browser tab). */
export function openPassPopup(kind: 'qr' | 'pass' | 'invoice', id: number) {
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
  if (isApplicationDemo() && id < 0) {
    const sample = SAMPLE_PASSES[id];
    if (sample) return { ...sample, passValidUntil: endOfMonthIso() };
    throw new Error('Sample pass not found');
  }
  const res = await fetch(`/api/registrations/${id}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? 'Failed to load pass');
  return body as SwimmerPassDetails;
}
