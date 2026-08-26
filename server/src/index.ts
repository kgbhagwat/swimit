import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registrationsRouter } from './routes/registrations.js';
import { staffRegistrationsRouter } from './routes/staffRegistrations.js';
import { batchesRouter } from './routes/batches.js';
import { passTypesRouter } from './routes/passTypes.js';
import { poolExpensesRouter } from './routes/poolExpenses.js';
import { waterQualityRouter } from './routes/waterQuality.js';
import { swimmerProgressRouter } from './routes/swimmerProgress.js';
import { passScanRouter } from './routes/passScan.js';
import { coachPaymentRouter } from './routes/coachPayment.js';
import { attendanceSheetRouter } from './routes/attendanceSheet.js';
import { balanceSheetRouter } from './routes/balanceSheet.js';
import { poolCoreInfoRouter } from './routes/poolCoreInfo.js';
import { holidaysRouter } from './routes/holidays.js';
import { usersRouter } from './routes/users.js';
import { servicePackagesRouter } from './routes/servicePackages.js';
import { saasAccountsRouter } from './routes/saasAccounts.js';
import { webauthnRouter } from './routes/webauthn.js';
import { whatsappRouter } from './routes/whatsapp.js';
import { platformPaymentRouter } from './routes/platformPayment.js';
import { dashboardRouter } from './routes/dashboard.js';
import { openUpiPayRouter } from './routes/openUpiPay.js';
import { supportRouter } from './routes/support.js';
import { auditLogRouter } from './routes/auditLog.js';
import { captchaRouter } from './routes/captcha.js';
import { remoteLoginRouter } from './routes/remoteLogin.js';
import { authRouter } from './routes/auth.js';
import { requireTenant } from './middleware/tenant.js';
import { requireUploadAccess } from './uploadAccess.js';
import {
  requireAnyPageAccess,
  requireAuth,
  requirePlatformAuth,
  requirePlatformPageAccess,
} from './authSessions.js';
import { apiTrafficMiddleware } from './apiTraffic.js';
import { serverStatsRouter } from './routes/serverStats.js';
import {
  authEnrollmentLimiter,
  biometricLoginLimiter,
  captchaLimiter,
  failedLoginLimiter,
  loginBurstLimiter,
  passwordResetLimiter,
} from './middleware/loginRateLimit.js';
import { ensureSchema } from './ensureSchema.js';
import { startSubscriptionExpiryReminders } from './subscriptionReminders.js';
import { startSubscriptionChatExpiryReminders } from './subscriptionChatReminders.js';
import { startPassExpiryReminders } from './passExpiryReminders.js';
import { startDashboardSnapshotWorker } from './dashboardSnapshotHost.js';
import { startServerMonitorSampler } from './serverMonitor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT ?? 4000);
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
const configuredCorsOrigins = String(process.env.CORS_ORIGIN ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const corsOrigin =
  configuredCorsOrigins.length > 0
    ? configuredCorsOrigins
    : process.env.NODE_ENV === 'production'
      ? false
      : true;
const clientDist = path.resolve(__dirname, '../../client/dist');
const hasClientBuild = fs.existsSync(path.join(clientDist, 'index.html'));

if (Number.isInteger(trustProxyHops) && trustProxyHops > 0) {
  app.set('trust proxy', trustProxyHops);
}
app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://cdn.jsdelivr.net', 'blob:'],
        workerSrc: ["'self'", 'https://cdn.jsdelivr.net', 'blob:'],
        connectSrc: ["'self'", 'https://cdn.jsdelivr.net', 'https://tessdata.projectnaptha.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(cors({ origin: corsOrigin, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }));
app.use(express.json({ limit: '1mb', strict: true }));
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
});
app.use('/api', apiTrafficMiddleware);
const uploadsDir = path.resolve(__dirname, '../uploads');
app.use('/uploads', (req, res, next) => {
  // Sealed identity proofs must only be served via authenticated API routes.
  if (String(req.path).toLowerCase().endsWith('.enc')) {
    res.status(404).end();
    return;
  }
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  next();
});
app.use('/uploads', requireUploadAccess(uploadsDir));
app.use('/uploads', express.static(uploadsDir, { dotfiles: 'deny', index: false }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/version', (_req, res) => {
  res.json({
    status: 'ok',
    commit: process.env.GIT_COMMIT || process.env.SOURCE_COMMIT || 'unknown',
    builtAt: process.env.BUILD_TIME || null,
  });
});

app.use('/api/auth', authRouter);
app.use('/api/service-packages', (req, res, next) => {
  if (req.method === 'GET') {
    next();
    return;
  }
  void requirePlatformAuth(req, res, next);
});
app.use('/api/platform-payment', (req, res, next) => {
  if (req.method === 'GET' && req.path === '/') {
    next();
    return;
  }
  void requirePlatformAuth(req, res, next);
});
app.post('/api/remote-login/requests/:id/decide', requireAuth);
app.get('/api/whatsapp/status', requireAuth);
app.use('/api/registrations', requireTenant, registrationsRouter);
app.use('/api/staff-registrations', requireTenant, staffRegistrationsRouter);
app.use('/api/batches', requireTenant, requireAnyPageAccess('batches'), batchesRouter);
app.use('/api/pass-types', requireTenant, requireAnyPageAccess('pass-types'), passTypesRouter);
app.use(
  '/api/pool-expenses',
  requireTenant,
  requireAnyPageAccess('pool-expenses'),
  poolExpensesRouter,
);
app.use(
  '/api/water-quality',
  requireTenant,
  requireAnyPageAccess('water-quality'),
  waterQualityRouter,
);
app.use(
  '/api/swimmer-progress',
  requireTenant,
  requireAnyPageAccess('swimmer-progress', 'progress-trend'),
  swimmerProgressRouter,
);
app.use('/api/pass-scan', requireTenant, requireAnyPageAccess('pass-scanner'), passScanRouter);
app.use(
  '/api/coach-payment',
  requireTenant,
  requireAnyPageAccess('coach-payment'),
  coachPaymentRouter,
);
app.use(
  '/api/attendance-sheet',
  requireTenant,
  requireAnyPageAccess('attendance-sheet'),
  attendanceSheetRouter,
);
app.use(
  '/api/balance-sheet',
  requireTenant,
  requireAnyPageAccess('balance-sheet'),
  balanceSheetRouter,
);
app.use('/api/dashboard', requireTenant, requireAnyPageAccess('dashboard'), dashboardRouter);
app.use(
  '/api/pool-core-info',
  requireTenant,
  (req, res, next) => {
    if (req.method === 'GET') {
      requireAnyPageAccess(
        'pool-core-info',
        'pass-payment',
        'register',
        'staff-register',
      )(req, res, next);
      return;
    }
    requireAnyPageAccess('pool-core-info')(req, res, next);
  },
  poolCoreInfoRouter,
);
app.use(
  '/api/holidays',
  requireTenant,
  requireAnyPageAccess('holiday-management'),
  holidaysRouter,
);
app.use('/api/users', requireTenant, (req, res, next) => {
  if (req.method === 'GET' && /^\/\d+$/.test(req.path)) {
    next();
    return;
  }
  requireAnyPageAccess('create-user')(req, res, next);
});
app.use('/api/users', usersRouter);
app.use(
  '/api/activity-log',
  requireTenant,
  requireAnyPageAccess('activity-log'),
  auditLogRouter,
);
app.use('/api/service-packages', servicePackagesRouter);
app.use('/api/captcha', captchaLimiter, captchaRouter);
app.use('/api/remote-login', remoteLoginRouter);
app.use('/api/saas-accounts', (req, res, next) => {
  const numericAccountPath = /^\/\d+(?:\/resend-credentials)?$/.test(req.path);
  if (
    (req.method === 'GET' && req.path === '/') ||
    (numericAccountPath && ['GET', 'PATCH', 'DELETE', 'POST'].includes(req.method))
  ) {
    void requirePlatformAuth(req, res, next);
    return;
  }
  if (
    req.path.endsWith('/change-password') ||
    req.path.includes('/renew') ||
    req.path.includes('/webauthn/register/') ||
    req.path.endsWith('/webauthn/credentials') ||
    req.path.includes('/webauthn/credentials/')
  ) {
    void requireAuth(req, res, next);
    return;
  }
  next();
});
app.post(
  '/api/saas-accounts/by-code/:code/login',
  loginBurstLimiter,
  failedLoginLimiter,
);
app.post(
  '/api/saas-accounts/by-code/:code/forgot-password',
  passwordResetLimiter,
);
app.post(
  '/api/saas-accounts/by-code/:code/change-password',
  authEnrollmentLimiter,
);
app.post(
  [
    '/api/saas-accounts/by-code/:code/webauthn/login/options',
    '/api/saas-accounts/by-code/:code/webauthn/login/verify',
  ],
  biometricLoginLimiter,
);
app.post(
  [
    '/api/saas-accounts/by-code/:code/webauthn/register/options',
    '/api/saas-accounts/by-code/:code/webauthn/register/verify',
  ],
  authEnrollmentLimiter,
);
app.delete(
  '/api/saas-accounts/by-code/:code/webauthn/credentials/:credentialId',
  authEnrollmentLimiter,
);
app.use('/api/saas-accounts', saasAccountsRouter);
app.use('/api/saas-accounts', webauthnRouter);
app.use('/api/whatsapp', (req, res, next) => {
  if (req.path === '/webhook') {
    next();
    return;
  }
  void requireAuth(req, res, next);
});
app.use('/api/whatsapp', whatsappRouter);
app.use('/api/platform-payment', platformPaymentRouter);
app.use(
  '/api/platform/server-stats',
  requirePlatformPageAccess('server-monitor'),
  serverStatsRouter,
);
app.use('/api/support', requireAuth, (req, _res, next) => {
  const actorUserId = req.auth?.actorUserId;
  if (actorUserId) {
    if (req.body && typeof req.body === 'object') {
      req.body.authorUserId = actorUserId;
    }
    req.query.authorUserId = String(actorUserId);
  }
  next();
});
app.use('/api/support', supportRouter);
app.use('/api/open/upi-pay', openUpiPayRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  const message = err instanceof Error ? err.message : 'Internal server error';
  if (message.includes('File too large')) {
    res.status(400).json({ error: 'Each file must be 200 KB or less' });
    return;
  }
  if (message.includes('request entity too large')) {
    res.status(413).json({ error: 'Request is too large' });
    return;
  }
  res.status(500).json({ error: 'Internal server error' });
});

if (hasClientBuild) {
  app.use(
    express.static(clientDist, {
      index: false,
      setHeaders(res, filePath) {
        const normalized = filePath.replace(/\\/g, '/');
        if (normalized.includes('/assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          return;
        }
        if (/\.(?:webp|jpe?g|png|svg|ico|woff2?)$/i.test(normalized)) {
          res.setHeader('Cache-Control', 'public, max-age=604800');
          return;
        }
        if (normalized.endsWith('/index.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    }),
  );
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      next();
      return;
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

void ensureSchema()
  .then(() => {
    app.listen(port, '0.0.0.0', () => {
      console.log(`Server running at http://0.0.0.0:${port}`);
      if (hasClientBuild) {
        console.log(`Serving client from ${clientDist}`);
      }
      startSubscriptionExpiryReminders();
      startSubscriptionChatExpiryReminders();
      startPassExpiryReminders();
      startServerMonitorSampler();
      startDashboardSnapshotWorker();
    });
  })
  .catch((err) => {
    console.error('[schema] Failed to initialize required database security schema', err);
    process.exitCode = 1;
  });
