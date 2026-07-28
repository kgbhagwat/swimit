import {
  allocDemoId,
  enterApplicationDemo,
  isApplicationDemo,
  isApplicationDemoPath,
  jsonResponse,
  readDemoStore,
  writeDemoStore,
  type DemoStore,
} from './applicationDemo';

function parseUrl(url: string) {
  try {
    return new URL(url, window.location.origin);
  } catch {
    return null;
  }
}

async function readJsonBody(init?: RequestInit): Promise<Record<string, unknown>> {
  if (!init?.body) return {};
  if (typeof init.body === 'string') {
    try {
      return JSON.parse(init.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (init.body instanceof FormData) {
    const out: Record<string, unknown> = {};
    init.body.forEach((value, key) => {
      if (value instanceof File) {
        out[key] = value.size > 0 ? URL.createObjectURL(value) : null;
        out[`${key}Name`] = value.name;
      } else {
        out[key] = value;
      }
    });
    return out;
  }
  return {};
}

function formString(body: Record<string, unknown>, key: string) {
  return String(body[key] ?? '').trim();
}

function handleBatches(method: string, body: Record<string, unknown>, store: DemoStore) {
  if (method === 'GET') {
    return jsonResponse({
      schedules: store.batches.schedules,
      settings: store.batches.schedules[0],
      slots: store.batches.slots,
    });
  }
  if (method === 'PUT') {
    const schedulesIn = Array.isArray(body.schedules) ? body.schedules : [];
    const slotsIn = Array.isArray(body.slots) ? body.slots : [];
    store.batches.schedules = schedulesIn.map((row, index) => {
      const r = row as Record<string, unknown>;
      return {
        id: String(r.id ?? `s${index + 1}`),
        batchMinutes: Number(r.batchMinutes) || 60,
        breakMinutes: Number(r.breakMinutes) || 0,
        firstStart: String(r.firstStart ?? '06:00').slice(0, 5),
        lastEnd: String(r.lastEnd ?? '20:00').slice(0, 5),
      };
    });
    if (store.batches.schedules.length === 0) {
      store.batches.schedules = [
        {
          id: 'default',
          batchMinutes: 60,
          breakMinutes: 15,
          firstStart: '06:00',
          lastEnd: '20:00',
        },
      ];
    }
    store.batches.slots = slotsIn.map((row, index) => {
      const r = row as Record<string, unknown>;
      return {
        id: String(r.id ?? allocDemoId(store)),
        name: String(r.name ?? `Batch ${index + 1}`),
        type: String(r.type ?? 'Regular'),
        startTime: String(r.startTime ?? '06:00').slice(0, 5),
        endTime: String(r.endTime ?? '07:00').slice(0, 5),
      };
    });
    writeDemoStore(store);
    return jsonResponse({
      schedules: store.batches.schedules,
      settings: store.batches.schedules[0],
      slots: store.batches.slots,
    });
  }
  return jsonResponse({ error: 'Method not allowed' }, 405);
}

function handlePassTypes(
  method: string,
  pathname: string,
  body: Record<string, unknown>,
  store: DemoStore,
) {
  const idMatch = pathname.match(/^\/api\/pass-types\/(\d+)$/);
  if (method === 'GET' && !idMatch) {
    return jsonResponse(store.passTypes);
  }
  if (method === 'POST') {
    const row = {
      id: allocDemoId(store),
      passName: formString(body, 'passName'),
      forAudience: formString(body, 'forAudience'),
      prerequisite: formString(body, 'prerequisite') || 'None',
      duration: formString(body, 'duration'),
      passCharges: Number(body.passCharges) || 0,
      coachingCharges: Number(body.coachingCharges) || 0,
      coach: formString(body, 'coach'),
    };
    store.passTypes.push(row);
    writeDemoStore(store);
    return jsonResponse(row, 201);
  }
  if (idMatch && method === 'PUT') {
    const id = Number(idMatch[1]);
    const idx = store.passTypes.findIndex((r) => Number(r.id) === id);
    if (idx < 0) return jsonResponse({ error: 'Not found' }, 404);
    store.passTypes[idx] = {
      ...store.passTypes[idx],
      passName: formString(body, 'passName'),
      forAudience: formString(body, 'forAudience'),
      prerequisite: formString(body, 'prerequisite') || 'None',
      duration: formString(body, 'duration'),
      passCharges: Number(body.passCharges) || 0,
      coachingCharges: Number(body.coachingCharges) || 0,
      coach: formString(body, 'coach'),
    };
    writeDemoStore(store);
    return jsonResponse(store.passTypes[idx]);
  }
  if (idMatch && method === 'DELETE') {
    const id = Number(idMatch[1]);
    store.passTypes = store.passTypes.filter((r) => Number(r.id) !== id);
    writeDemoStore(store);
    return jsonResponse({ ok: true });
  }
  return jsonResponse({ error: 'Method not allowed' }, 405);
}

function handlePoolCoreInfo(method: string, body: Record<string, unknown>, store: DemoStore) {
  if (method === 'GET') {
    return jsonResponse(store.poolCoreInfo);
  }
  if (method === 'PUT') {
    store.poolCoreInfo = {
      ...store.poolCoreInfo,
      poolName: formString(body, 'poolName') || String(store.poolCoreInfo.poolName ?? ''),
      poolAddress: formString(body, 'poolAddress') || String(store.poolCoreInfo.poolAddress ?? ''),
      swimmerTerms: String(body.swimmerTerms ?? store.poolCoreInfo.swimmerTerms ?? ''),
      staffTerms: String(body.staffTerms ?? store.poolCoreInfo.staffTerms ?? ''),
      upiDetails: formString(body, 'upiDetails'),
      poolLogoPath: body.poolLogo ?? store.poolCoreInfo.poolLogoPath,
      paymentQrPath: body.paymentQr ?? store.poolCoreInfo.paymentQrPath,
      updatedAt: new Date().toISOString(),
    };
    writeDemoStore(store);
    return jsonResponse(store.poolCoreInfo);
  }
  return jsonResponse({ error: 'Method not allowed' }, 405);
}

function handleHolidays(
  method: string,
  pathname: string,
  searchParams: URLSearchParams,
  body: Record<string, unknown>,
  store: DemoStore,
) {
  if (method === 'GET' && pathname === '/api/holidays') {
    const year = Number(searchParams.get('year')) || new Date().getFullYear();
    return jsonResponse({
      year,
      weeklyHolidays: store.holidaysWeekly,
      holidays: store.holidays.filter((h) => {
        const start = String(h.startDate ?? '');
        return start.startsWith(String(year));
      }),
    });
  }
  if (method === 'PUT' && pathname === '/api/holidays/weekly') {
    store.holidaysWeekly = Array.isArray(body.weeklyHolidays)
      ? body.weeklyHolidays.map(String)
      : [];
    writeDemoStore(store);
    return jsonResponse({ weeklyHolidays: store.holidaysWeekly });
  }
  if (method === 'POST' && pathname === '/api/holidays') {
    const row = {
      id: allocDemoId(store),
      holidayType: formString(body, 'holidayType') || 'Special',
      name: formString(body, 'name'),
      startDate: formString(body, 'startDate'),
      endDate: formString(body, 'endDate') || formString(body, 'startDate'),
      notes: formString(body, 'notes'),
      extendPassHolders: Boolean(body.extendPassHolders),
      createdAt: new Date().toISOString(),
    };
    store.holidays.push(row);
    writeDemoStore(store);
    return jsonResponse(row, 201);
  }
  const del = pathname.match(/^\/api\/holidays\/(\d+)$/);
  if (del && method === 'DELETE') {
    const id = Number(del[1]);
    store.holidays = store.holidays.filter((h) => Number(h.id) !== id);
    writeDemoStore(store);
    return jsonResponse({ ok: true });
  }
  return jsonResponse({ error: 'Method not allowed' }, 405);
}

function handleExpenses(
  method: string,
  pathname: string,
  searchParams: URLSearchParams,
  body: Record<string, unknown>,
  store: DemoStore,
) {
  if (method === 'GET' && pathname === '/api/pool-expenses') {
    const month = searchParams.get('month') ?? '';
    const rows = month
      ? store.expenses.filter((e) => String(e.expenseDate ?? '').startsWith(month))
      : store.expenses;
    return jsonResponse(rows);
  }
  if (method === 'POST' && pathname === '/api/pool-expenses') {
    const row = {
      id: allocDemoId(store),
      expenseDate: formString(body, 'expenseDate'),
      description: formString(body, 'description'),
      amount: Number(body.amount) || 0,
      mode: formString(body, 'mode') || 'Cash',
      hasBill: body.hasBill === true || body.hasBill === 'true' || body.hasBill === 'Bill',
    };
    store.expenses.push(row);
    writeDemoStore(store);
    return jsonResponse(row, 201);
  }
  const idMatch = pathname.match(/^\/api\/pool-expenses\/(\d+)$/);
  if (idMatch && method === 'PUT') {
    const id = Number(idMatch[1]);
    const idx = store.expenses.findIndex((e) => Number(e.id) === id);
    if (idx < 0) return jsonResponse({ error: 'Not found' }, 404);
    store.expenses[idx] = {
      ...store.expenses[idx],
      expenseDate: formString(body, 'expenseDate') || String(store.expenses[idx].expenseDate),
      description: formString(body, 'description') || String(store.expenses[idx].description),
      amount: Number(body.amount ?? store.expenses[idx].amount) || 0,
      mode: formString(body, 'mode') || String(store.expenses[idx].mode),
      hasBill: body.hasBill === true || body.hasBill === 'true' || body.hasBill === 'Bill',
    };
    writeDemoStore(store);
    return jsonResponse(store.expenses[idx]);
  }
  if (idMatch && method === 'DELETE') {
    const id = Number(idMatch[1]);
    store.expenses = store.expenses.filter((e) => Number(e.id) !== id);
    writeDemoStore(store);
    return jsonResponse({ ok: true });
  }
  return jsonResponse({ error: 'Method not allowed' }, 405);
}

function handleUsers(method: string, pathname: string, body: Record<string, unknown>, store: DemoStore) {
  if (method === 'GET' && pathname === '/api/users') {
    return jsonResponse(store.users);
  }
  const one = pathname.match(/^\/api\/users\/(\d+)$/);
  if (one && method === 'GET') {
    const user = store.users.find((u) => Number(u.id) === Number(one[1]));
    return user ? jsonResponse(user) : jsonResponse({ error: 'Not found' }, 404);
  }
  if (method === 'POST' && pathname === '/api/users') {
    const row = {
      id: allocDemoId(store),
      userName: formString(body, 'userName'),
      mobile: formString(body, 'mobile'),
      menuAccess: Array.isArray(body.menuAccess) ? body.menuAccess.map(String) : [],
      mustChangePassword: true,
      isAccountAdmin: false,
      saasAccountId: null,
      createdAt: new Date().toISOString(),
    };
    store.users.push(row);
    writeDemoStore(store);
    return jsonResponse(row, 201);
  }
  const pwd = pathname.match(/^\/api\/users\/(\d+)\/password$/);
  if (pwd && method === 'PATCH') {
    return jsonResponse({ ok: true });
  }
  const access = pathname.match(/^\/api\/users\/(\d+)\/access$/);
  if (access && method === 'PATCH') {
    const id = Number(access[1]);
    const idx = store.users.findIndex((u) => Number(u.id) === id);
    if (idx < 0) return jsonResponse({ error: 'Not found' }, 404);
    store.users[idx] = {
      ...store.users[idx],
      menuAccess: Array.isArray(body.menuAccess) ? body.menuAccess.map(String) : [],
    };
    writeDemoStore(store);
    return jsonResponse(store.users[idx]);
  }
  return jsonResponse({ error: 'Method not allowed' }, 405);
}

function handleRegistrations(
  method: string,
  pathname: string,
  body: Record<string, unknown>,
  store: DemoStore,
) {
  if (method === 'GET' && pathname === '/api/registrations') {
    return jsonResponse(store.registrations);
  }
  if (method === 'GET' && pathname === '/api/registrations/pending-payment') {
    return jsonResponse(
      store.registrations.filter((r) => !r.pass_valid_until || r.pending_type),
    );
  }
  const one = pathname.match(/^\/api\/registrations\/(\d+)$/);
  if (one && method === 'GET') {
    const row = store.registrations.find((r) => Number(r.id) === Number(one[1]));
    return row ? jsonResponse(row) : jsonResponse({ error: 'Not found' }, 404);
  }
  if (method === 'POST' && pathname === '/api/registrations') {
    const row = {
      id: allocDemoId(store),
      full_name: formString(body, 'fullName') || formString(body, 'full_name') || 'Demo Swimmer',
      email: formString(body, 'email'),
      whatsapp_mobile: formString(body, 'whatsappMobile') || formString(body, 'whatsapp_mobile'),
      birthdate: formString(body, 'birthdate'),
      sex: formString(body, 'sex'),
      blood_group: formString(body, 'bloodGroup') || formString(body, 'blood_group'),
      is_active: false,
      pass_type: null,
      batch: null,
      coach: null,
      pass_valid_until: null,
      pending_type: 'new',
      created_at: new Date().toISOString(),
      photo_path: body.photo ?? null,
    };
    store.registrations.push(row);
    writeDemoStore(store);
    return jsonResponse(row, 201);
  }
  if (one && method === 'PATCH') {
    const id = Number(one[1]);
    const idx = store.registrations.findIndex((r) => Number(r.id) === id);
    if (idx < 0) return jsonResponse({ error: 'Not found' }, 404);
    store.registrations[idx] = {
      ...store.registrations[idx],
      ...body,
      id,
      is_active: body.is_active ?? body.isActive ?? store.registrations[idx].is_active,
      pass_type: body.pass_type ?? body.passType ?? store.registrations[idx].pass_type,
      batch: body.batch ?? store.registrations[idx].batch,
      coach: body.coach ?? store.registrations[idx].coach,
      pass_valid_until:
        body.pass_valid_until ?? body.passValidUntil ?? store.registrations[idx].pass_valid_until,
      pending_type: body.pending_type ?? null,
    };
    writeDemoStore(store);
    return jsonResponse(store.registrations[idx]);
  }
  return jsonResponse({ error: 'Method not allowed' }, 405);
}

function handleStaff(
  method: string,
  pathname: string,
  body: Record<string, unknown>,
  store: DemoStore,
) {
  if (method === 'GET' && pathname === '/api/staff-registrations') {
    return jsonResponse(store.staffRegistrations);
  }
  const one = pathname.match(/^\/api\/staff-registrations\/(\d+)$/);
  if (one && method === 'GET') {
    const row = store.staffRegistrations.find((r) => Number(r.id) === Number(one[1]));
    return row ? jsonResponse(row) : jsonResponse({ error: 'Not found' }, 404);
  }
  if (method === 'POST' && pathname === '/api/staff-registrations') {
    const row = {
      id: allocDemoId(store),
      registration_for: formString(body, 'registrationFor') || formString(body, 'registration_for') || 'Coach',
      full_name: formString(body, 'fullName') || formString(body, 'full_name') || 'Demo Coach',
      teach_strokes: body.teachStrokes ?? body.teach_strokes ?? [],
      preferred_batches: body.preferredBatches ?? body.preferred_batches ?? [],
      mobile: formString(body, 'mobile') || formString(body, 'whatsappMobile'),
      status: 'Active',
      created_at: new Date().toISOString(),
    };
    store.staffRegistrations.push(row);
    writeDemoStore(store);
    return jsonResponse(row, 201);
  }
  if (one && (method === 'PUT' || method === 'PATCH')) {
    const id = Number(one[1]);
    const idx = store.staffRegistrations.findIndex((r) => Number(r.id) === id);
    if (idx < 0) return jsonResponse({ error: 'Not found' }, 404);
    if (pathname.endsWith('/status')) {
      store.staffRegistrations[idx] = {
        ...store.staffRegistrations[idx],
        status: formString(body, 'status') || String(store.staffRegistrations[idx].status),
      };
    } else {
      store.staffRegistrations[idx] = {
        ...store.staffRegistrations[idx],
        ...body,
        id,
        full_name:
          formString(body, 'fullName') ||
          formString(body, 'full_name') ||
          String(store.staffRegistrations[idx].full_name),
      };
    }
    writeDemoStore(store);
    return jsonResponse(store.staffRegistrations[idx]);
  }
  return jsonResponse({ error: 'Method not allowed' }, 405);
}

function handlePassScan(
  method: string,
  pathname: string,
  searchParams: URLSearchParams,
  body: Record<string, unknown>,
  store: DemoStore,
) {
  if (method === 'GET' && pathname === '/api/pass-scan/lookup') {
    const code = searchParams.get('code') ?? '';
    const numeric = Number(code.replace(/^SWIMIT:/i, ''));
    const swimmer = store.registrations.find(
      (r) =>
        Number(r.id) === numeric ||
        String(r.whatsapp_mobile ?? '') === code ||
        String(r.full_name ?? '').toLowerCase() === code.toLowerCase(),
    );
    if (!swimmer) return jsonResponse({ error: 'Pass not found' }, 404);
    const passValidUntil = String(swimmer.pass_valid_until ?? '');
    return jsonResponse({
      id: Number(swimmer.id),
      fullName: String(swimmer.full_name ?? ''),
      contact: String(swimmer.whatsapp_mobile ?? ''),
      email: String(swimmer.email ?? ''),
      isActive: swimmer.is_active !== false,
      passType: String(swimmer.pass_type ?? ''),
      duration: String(swimmer.duration ?? ''),
      batch: String(swimmer.batch ?? ''),
      coach: String(swimmer.coach ?? ''),
      passValidUntil,
      birthdate: String(swimmer.birthdate ?? ''),
      sex: String(swimmer.sex ?? ''),
      bloodGroup: String(swimmer.blood_group ?? ''),
      emergencyName: String(swimmer.emergency_name ?? ''),
      emergencyMobile: String(swimmer.emergency_mobile ?? ''),
      hasValidPassToday: Boolean(passValidUntil),
      photoUrl: swimmer.photo_path ? String(swimmer.photo_path) : null,
      alreadyMarkedToday: false,
      qrCode: `SWIMIT:${swimmer.id}`,
    });
  }
  if (method === 'POST' && pathname === '/api/pass-scan/attendance') {
    const row = {
      id: allocDemoId(store),
      registrationId: body.registrationId ?? body.registration_id,
      scannedAt: new Date().toISOString(),
    };
    store.attendance.push(row);
    writeDemoStore(store);
    return jsonResponse({ ok: true, attendance: row });
  }
  return jsonResponse({ error: 'Method not allowed' }, 405);
}

/** Intercept tenant APIs while Application demo mode is active. */
export async function handleDemoApiRequest(
  url: string,
  init?: RequestInit,
): Promise<Response | null> {
  // Sync demo flag from URL so the first fetch on a page works before React effects run
  if (isApplicationDemoPath(window.location.pathname)) {
    if (!isApplicationDemo()) enterApplicationDemo();
  } else if (isApplicationDemo()) {
    // Real tenant or platform pages should not use the sandbox
    return null;
  }

  if (!isApplicationDemo()) return null;

  const parsed = parseUrl(url);
  if (!parsed || !parsed.pathname.startsWith('/api/')) return null;

  // Platform APIs still hit the real server
  if (
    parsed.pathname.startsWith('/api/saas-accounts') ||
    parsed.pathname.startsWith('/api/service-packages') ||
    parsed.pathname.startsWith('/api/health')
  ) {
    return null;
  }

  const method = (init?.method ?? 'GET').toUpperCase();
  const body = await readJsonBody(init);
  const store = readDemoStore();
  const { pathname, searchParams } = parsed;

  if (pathname === '/api/batches') return handleBatches(method, body, store);
  if (pathname.startsWith('/api/pass-types')) {
    return handlePassTypes(method, pathname, body, store);
  }
  if (pathname === '/api/pool-core-info') return handlePoolCoreInfo(method, body, store);
  if (pathname.startsWith('/api/holidays')) {
    return handleHolidays(method, pathname, searchParams, body, store);
  }
  if (pathname.startsWith('/api/pool-expenses')) {
    return handleExpenses(method, pathname, searchParams, body, store);
  }
  if (pathname.startsWith('/api/users')) return handleUsers(method, pathname, body, store);
  if (pathname.startsWith('/api/registrations')) {
    return handleRegistrations(method, pathname, body, store);
  }
  if (pathname.startsWith('/api/staff-registrations')) {
    return handleStaff(method, pathname, body, store);
  }
  if (pathname.startsWith('/api/pass-scan')) {
    return handlePassScan(method, pathname, searchParams, body, store);
  }
  if (pathname === '/api/coach-payment' || pathname === '/api/coach-payment/summary') {
    return jsonResponse(pathname.endsWith('/summary') ? { total: 0, rows: [] } : []);
  }
  if (pathname === '/api/attendance-sheet') {
    const month = searchParams.get('month') ?? new Date().toISOString().slice(0, 7);
    const view = searchParams.get('view') === 'swimmer' ? 'swimmer' : 'standard';
    return jsonResponse({
      month,
      view,
      days: [],
      weeklyOffDays: store.holidaysWeekly,
      holidayDays: [],
      items: [],
      swimmerCount: 0,
    });
  }
  if (pathname === '/api/balance-sheet') {
    return jsonResponse({
      month: searchParams.get('month'),
      items: [],
      totalCredit: 0,
      totalDebit: 0,
      closingBalance: 0,
    });
  }

  return jsonResponse({ error: 'Demo API route not implemented', path: pathname }, 404);
}
