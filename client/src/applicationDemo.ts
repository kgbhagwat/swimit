/** Ephemeral Application preview: try the app UI; data is discarded when you leave. */

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
  '/pass-scanner',
  '/coach-payment',
  '/attendance-sheet',
  '/balance-sheet',
  '/pool-core-info',
  '/holiday-management',
]);

const DEMO_FLAG_KEY = 'swimIT.applicationDemo';
const DEMO_DATA_KEY = 'swimIT.applicationDemoData';

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
  poolCoreInfo: Record<string, unknown>;
  holidaysWeekly: string[];
  holidays: Array<Record<string, unknown>>;
  expenses: Array<Record<string, unknown>>;
  attendance: Array<Record<string, unknown>>;
};

function emptyStore(): DemoStore {
  return {
    nextId: 1,
    batches: {
      schedules: [
        {
          id: 'default',
          batchMinutes: 60,
          breakMinutes: 15,
          firstStart: '06:00',
          lastEnd: '20:00',
        },
      ],
      slots: [],
    },
    passTypes: [],
    registrations: [],
    staffRegistrations: [],
    users: [],
    poolCoreInfo: {
      poolName: 'Demo Pool',
      poolAddress: 'Try me — data is not saved after you leave Application',
      poolLogoPath: null,
      swimmerTerms: '',
      staffTerms: '',
      paymentQrPath: null,
      upiDetails: '',
      paymentAcceptCash: true,
      paymentAcceptOnline: true,
      updatedAt: new Date().toISOString(),
    },
    holidaysWeekly: [],
    holidays: [],
    expenses: [],
    attendance: [],
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
  if (!sessionStorage.getItem(DEMO_DATA_KEY)) {
    sessionStorage.setItem(DEMO_DATA_KEY, JSON.stringify(emptyStore()));
  }
}

export function exitApplicationDemo() {
  sessionStorage.removeItem(DEMO_FLAG_KEY);
  sessionStorage.removeItem(DEMO_DATA_KEY);
}

export function readDemoStore(): DemoStore {
  try {
    const raw = sessionStorage.getItem(DEMO_DATA_KEY);
    if (!raw) {
      const fresh = emptyStore();
      writeDemoStore(fresh);
      return fresh;
    }
    return JSON.parse(raw) as DemoStore;
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
