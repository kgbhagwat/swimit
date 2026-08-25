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
import { COACH_LOGIN_PAGE_KEYS, parseLoginType } from './menuCatalog';

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
    const slots = [...store.batches.slots].sort((a, b) => {
      const startDiff = String(a.startTime ?? '').localeCompare(String(b.startTime ?? ''));
      if (startDiff !== 0) return startDiff;
      return String(a.name ?? '').localeCompare(String(b.name ?? ''), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    });
    return jsonResponse({
      schedules: store.batches.schedules,
      settings: store.batches.schedules[0],
      slots,
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
    store.batches.slots = [...slotsIn]
      .map((row, index) => {
        const r = row as Record<string, unknown>;
        return {
          id: String(r.id ?? allocDemoId(store)),
          name: String(r.name ?? `Batch ${index + 1}`),
          type: String(r.type ?? 'Regular'),
          startTime: String(r.startTime ?? '06:00').slice(0, 5),
          endTime: String(r.endTime ?? '07:00').slice(0, 5),
        };
      })
      .sort((a, b) => {
        const startDiff = String(a.startTime ?? '').localeCompare(String(b.startTime ?? ''));
        if (startDiff !== 0) return startDiff;
        return String(a.name ?? '').localeCompare(String(b.name ?? ''), undefined, {
          numeric: true,
          sensitivity: 'base',
        });
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

function handleWhatsAppNotice(method: string, body: Record<string, unknown>, store: DemoStore) {
  const info = store.poolCoreInfo;
  const current = {
    enabled: Boolean(info.passExpiryNoticeEnabled),
    days: Math.min(9, Math.max(1, Number(info.passExpiryNoticeDays) || 3)),
    chargesAccepted: Boolean(info.whatsappPaidMessagesAccepted),
    chargesAcceptedAt: info.whatsappPaidMessagesAcceptedAt
      ? String(info.whatsappPaidMessagesAcceptedAt)
      : null,
    broadcastEnabled: Boolean(info.whatsappBroadcastEnabled),
    rateInr: 1,
  };
  if (method === 'GET') return jsonResponse(current);
  if (method !== 'PUT') return jsonResponse({ error: 'Method not allowed' }, 405);

  const days = Math.min(9, Math.max(1, Number(body.days) || current.days));
  const enabled = typeof body.enabled === 'boolean' ? body.enabled : current.enabled;
  const broadcastEnabled =
    typeof body.broadcastEnabled === 'boolean' ? body.broadcastEnabled : current.broadcastEnabled;
  const chargesAccepted = current.chargesAccepted || enabled || broadcastEnabled;
  const chargesAcceptedAt =
    chargesAccepted && !current.chargesAcceptedAt
      ? new Date().toISOString()
      : current.chargesAcceptedAt;
  store.poolCoreInfo = {
    ...info,
    passExpiryNoticeEnabled: enabled,
    passExpiryNoticeDays: days,
    whatsappBroadcastEnabled: broadcastEnabled,
    whatsappPaidMessagesAccepted: chargesAccepted,
    whatsappPaidMessagesAcceptedAt: chargesAcceptedAt,
  };
  const expiryLabel = enabled
    ? `pass-expiry reminder on (${days} days)`
    : 'pass-expiry reminder off';
  const broadcastLabel = broadcastEnabled ? 'broadcast on' : 'broadcast off';
  const logs = Array.isArray(store.auditLogs) ? store.auditLogs : [];
  logs.unshift({
    id: allocDemoId(store),
    actorUserId: 1,
    actorUserName: 'preview',
    action: 'update',
    entityType: 'whatsapp_settings',
    entityId: 'whatsapp',
    entityLabel: 'WhatsApp settings',
    summary: `Updated WhatsApp settings: ${expiryLabel}, ${broadcastLabel}`,
    details: {
      passExpiryReminder: enabled,
      passExpiryDays: days,
      broadcast: broadcastEnabled,
      previous: {
        passExpiryReminder: current.enabled,
        passExpiryDays: current.days,
        broadcast: current.broadcastEnabled,
      },
    },
    createdAt: new Date().toISOString(),
  });
  store.auditLogs = logs;
  writeDemoStore(store);
  return jsonResponse({
    enabled,
    days,
    chargesAccepted,
    chargesAcceptedAt,
    broadcastEnabled,
    rateInr: 1,
  });
}

function parseVerificationMode(value: unknown): 'ok_not_ok' | 'face' {
  return String(value ?? '').trim() === 'face' ? 'face' : 'ok_not_ok';
}

function handlePassTypes(
  method: string,
  pathname: string,
  body: Record<string, unknown>,
  store: DemoStore,
) {
  if (pathname === '/api/pass-types/verification' || pathname.endsWith('/pass-types/verification')) {
    if (method === 'GET') {
      return jsonResponse({
        verificationMode: parseVerificationMode(store.poolCoreInfo.passVerificationMode),
        configured: Boolean(store.poolCoreInfo.passVerificationConfigured),
      });
    }
    if (method === 'PUT') {
      const verificationMode = parseVerificationMode(body.verificationMode);
      store.poolCoreInfo = {
        ...store.poolCoreInfo,
        passVerificationMode: verificationMode,
        passVerificationConfigured: true,
      };
      const logs = Array.isArray(store.auditLogs) ? store.auditLogs : [];
      logs.unshift({
        id: allocDemoId(store),
        actorUserId: 1,
        actorUserName: 'preview',
        action: 'update',
        entityType: 'pass_verification',
        entityId: 'pass_verification',
        entityLabel: 'Pass verification',
        summary:
          verificationMode === 'face'
            ? 'Set pass verification to face verification required'
            : 'Set pass verification to OK / Not OK enough',
        details: { verificationMode },
        createdAt: new Date().toISOString(),
      });
      store.auditLogs = logs;
      writeDemoStore(store);
      return jsonResponse({ verificationMode, configured: true });
    }
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }
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
    const clearLogo = formString(body, 'clearPoolLogo') === '1';
    const clearQr = formString(body, 'clearPaymentQr') === '1';
    const paymentAcceptCash =
      body.paymentAcceptCash === undefined
        ? Boolean(store.poolCoreInfo.paymentAcceptCash !== false)
        : formString(body, 'paymentAcceptCash') === '1';
    const paymentAcceptOnline =
      body.paymentAcceptOnline === undefined
        ? Boolean(store.poolCoreInfo.paymentAcceptOnline !== false)
        : formString(body, 'paymentAcceptOnline') === '1';
    store.poolCoreInfo = {
      ...store.poolCoreInfo,
      poolName: formString(body, 'poolName') || String(store.poolCoreInfo.poolName ?? ''),
      poolAddress: formString(body, 'poolAddress') || String(store.poolCoreInfo.poolAddress ?? ''),
      poolState: formString(body, 'poolState'),
      poolDistrict: formString(body, 'poolDistrict'),
      pinCode: formString(body, 'pinCode'),
      swimmerTerms: String(body.swimmerTerms ?? store.poolCoreInfo.swimmerTerms ?? ''),
      staffTerms: String(body.staffTerms ?? store.poolCoreInfo.staffTerms ?? ''),
      upiDetails: formString(body, 'upiDetails'),
      paymentAcceptCash,
      paymentAcceptOnline,
      poolLogoPath: body.poolLogo
        ? body.poolLogo
        : clearLogo
          ? null
          : store.poolCoreInfo.poolLogoPath,
      paymentQrPath: body.paymentQr
        ? body.paymentQr
        : clearQr
          ? null
          : store.poolCoreInfo.paymentQrPath,
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
    const holidayType = formString(body, 'holidayType') || 'Special';
    const daySpan =
      holidayType === 'surprise' && String(body.daySpan ?? '') === 'partial' ? 'partial' : 'full';
    const row = {
      id: allocDemoId(store),
      holidayType,
      name: formString(body, 'name'),
      startDate: formString(body, 'startDate'),
      endDate: formString(body, 'endDate') || formString(body, 'startDate'),
      daySpan,
      startTime: daySpan === 'partial' ? formString(body, 'startTime').slice(0, 5) : '',
      endTime: daySpan === 'partial' ? formString(body, 'endTime').slice(0, 5) : '',
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

function handleWaterQuality(
  method: string,
  pathname: string,
  searchParams: URLSearchParams,
  body: Record<string, unknown>,
  store: DemoStore,
) {
  if (!Array.isArray(store.waterQuality)) store.waterQuality = [];
  if (method === 'GET' && pathname === '/api/water-quality') {
    const month = searchParams.get('month') ?? '';
    const rows = month
      ? store.waterQuality.filter((e) => String(e.recordDate ?? '').startsWith(month))
      : store.waterQuality;
    return jsonResponse(rows);
  }
  if (method === 'POST' && pathname === '/api/water-quality') {
    const row = {
      id: allocDemoId(store),
      recordDate: formString(body, 'recordDate'),
      phLevel: Number(body.phLevel) || 0,
      freeChlorine: Number(body.freeChlorine) || 0,
      totalAlkalinity: Number(body.totalAlkalinity) || 0,
      calciumHardness: Number(body.calciumHardness) || 0,
      testerName: formString(body, 'testerName'),
    };
    store.waterQuality.push(row);
    writeDemoStore(store);
    return jsonResponse(row, 201);
  }
  const idMatch = pathname.match(/^\/api\/water-quality\/(\d+)$/);
  if (idMatch && method === 'PUT') {
    const id = Number(idMatch[1]);
    const idx = store.waterQuality.findIndex((e) => Number(e.id) === id);
    if (idx < 0) return jsonResponse({ error: 'Not found' }, 404);
    store.waterQuality[idx] = {
      ...store.waterQuality[idx],
      recordDate: formString(body, 'recordDate') || String(store.waterQuality[idx].recordDate),
      phLevel: Number(body.phLevel ?? store.waterQuality[idx].phLevel) || 0,
      freeChlorine: Number(body.freeChlorine ?? store.waterQuality[idx].freeChlorine) || 0,
      totalAlkalinity: Number(body.totalAlkalinity ?? store.waterQuality[idx].totalAlkalinity) || 0,
      calciumHardness: Number(body.calciumHardness ?? store.waterQuality[idx].calciumHardness) || 0,
      testerName: formString(body, 'testerName') || String(store.waterQuality[idx].testerName),
    };
    writeDemoStore(store);
    return jsonResponse(store.waterQuality[idx]);
  }
  if (idMatch && method === 'DELETE') {
    const id = Number(idMatch[1]);
    store.waterQuality = store.waterQuality.filter((e) => Number(e.id) !== id);
    writeDemoStore(store);
    return jsonResponse({ ok: true });
  }
  return jsonResponse({ error: 'Method not allowed' }, 405);
}

function isCompetitiveDemoSwimmer(
  row: Record<string, unknown>,
  store: DemoStore,
) {
  const batch = String(row.batch ?? '');
  if (/advance/i.test(batch)) return true;
  const passName = String(row.pass_type ?? row.passType ?? '');
  return store.passTypes.some(
    (pass) =>
      String(pass.passName ?? '') === passName &&
      /competitive/i.test(String(pass.forAudience ?? '')),
  );
}

function last10Digits(value: unknown) {
  return String(value ?? '').replace(/\D/g, '').slice(-10);
}

function demoSessionUser(store: DemoStore) {
  try {
    const code = sessionStorage.getItem('swimIT.activeAccountCode');
    if (!code) return null;
    const raw = sessionStorage.getItem(`swimIT.accountSession.${code}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const userName = String(parsed.userName ?? parsed.user_name ?? '').trim();
    const id = Number(parsed.id);
    const fromStore = store.users.find(
      (row) =>
        (Number.isFinite(id) && id > 0 && Number(row.id) === id) ||
        (userName && String(row.userName ?? row.user_name ?? '').trim() === userName),
    );
    return {
      isAccountAdmin:
        parsed.isAccountAdmin === true ||
        parsed.is_account_admin === true ||
        fromStore?.isAccountAdmin === true ||
        fromStore?.is_account_admin === true,
      email: String(fromStore?.email ?? parsed.email ?? '').trim().toLowerCase(),
      mobile: last10Digits(fromStore?.mobile ?? parsed.mobile),
      loginType: parseLoginType(fromStore?.loginType ?? fromStore?.login_type ?? parsed.loginType),
    };
  } catch {
    return null;
  }
}

function demoAssignedCoachNames(store: DemoStore): string[] | null {
  const user = demoSessionUser(store);
  if (!user || user.isAccountAdmin || user.loginType !== 'coach') return null;
  const names = store.staffRegistrations
    .filter((row) => String(row.registration_for ?? row.registrationFor ?? '').toLowerCase() === 'coach')
    .filter((row) => {
      const email = String(row.email ?? '').trim().toLowerCase();
      const mobile = last10Digits(row.whatsapp_mobile ?? row.whatsappMobile);
      const other = last10Digits(row.other_mobile ?? row.otherMobile);
      return (
        (user.email && email === user.email) ||
        (user.mobile.length === 10 && (mobile === user.mobile || other === user.mobile))
      );
    })
    .map((row) => String(row.full_name ?? row.fullName ?? '').trim().toLowerCase())
    .filter(Boolean);
  const unique = [...new Set(names)];
  return unique;
}

function assignedToDemoCoach(row: Record<string, unknown>, names: string[] | null) {
  if (!names) return true;
  return names.includes(String(row.coach ?? '').trim().toLowerCase());
}

function handleSwimmerProgress(
  method: string,
  pathname: string,
  searchParams: URLSearchParams,
  body: Record<string, unknown>,
  store: DemoStore,
) {
  if (!Array.isArray(store.swimmerProgress)) store.swimmerProgress = [];
  const recordDate = String(body.recordDate ?? searchParams.get('recordDate') ?? '').slice(0, 10);
  const stroke = String(body.stroke ?? searchParams.get('stroke') ?? 'Free Style');
  const distanceM = Number(body.distanceM ?? searchParams.get('distanceM') ?? 50);

  if (method === 'GET' && pathname.endsWith('/trend')) {
    const coachNames = demoAssignedCoachNames(store);
    const dateSet = new Set<string>();
    const swimmers = store.registrations
      .filter((row) => row.is_active !== false && row.isActive !== false)
      .filter((row) => isCompetitiveDemoSwimmer(row, store))
      .filter((row) => assignedToDemoCoach(row, coachNames))
      .map((row) => {
        const id = Number(row.id);
        const times: Record<string, string> = {};
        for (const entry of store.swimmerProgress) {
          if (
            Number(entry.registrationId) === id &&
            String(entry.stroke) === stroke &&
            Number(entry.distanceM) === distanceM &&
            String(entry.timeText ?? '').trim()
          ) {
            const date = String(entry.recordDate).slice(0, 10);
            times[date] = String(entry.timeText);
            dateSet.add(date);
          }
        }
        return {
          id,
          name: String(row.full_name ?? row.fullName ?? ''),
          batch: String(row.batch ?? ''),
          coach: String(row.coach ?? ''),
          times,
        };
      });
    return jsonResponse({
      stroke,
      distanceM,
      dates: [...dateSet].sort(),
      swimmers,
    });
  }

  if (method === 'GET') {
    const coachNames = demoAssignedCoachNames(store);
    const swimmers = store.registrations
      .filter((row) => row.is_active !== false && row.isActive !== false)
      .filter((row) => isCompetitiveDemoSwimmer(row, store))
      .filter((row) => assignedToDemoCoach(row, coachNames))
      .map((row) => {
        const id = Number(row.id);
        const saved = store.swimmerProgress.find(
          (entry) =>
            Number(entry.registrationId) === id &&
            String(entry.recordDate) === recordDate &&
            String(entry.stroke) === stroke &&
            Number(entry.distanceM) === distanceM,
        );
        return {
          id,
          name: String(row.full_name ?? row.fullName ?? ''),
          batch: String(row.batch ?? ''),
          coach: String(row.coach ?? ''),
          timeText: String(saved?.timeText ?? ''),
        };
      });
    return jsonResponse({ recordDate, stroke, distanceM, swimmers });
  }

  if (method === 'PUT') {
    const coachNames = demoAssignedCoachNames(store);
    const allowedIds = new Set(
      store.registrations
        .filter((row) => row.is_active !== false && row.isActive !== false)
        .filter((row) => isCompetitiveDemoSwimmer(row, store))
        .filter((row) => assignedToDemoCoach(row, coachNames))
        .map((row) => Number(row.id)),
    );
    const entries = Array.isArray(body.entries) ? body.entries : [];
    for (const item of entries) {
      const row = item as Record<string, unknown>;
      const registrationId = Number(row.registrationId ?? row.id);
      if (!allowedIds.has(registrationId)) continue;
      const timeText = String(row.timeText ?? '').trim();
      store.swimmerProgress = store.swimmerProgress.filter(
        (entry) =>
          !(
            Number(entry.registrationId) === registrationId &&
            String(entry.recordDate) === recordDate &&
            String(entry.stroke) === stroke &&
            Number(entry.distanceM) === distanceM
          ),
      );
      if (timeText) {
        store.swimmerProgress.push({
          registrationId,
          recordDate,
          stroke,
          distanceM,
          timeText,
        });
      }
    }
    writeDemoStore(store);
    return jsonResponse({ ok: true, recordDate, stroke, distanceM });
  }

  return jsonResponse({ error: 'Method not allowed' }, 405);
}

function handleUsers(method: string, pathname: string, body: Record<string, unknown>, store: DemoStore) {
  if (pathname === '/api/users/session-timeout') {
    if (method === 'GET') {
      return jsonResponse({ minutes: Number(store.sessionTimeoutMinutes ?? 30) });
    }
    if (method === 'PUT') {
      const minutes = Math.round(Number(body.minutes));
      const allowed = new Set([0, 15, 30, 60, 120, 240, 480]);
      if (!allowed.has(minutes)) {
        return jsonResponse({ error: 'Choose a valid login session timeout' }, 400);
      }
      store.sessionTimeoutMinutes = minutes;
      writeDemoStore(store);
      return jsonResponse({ minutes });
    }
  }
  if (method === 'GET' && pathname === '/api/users') {
    return jsonResponse(store.users);
  }
  const one = pathname.match(/^\/api\/users\/(\d+)$/);
  if (one && method === 'GET') {
    const user = store.users.find((u) => Number(u.id) === Number(one[1]));
    return user ? jsonResponse(user) : jsonResponse({ error: 'Not found' }, 404);
  }
  if (method === 'POST' && pathname === '/api/users') {
    const loginType = parseLoginType(body.loginType);
    const menuAccess =
      loginType === 'coach'
        ? [...COACH_LOGIN_PAGE_KEYS]
        : Array.isArray(body.menuAccess)
          ? body.menuAccess.map(String)
          : [];
    const row = {
      id: allocDemoId(store),
      userName: formString(body, 'userName'),
      mobile: formString(body, 'mobile'),
      email: formString(body, 'email'),
      menuAccess,
      loginType,
      mustChangePassword: true,
      isAccountAdmin: false,
      saasAccountId: null,
      createdAt: new Date().toISOString(),
      temporaryPassword: 'DemoPass1',
      deliveryNote: 'Demo mode: password is DemoPass1.',
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
    const loginType = parseLoginType(body.loginType ?? store.users[idx].loginType);
    const menuAccess =
      loginType === 'coach'
        ? [...COACH_LOGIN_PAGE_KEYS]
        : Array.isArray(body.menuAccess)
          ? body.menuAccess.map(String)
          : [];
    store.users[idx] = {
      ...store.users[idx],
      menuAccess,
      loginType,
    };
    writeDemoStore(store);
    return jsonResponse(store.users[idx]);
  }
  if (one && method === 'DELETE') {
    const id = Number(one[1]);
    const idx = store.users.findIndex((u) => Number(u.id) === id);
    if (idx < 0) return jsonResponse({ error: 'Not found' }, 404);
    if (store.users[idx].isAccountAdmin === true) {
      return jsonResponse({ error: 'Cannot remove the account admin user' }, 400);
    }
    store.users.splice(idx, 1);
    writeDemoStore(store);
    return jsonResponse({ ok: true });
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
  const resend = pathname.match(/^\/api\/registrations\/(\d+)\/resend-pass$/);
  if (resend && method === 'POST') {
    const row = store.registrations.find((r) => Number(r.id) === Number(resend[1]));
    if (!row) return jsonResponse({ error: 'Not found' }, 404);
    if (!row.is_active) {
      return jsonResponse({ error: 'Only active swimmers can receive a pass resend' }, 400);
    }
    if (!String(row.pass_type ?? '').trim()) {
      return jsonResponse({ error: 'Swimmer does not have an active pass type' }, 400);
    }
    return jsonResponse({ ok: true, message: 'Pass and QR resent on WhatsApp (demo)' });
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
    const passTypeName = String(swimmer.pass_type ?? '');
    const matchingPassType = store.passTypes.find(
      (pt) => String(pt.passName ?? '').trim().toLowerCase() === passTypeName.trim().toLowerCase(),
    );
    return jsonResponse({
      id: Number(swimmer.id),
      fullName: String(swimmer.full_name ?? ''),
      contact: String(swimmer.whatsapp_mobile ?? ''),
      email: String(swimmer.email ?? ''),
      isActive: swimmer.is_active !== false,
      passType: passTypeName,
      duration: String(swimmer.duration ?? matchingPassType?.duration ?? ''),
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
      verificationMode: parseVerificationMode(store.poolCoreInfo.passVerificationMode),
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
    parsed.pathname.startsWith('/api/health') ||
    parsed.pathname.startsWith('/api/open/')
  ) {
    return null;
  }

  const method = (init?.method ?? 'GET').toUpperCase();
  const body = await readJsonBody(init);
  const store = readDemoStore();
  const { pathname, searchParams } = parsed;

  // Live WhatsApp (Meta) — Application uses the real API with the bound tenant,
  // except pass-expiry / broadcast opt-in settings which stay in the preview store.
  if (pathname === '/api/whatsapp/pass-expiry-notice') {
    return handleWhatsAppNotice(method, body, store);
  }
  if (pathname.startsWith('/api/whatsapp')) {
    return null;
  }

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
  if (pathname.startsWith('/api/water-quality')) {
    return handleWaterQuality(method, pathname, searchParams, body, store);
  }
  if (pathname.startsWith('/api/swimmer-progress')) {
    return handleSwimmerProgress(method, pathname, searchParams, body, store);
  }
  if (pathname === '/api/activity-log' || pathname === '/api/activity-log/platform') {
    if (method === 'GET') {
      const now = Date.now();
      const sampleRows = [
        {
          id: 3,
          actorUserId: 1,
          actorUserName: 'admin',
          action: 'update',
          entityType: 'swimmer',
          entityId: '12',
          entityLabel: 'Sample Swimmer',
          summary: 'Updated swimmer (batch / active / pass)',
          details: { batch: 'Morning 1', isActive: true },
          createdAt: new Date(now - 15 * 60 * 1000).toISOString(),
        },
        {
          id: 2,
          actorUserId: 1,
          actorUserName: 'admin',
          action: 'delete',
          entityType: 'pool_expense',
          entityId: '4',
          entityLabel: 'Chlorine refill',
          summary: 'Deleted pool expense',
          details: { amount: 450, mode: 'Cash' },
          createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: 1,
          actorUserId: 1,
          actorUserName: 'admin',
          action: 'create',
          entityType: 'water_quality',
          entityId: '1',
          entityLabel: new Date().toISOString().slice(0, 10),
          summary: 'Created water quality record',
          details: { phLevel: 7.4, freeChlorine: 1.5 },
          createdAt: new Date(now - 26 * 60 * 60 * 1000).toISOString(),
        },
      ];
      const demoLogs = Array.isArray(store.auditLogs) ? store.auditLogs : [];
      const rows = [...demoLogs, ...sampleRows];
      if (pathname === '/api/activity-log/platform') {
        return jsonResponse({
          account: {
            id: Number(searchParams.get('targetAccountId') || 1),
            accountCode: 'demo01',
            accountName: 'Demo Pool',
          },
          rows,
        });
      }
      return jsonResponse(rows);
    }
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
  if (pathname === '/api/dashboard/details') {
    const asOf = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
    const kind = String(searchParams.get('kind') ?? '').trim();
    return jsonResponse(buildDemoDashboardDetails(store, kind, asOf));
  }
  if (pathname === '/api/dashboard') {
    const asOf = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
    return jsonResponse(buildDemoDashboard(store, asOf));
  }

  return jsonResponse({ error: 'Demo API route not implemented', path: pathname }, 404);
}

function countBy(rows: Array<Record<string, unknown>>, key: string) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const name = String(row[key] ?? '').trim() || 'Unassigned';
    map.set(name, (map.get(name) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

const SAMPLE_DASHBOARD_PEOPLE = [
  { fullName: 'Aarav Patil', mobile: '9876543210', batch: 'Morning A — Mixed — 06:00 to 07:00', coach: 'Riya Kulkarni', passType: 'Monthly Swim' },
  { fullName: 'Sana Joshi', mobile: '9123456780', batch: 'Evening B — Ladies — 17:00 to 18:00', coach: 'Amit Shah', passType: 'Quarterly Swim' },
  { fullName: 'Vihaan Kulkarni', mobile: '9988776655', batch: 'Afternoon C — Mixed — 14:00 to 15:00', coach: 'Riya Kulkarni', passType: 'Monthly Swim' },
  { fullName: 'Anaya Deshmukh', mobile: '9001122334', batch: 'Morning A — Mixed — 06:00 to 07:00', coach: 'Amit Shah', passType: 'Trial Pass' },
  { fullName: 'Kabir Mehta', mobile: '9812345670', batch: 'Evening B — Ladies — 17:00 to 18:00', coach: 'Riya Kulkarni', passType: 'Monthly Swim' },
  { fullName: 'Isha Sharma', mobile: '9765432109', batch: 'Afternoon C — Mixed — 14:00 to 15:00', coach: 'Amit Shah', passType: 'Quarterly Swim' },
];

function sampleCountForKind(kind: string, asOf: string) {
  const seed = Number(String(asOf).replace(/\D/g, '')) || 1;
  if (kind === 'present') return 12 + (seed % 17);
  if (kind === 'admissions') return 1 + (seed % 5);
  if (kind === 'expiring') return 2 + (seed % 8);
  if (kind === 'users') return 4;
  return 36 + (seed % 20);
}

function mapDemoSwimmerDetail(row: Record<string, unknown>, index: number) {
  const until = String(row.pass_valid_until ?? row.passValidUntil ?? '').slice(0, 10);
  return {
    id: Number(row.id ?? index + 1) || index + 1,
    fullName: String(row.full_name ?? row.fullName ?? '').trim() || '—',
    mobile: String(row.whatsapp_mobile ?? row.whatsappMobile ?? row.mobile ?? '').trim(),
    batch: String(row.batch ?? '').trim() || '—',
    coach: String(row.coach ?? '').trim() || '—',
    passType: String(row.pass_type ?? row.passType ?? '').trim() || '—',
    passValidUntil: until || null,
    createdAt: String(row.created_at ?? row.createdAt ?? '').slice(0, 10) || null,
  };
}

function fakeDetailRows(kind: string, asOf: string, count: number) {
  const n = Math.max(0, count);
  if (kind === 'users') {
    const users = [
      { userName: 'pooladmin', mobile: '9000000001', email: 'admin@example.com', isAccountAdmin: true },
      { userName: 'riya.k', mobile: '9000000002', email: 'riya@example.com', isAccountAdmin: false },
      { userName: 'amit.s', mobile: '9000000003', email: 'amit@example.com', isAccountAdmin: false },
      { userName: 'front.desk', mobile: '9000000004', email: 'desk@example.com', isAccountAdmin: false },
    ];
    return users.slice(0, n).map((row, index) => ({
      id: index + 1,
      ...row,
      createdAt: asOf,
    }));
  }
  return Array.from({ length: n }, (_, index) => {
    const sample = SAMPLE_DASHBOARD_PEOPLE[index % SAMPLE_DASHBOARD_PEOPLE.length];
    const until = new Date(`${asOf}T12:00:00`);
    until.setDate(until.getDate() + (kind === 'expiring' ? 1 + (index % 3) : 12 + (index % 20)));
    return {
      id: index + 1,
      fullName: sample.fullName,
      mobile: sample.mobile,
      batch: sample.batch,
      coach: sample.coach,
      passType: sample.passType,
      passValidUntil: until.toISOString().slice(0, 10),
      createdAt: asOf,
    };
  });
}

function buildDemoDashboardDetails(store: DemoStore, kind: string, asOfRaw?: string) {
  const asOf =
    asOfRaw && /^\d{4}-\d{2}-\d{2}$/.test(asOfRaw)
      ? asOfRaw
      : new Date().toISOString().slice(0, 10);
  const noticeDays = Number(store.poolCoreInfo.passExpiryNoticeDays ?? 3) || 3;
  const noticeEnd = new Date(`${asOf}T12:00:00`);
  noticeEnd.setDate(noticeEnd.getDate() + noticeDays);
  const noticeEndIso = noticeEnd.toISOString().slice(0, 10);

  if (kind === 'users') {
    const users = store.users.filter((row) => {
      const created = String(row.createdAt ?? row.created_at ?? '').slice(0, 10);
      return Boolean(String(row.mobile ?? '').trim()) && (!created || created <= asOf);
    });
    if (!users.length) {
      return { kind, asOf, rows: fakeDetailRows('users', asOf, sampleCountForKind('users', asOf)) };
    }
    return {
      kind,
      asOf,
      rows: users.map((row, index) => ({
        id: Number(row.id ?? index + 1) || index + 1,
        userName: String(row.userName ?? row.user_name ?? '').trim() || '—',
        mobile: String(row.mobile ?? '').trim(),
        email: String(row.email ?? '').trim(),
        isAccountAdmin: row.isAccountAdmin === true || row.is_account_admin === true,
        createdAt: String(row.createdAt ?? row.created_at ?? '').slice(0, 10) || null,
      })),
    };
  }

  const active = store.registrations.filter((row) => row.is_active !== false && row.isActive !== false);
  let selected: Array<Record<string, unknown>> = active;
  if (kind === 'present') {
    const presentIds = new Set(
      store.attendance
        .filter((row) => String(row.attendance_date ?? row.attendanceDate ?? '').slice(0, 10) === asOf)
        .map((row) => Number(row.registration_id ?? row.registrationId ?? 0)),
    );
    selected = active.filter((row) => presentIds.has(Number(row.id)));
  } else if (kind === 'expiring') {
    selected = active.filter((row) => {
      const until = String(row.pass_valid_until ?? row.passValidUntil ?? '').slice(0, 10);
      return until && until >= asOf && until <= noticeEndIso;
    });
  } else if (kind === 'admissions') {
    selected = store.registrations.filter((row) => {
      const created = String(row.created_at ?? row.createdAt ?? '').slice(0, 10);
      return created === asOf;
    });
  }

  if (!store.registrations.length) {
    return { kind, asOf, rows: fakeDetailRows(kind, asOf, sampleCountForKind(kind, asOf)) };
  }

  return {
    kind,
    asOf,
    rows: selected.map((row, index) => mapDemoSwimmerDetail(row, index)),
  };
}

function buildDemoDashboard(store: DemoStore, asOfRaw?: string) {
  const asOf =
    asOfRaw && /^\d{4}-\d{2}-\d{2}$/.test(asOfRaw)
      ? asOfRaw
      : new Date().toISOString().slice(0, 10);
  const noticeDays = Number(store.poolCoreInfo.passExpiryNoticeDays ?? 3) || 3;
  const noticeEnd = new Date(`${asOf}T12:00:00`);
  noticeEnd.setDate(noticeEnd.getDate() + noticeDays);
  const noticeEndIso = noticeEnd.toISOString().slice(0, 10);

  const active = store.registrations.filter((row) => row.is_active !== false && row.isActive !== false);
  const presentToday = new Set(
    store.attendance
      .filter((row) => String(row.attendance_date ?? row.attendanceDate ?? '').slice(0, 10) === asOf)
      .map((row) => Number(row.registration_id ?? row.registrationId ?? 0)),
  ).size;
  const expiringSoon = active.filter((row) => {
    const until = String(row.pass_valid_until ?? row.passValidUntil ?? '').slice(0, 10);
    return until && until >= asOf && until <= noticeEndIso;
  }).length;
  const newToday = store.registrations.filter((row) => {
    const created = String(row.created_at ?? row.createdAt ?? '').slice(0, 10);
    return created === asOf;
  });

  const poolName = String(store.poolCoreInfo.poolName ?? '').trim() || 'Swimming pool';

  function sampleWaterQualitySeries(forDate: string) {
    const points: Array<{
      recordDate: string;
      phLevel: number;
      freeChlorine: number;
      totalAlkalinity: number;
      calciumHardness: number;
    }> = [];
    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date(`${forDate}T12:00:00`);
      date.setDate(date.getDate() - i);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      const recordDate = `${y}-${m}-${d}`;
      if (recordDate > forDate) continue;
      const seed = Number(recordDate.replace(/\D/g, '')) || 1;
      points.push({
        recordDate,
        phLevel: Number((7.1 + ((seed + i) % 7) * 0.1).toFixed(1)),
        freeChlorine: Number((0.6 + ((seed + i * 2) % 5) * 0.5).toFixed(1)),
        totalAlkalinity: 70 + ((seed + i * 3) % 8) * 10,
        calciumHardness: 180 + ((seed + i * 5) % 9) * 30,
      });
    }
    return points;
  }

  // Preview often starts empty — return day-specific sample so the date picker is obvious.
  if (store.registrations.length === 0) {
    const seed = Number(asOf.replace(/\D/g, '')) || 1;
    const present = 12 + (seed % 17);
    const newAdmissions = 1 + (seed % 5);
    const cash = 1000 * (2 + (seed % 6));
    const online = 1000 * (3 + (seed % 8));
    const count = 2 + (seed % 7);
    const activeSwimmers = 36 + (seed % 20);
    const expiringSoonSample = 2 + (seed % 8);
    return {
      asOf,
      poolName: poolName === 'Swimming pool' ? 'Demo Swimming Pool' : poolName,
      city: 'Pune',
      summary: {
        activeUsers: Math.max(store.users.length, 4),
        activeSwimmers,
        presentToday: present,
        expiringSoon: expiringSoonSample,
        expiryNoticeDays: noticeDays,
        newAdmissionsToday: newAdmissions,
      },
      paymentsToday: { cash, online, total: cash + online, count },
      activeBy: {
        batch: [
          { name: 'Morning A — Mixed — 06:00 to 07:00', count: Math.max(8, Math.round(activeSwimmers * 0.38)) },
          { name: 'Evening B — Ladies — 17:00 to 18:00', count: Math.max(6, Math.round(activeSwimmers * 0.33)) },
          {
            name: 'Afternoon C — Mixed — 14:00 to 15:00',
            count: Math.max(4, activeSwimmers - Math.round(activeSwimmers * 0.71)),
          },
        ],
        coach: [
          { name: 'Riya Kulkarni', count: Math.max(10, Math.round(activeSwimmers * 0.42)) },
          { name: 'Amit Shah', count: Math.max(8, Math.round(activeSwimmers * 0.31)) },
          { name: 'Unassigned', count: Math.max(4, activeSwimmers - Math.round(activeSwimmers * 0.73)) },
        ],
        passType: [
          { name: 'Monthly Swim', count: Math.max(14, Math.round(activeSwimmers * 0.58)) },
          { name: 'Quarterly Swim', count: Math.max(6, Math.round(activeSwimmers * 0.25)) },
          { name: 'Trial Pass', count: Math.max(2, activeSwimmers - Math.round(activeSwimmers * 0.83)) },
        ],
      },
      newAdmissionsBy: {
        batch: [
          { name: 'Morning A — Mixed — 06:00 to 07:00', count: Math.max(1, Math.ceil(newAdmissions * 0.6)) },
          {
            name: 'Evening B — Ladies — 17:00 to 18:00',
            count: Math.max(0, newAdmissions - Math.ceil(newAdmissions * 0.6)),
          },
        ].filter((row) => row.count > 0),
        coach: [
          { name: 'Riya Kulkarni', count: Math.max(1, Math.ceil(newAdmissions * 0.67)) },
          { name: 'Amit Shah', count: Math.max(0, newAdmissions - Math.ceil(newAdmissions * 0.67)) },
        ].filter((row) => row.count > 0),
        passType: [
          { name: 'Monthly Swim', count: Math.max(1, Math.ceil(newAdmissions * 0.67)) },
          { name: 'Trial Pass', count: Math.max(0, newAdmissions - Math.ceil(newAdmissions * 0.67)) },
        ].filter((row) => row.count > 0),
      },
      waterQuality: sampleWaterQualitySeries(asOf),
    };
  }

  const storedWq = Array.isArray(store.waterQuality)
    ? store.waterQuality
        .filter((row) => String(row.recordDate ?? '').slice(0, 10) <= asOf)
        .sort((a, b) =>
          String(a.recordDate ?? '').localeCompare(String(b.recordDate ?? '')),
        )
        .slice(-7)
        .map((row) => ({
          recordDate: String(row.recordDate ?? '').slice(0, 10),
          phLevel: Number(row.phLevel) || 0,
          freeChlorine: Number(row.freeChlorine) || 0,
          totalAlkalinity: Number(row.totalAlkalinity) || 0,
          calciumHardness: Number(row.calciumHardness) || 0,
        }))
    : [];

  return {
    asOf,
    poolName,
    city: '',
    summary: {
      activeUsers: store.users.length,
      activeSwimmers: active.length,
      presentToday,
      expiringSoon,
      expiryNoticeDays: noticeDays,
      newAdmissionsToday: newToday.length,
    },
    paymentsToday: { cash: 0, online: 0, total: 0, count: 0 },
    activeBy: {
      batch: countBy(active, 'batch'),
      coach: countBy(active, 'coach'),
      passType: (() => {
        const bySnake = countBy(active, 'pass_type');
        return bySnake.length ? bySnake : countBy(active, 'passType');
      })(),
    },
    newAdmissionsBy: {
      batch: countBy(newToday, 'batch'),
      coach: countBy(newToday, 'coach'),
      passType: (() => {
        const bySnake = countBy(newToday, 'pass_type');
        return bySnake.length ? bySnake : countBy(newToday, 'passType');
      })(),
    },
    waterQuality: storedWq.length ? storedWq : sampleWaterQualitySeries(asOf),
  };
}
