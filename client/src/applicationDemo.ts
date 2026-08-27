/** Ephemeral Application preview: try the app UI; data is discarded when you leave a page. */

export const APPLICATION_FEATURE_PATHS = new Set([
  '/register',
  '/staff-register',
  '/user-management',
  '/create-user',
  '/batches',
  '/pass-types',
  '/coaches',
  '/swimmers',
  '/pass-payment',
  '/whatsapp',
  '/pool-expenses',
  '/water-quality',
  '/swimmer-progress',
  '/progress-trend',
  '/pass-scanner',
  '/coach-payment',
  '/attendance-sheet',
  '/dashboard',
  '/balance-sheet',
  '/payment-details',
  '/pool-core-info',
  '/pool-website',
  '/form-info',
  '/holiday-management',
  '/menu',
]);
const DEMO_FLAG_KEY = 'swimIT.applicationDemo';
const DEMO_DATA_KEY = 'swimIT.applicationDemoData.v3';
const SAMPLE_PASS_PAYMENT_QUEUE_KEY = 'swimIT.applicationDemo.passPaymentQueue';
const SAMPLE_SWIMMER_PAID_KEY = 'swimIT.applicationDemo.swimmerPaid';

export type DemoStore = {
  nextId: number;
  batches: {
    schedules: Array<{
      id: string;
      batchMinutes: number;
      breakMinutes: number;
      firstStart: string;
      lastEnd: string;
    }>;
    slots: Array<{
      id: string;
      name: string;
      type: string;
      startTime: string;
      endTime: string;
    }>;
  };
  passTypes: Array<Record<string, unknown>>;
  registrations: Array<Record<string, unknown>>;
  staffRegistrations: Array<Record<string, unknown>>;
  users: Array<Record<string, unknown>>;
  sessionTimeoutMinutes?: number;
  poolCoreInfo: Record<string, unknown>;
  poolWebsite: {
    about: string;
    history: string;
    openingHours: string;
    facilities: string;
    batchesText: string;
    coachesText: string;
    achievements: Array<{ title: string; detail: string }>;
    bannerPhotoUrl: string | null;
    historyPhotoUrl: string | null;
    infoPhotoUrl: string | null;
    batchesPhotoUrl: string | null;
    coachesPhotoUrl: string | null;
    achievementsPhotoUrl: string | null;
    themeColor: string;
  };
  formInfo: {
    swimmer: Record<string, boolean>;
    staff: Record<string, boolean>;
  };
  holidaysWeekly: string[];
  holidays: Array<Record<string, unknown>>;
  expenses: Array<Record<string, unknown>>;
  waterQuality: Array<Record<string, unknown>>;
  swimmerProgress: Array<Record<string, unknown>>;
  attendance: Array<Record<string, unknown>>;
  auditLogs: Array<Record<string, unknown>>;
};

function emptyStore(): DemoStore {
  return {
    nextId: 1,
    batches: {
      schedules: [],
      slots: [],
    },
    passTypes: [],
    registrations: [],
    staffRegistrations: [],
    users: [],
    sessionTimeoutMinutes: 30,
    poolCoreInfo: {
      poolName: '',
      poolAddress: '',
      poolState: '',
      poolDistrict: '',
      pinCode: '',
      poolLogoPath: null,
      swimmerTerms: '', // TermsModal / Core Info fill language defaults when empty
      staffTerms: '',
      paymentQrPath: null,
      upiDetails: '',
      paymentAcceptCash: false,
      paymentAcceptOnline: false,
      setupCompleted: false,
      updatedAt: new Date().toISOString(),
    },
    poolWebsite: {
      about: '',
      history: '',
      openingHours: '',
      facilities: '',
      batchesText: '',
      coachesText: '',
      achievements: [],
      bannerPhotoUrl: null,
      historyPhotoUrl: null,
      infoPhotoUrl: null,
      batchesPhotoUrl: null,
      coachesPhotoUrl: null,
      achievementsPhotoUrl: null,
      themeColor: '#1e88c8',
    },
    formInfo: {
      swimmer: {},
      staff: {},
    },
    holidaysWeekly: [],
    holidays: [],
    expenses: [],
    waterQuality: [],
    swimmerProgress: [],
    attendance: [],
    auditLogs: [],
  };
}

function isFeaturePath(path: string) {
  if (APPLICATION_FEATURE_PATHS.has(path)) return true;
  if (/^\/staff-register\/[^/]+$/.test(path)) return true;
  if (/^\/pass\/[^/]+$/.test(path)) return true;
  if (/^\/id-card\/[^/]+$/.test(path)) return true;
  return false;
}

export function isApplicationDemoPath(pathname: string) {
  if (pathname === '/application') return true;
  if (pathname.startsWith('/application/')) {
    const rest = pathname.slice('/application'.length);
    return isFeaturePath(rest);
  }
  // Legacy root feature paths (redirect targets may still hit briefly)
  return isFeaturePath(pathname);
}

export function isApplicationDemo() {
  return sessionStorage.getItem(DEMO_FLAG_KEY) === '1';
}

export function enterApplicationDemo() {
  sessionStorage.setItem(DEMO_FLAG_KEY, '1');
  // Application preview never keeps durable data — always start empty.
  sessionStorage.setItem(DEMO_DATA_KEY, JSON.stringify(emptyStore()));
  sessionStorage.removeItem('swimIT.applicationDemoData');
  sessionStorage.removeItem('swimIT.applicationDemoData.v2');
  sessionStorage.removeItem(SAMPLE_PASS_PAYMENT_QUEUE_KEY);
  sessionStorage.removeItem(SAMPLE_SWIMMER_PAID_KEY);
}

/** Wipe preview data (e.g. when navigating between Application pages). */
export function resetApplicationDemoData() {
  if (!isApplicationDemo()) return;
  sessionStorage.setItem(DEMO_DATA_KEY, JSON.stringify(emptyStore()));
}

export function exitApplicationDemo() {
  sessionStorage.removeItem(DEMO_FLAG_KEY);
  sessionStorage.removeItem(DEMO_DATA_KEY);
  sessionStorage.removeItem(SAMPLE_PASS_PAYMENT_QUEUE_KEY);
  sessionStorage.removeItem(SAMPLE_SWIMMER_PAID_KEY);
}

export type SamplePassPaymentItem = {
  id: number;
  fullName: string;
  contact: string;
  email: string;
  passType: string;
  coach: string;
  batch: string;
};

export function getSamplePassPaymentQueue(): SamplePassPaymentItem[] {
  try {
    const raw = sessionStorage.getItem(SAMPLE_PASS_PAYMENT_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SamplePassPaymentItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function enqueueSamplePassPayment(item: SamplePassPaymentItem) {
  const queue = getSamplePassPaymentQueue().filter((row) => row.id !== item.id);
  queue.unshift(item);
  sessionStorage.setItem(SAMPLE_PASS_PAYMENT_QUEUE_KEY, JSON.stringify(queue));
}

export function dequeueSamplePassPayment(id: number) {
  const queue = getSamplePassPaymentQueue().filter((row) => row.id !== id);
  sessionStorage.setItem(SAMPLE_PASS_PAYMENT_QUEUE_KEY, JSON.stringify(queue));
}

/** Fresh Application preview for Swimmer List — discard trial queue/paid overrides. */
export function resetSampleSwimmerPreview() {
  sessionStorage.removeItem(SAMPLE_PASS_PAYMENT_QUEUE_KEY);
  sessionStorage.removeItem(SAMPLE_SWIMMER_PAID_KEY);
}

export type SampleSwimmerPaidOverride = {
  id: number;
  passType: string;
  passValidUntil: string;
};

export function getSampleSwimmerPaidOverrides(): SampleSwimmerPaidOverride[] {
  try {
    const raw = sessionStorage.getItem(SAMPLE_SWIMMER_PAID_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SampleSwimmerPaidOverride[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function markSampleSwimmerPaid(id: number, passType: string) {
  const end = new Date();
  end.setDate(end.getDate() + 30);
  const passValidUntil = end.toISOString().slice(0, 10);
  const next = getSampleSwimmerPaidOverrides().filter((row) => row.id !== id);
  next.push({ id, passType: passType || 'Monthly Swim', passValidUntil });
  sessionStorage.setItem(SAMPLE_SWIMMER_PAID_KEY, JSON.stringify(next));
  dequeueSamplePassPayment(id);
}

export function readDemoStore(): DemoStore {
  try {
    const raw = sessionStorage.getItem(DEMO_DATA_KEY);
    if (!raw) {
      const fresh = emptyStore();
      writeDemoStore(fresh);
      return fresh;
    }
    const parsed = JSON.parse(raw) as DemoStore;
    if (!Array.isArray(parsed.auditLogs)) parsed.auditLogs = [];
    if (!parsed.poolWebsite) {
      parsed.poolWebsite = emptyStore().poolWebsite;
    } else {
      if (!parsed.poolWebsite.history) parsed.poolWebsite.history = '';
      parsed.poolWebsite.bannerPhotoUrl ??= null;
      parsed.poolWebsite.historyPhotoUrl ??= null;
      parsed.poolWebsite.infoPhotoUrl ??= null;
      parsed.poolWebsite.batchesPhotoUrl ??= null;
      parsed.poolWebsite.coachesPhotoUrl ??= null;
      parsed.poolWebsite.achievementsPhotoUrl ??= null;
      parsed.poolWebsite.themeColor ??= '#1e88c8';
    }
    if (!parsed.formInfo) {
      parsed.formInfo = emptyStore().formInfo;
    }
    return parsed;
  } catch {
    const fresh = emptyStore();
    writeDemoStore(fresh);
    return fresh;
  }
}

export function writeDemoStore(store: DemoStore) {
  sessionStorage.setItem(DEMO_DATA_KEY, JSON.stringify(store));
}

export function allocDemoId(store: DemoStore) {
  const id = store.nextId;
  store.nextId += 1;
  return id;
}

export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
