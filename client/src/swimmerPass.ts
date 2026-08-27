import { isApplicationDemo } from './applicationDemo';
import { tenantPath } from './tenantSession';
import { requestPassPopup, type PassPopupCard } from './passPopupEvents';

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
  [-105]: {
    id: -105,
    fullName: 'Rohan Mehta',
    contact: '9012345678',
    email: 'rohan@example.com',
    birthdate: '2004-08-19',
    sex: 'Male',
    bloodGroup: 'O+',
    isActive: false,
    passType: 'Monthly Swim',
    duration: '1 Month',
    batch: 'Morning A — Mixed — 06:00 to 07:00',
    coach: 'Riya Kulkarni',
    passValidUntil: endOfMonthIso(),
    photoUrl: null,
    emergencyName: 'Parent / Guardian',
    emergencyRelation: 'Parent',
    emergencyMobile: '9012345678',
    parentName: 'Parent / Guardian',
    parentRelation: 'Parent',
    parentMobile: '9012345678',
    qrCode: 'SWIMIT:-105',
    hasPass: true,
  },
  [-106]: {
    id: -106,
    fullName: 'Isha Nair',
    contact: '9090909091',
    email: 'isha@example.com',
    birthdate: '2007-12-02',
    sex: 'Female',
    bloodGroup: 'B+',
    isActive: false,
    passType: 'Quarterly Swim',
    duration: '3 Months',
    batch: 'Evening B — Mixed — 18:00 to 19:00',
    coach: 'Amit Sharma',
    passValidUntil: endOfMonthIso(),
    photoUrl: null,
    emergencyName: 'Parent / Guardian',
    emergencyRelation: 'Parent',
    emergencyMobile: '9090909091',
    parentName: 'Parent / Guardian',
    parentRelation: 'Parent',
    parentMobile: '9090909091',
    qrCode: 'SWIMIT:-106',
    hasPass: true,
  },
  [-107]: {
    id: -107,
    fullName: 'Kabir Shah',
    contact: '9123456781',
    email: 'kabir@example.com',
    birthdate: '2009-05-14',
    sex: 'Male',
    bloodGroup: 'A+',
    isActive: false,
    passType: 'Monthly Swim',
    duration: '1 Month',
    batch: 'Morning A — Mixed — 06:00 to 07:00',
    coach: 'Neha Deshmukh',
    passValidUntil: endOfMonthIso(),
    photoUrl: null,
    emergencyName: 'Parent / Guardian',
    emergencyRelation: 'Parent',
    emergencyMobile: '9123456781',
    parentName: 'Parent / Guardian',
    parentRelation: 'Parent',
    parentMobile: '9123456781',
    qrCode: 'SWIMIT:-107',
    hasPass: true,
  },
};

/** Pass Payment sample queue uses -1 / -2; Swimmer List uses -101… */
const SAMPLE_PASS_ALIASES: Record<number, number> = {
  [-1]: -101,
  [-2]: -104,
};

const ISSUED_SAMPLE_PASS_PREFIX = 'swimIT.sampleIssuedPass.';

function cloneSamplePass(base: SwimmerPassDetails, id: number, patch?: Partial<SwimmerPassDetails>): SwimmerPassDetails {
  return {
    ...base,
    ...patch,
    id,
    qrCode: `SWIMIT:${id}`,
    hasPass: true,
    passValidUntil: patch?.passValidUntil || endOfMonthIso(),
  };
}

export function passDetailsFromCard(card: PassPopupCard): SwimmerPassDetails {
  return {
    id: card.id,
    fullName: card.fullName,
    contact: '',
    email: '',
    birthdate: '',
    sex: '',
    bloodGroup: '',
    isActive: true,
    passType: card.passType,
    duration: card.duration,
    batch: card.batch,
    coach: card.coach,
    passValidUntil: card.passValidUntil || endOfMonthIso(),
    photoUrl: card.photoUrl,
    emergencyName: '',
    emergencyRelation: '',
    emergencyMobile: '',
    parentName: '',
    parentRelation: '',
    parentMobile: '',
    qrCode: `SWIMIT:${card.id}`,
    hasPass: true,
  };
}

export function rememberSampleIssuedPass(card: PassPopupCard) {
  if (!(card.id < 0)) return;
  try {
    sessionStorage.setItem(ISSUED_SAMPLE_PASS_PREFIX + card.id, JSON.stringify(passDetailsFromCard(card)));
  } catch {
    /* ignore quota */
  }
}

function readSampleIssuedPass(id: number): SwimmerPassDetails | null {
  try {
    const raw = sessionStorage.getItem(ISSUED_SAMPLE_PASS_PREFIX + id);
    return raw ? (JSON.parse(raw) as SwimmerPassDetails) : null;
  } catch {
    return null;
  }
}

function samplePassForId(id: number): SwimmerPassDetails {
  const remembered = readSampleIssuedPass(id);
  if (remembered) return { ...remembered, passValidUntil: remembered.passValidUntil || endOfMonthIso() };

  const direct = SAMPLE_PASSES[id];
  if (direct) return cloneSamplePass(direct, id);

  const aliased = SAMPLE_PASSES[SAMPLE_PASS_ALIASES[id]];
  if (aliased) {
    if (id === -2) {
      return cloneSamplePass(aliased, id, {
        fullName: 'Neha Deshmukh',
        contact: '9123456780',
        email: 'neha@example.com',
        passType: 'Quarterly Swim',
        duration: '3 Months',
        isActive: true,
      });
    }
    return cloneSamplePass(aliased, id);
  }

  return {
    id,
    fullName: 'Sample swimmer',
    contact: '',
    email: '',
    birthdate: '',
    sex: '',
    bloodGroup: '',
    isActive: true,
    passType: 'Monthly Swim',
    duration: '1 Month',
    batch: 'Morning A — Mixed — 06:00 to 07:00',
    coach: 'Riya Kulkarni',
    passValidUntil: endOfMonthIso(),
    photoUrl: null,
    emergencyName: '',
    emergencyRelation: '',
    emergencyMobile: '',
    parentName: '',
    parentRelation: '',
    parentMobile: '',
    qrCode: `SWIMIT:${id}`,
    hasPass: true,
  };
}

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
export function openPassPopup(
  kind: 'qr' | 'pass' | 'invoice',
  id: number,
  options?: { showOk?: boolean; card?: PassPopupCard },
) {
  requestPassPopup(kind, id, options);
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
  if (id < 0) {
    return samplePassForId(id);
  }
  if (isApplicationDemo()) {
    const remembered = readSampleIssuedPass(id);
    if (remembered) return remembered;
  }
  const res = await fetch(`/api/registrations/${id}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? 'Failed to load pass');
  return body as SwimmerPassDetails;
}
