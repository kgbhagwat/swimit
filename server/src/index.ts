import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registrationsRouter } from './routes/registrations.js';
import { staffRegistrationsRouter } from './routes/staffRegistrations.js';
import { batchesRouter } from './routes/batches.js';
import { passTypesRouter } from './routes/passTypes.js';
import { poolExpensesRouter } from './routes/poolExpenses.js';
import { waterQualityRouter } from './routes/waterQuality.js';
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
import { supportRouter } from './routes/support.js';
import { auditLogRouter } from './routes/auditLog.js';
import { captchaRouter } from './routes/captcha.js';
import { remoteLoginRouter } from './routes/remoteLogin.js';
import { requireTenant } from './middleware/tenant.js';
import { ensureSchema } from './ensureSchema.js';
import { startSubscriptionExpiryReminders } from './subscriptionReminders.js';
import { startSubscriptionChatExpiryReminders } from './subscriptionChatReminders.js';
import { startPassExpiryReminders } from './passExpiryReminders.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT ?? 4000);
const corsOrigin = process.env.CORS_ORIGIN ?? true;
const clientDist = path.resolve(__dirname, '../../client/dist');
const hasClientBuild = fs.existsSync(path.join(clientDist, 'index.html'));

app.use(cors({ origin: corsOrigin === 'true' ? true : corsOrigin }));
app.use(express.json());
const uploadsDir = path.resolve(__dirname, '../uploads');
app.use('/uploads', (req, res, next) => {
  // Sealed identity proofs must only be served via authenticated API routes.
  if (String(req.path).toLowerCase().endsWith('.enc')) {
    res.status(404).end();
    return;
  }
  next();
});
app.use('/uploads', express.static(uploadsDir));

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

app.use('/api/registrations', requireTenant, registrationsRouter);
app.use('/api/staff-registrations', requireTenant, staffRegistrationsRouter);
app.use('/api/batches', requireTenant, batchesRouter);
app.use('/api/pass-types', requireTenant, passTypesRouter);
app.use('/api/pool-expenses', requireTenant, poolExpensesRouter);
app.use('/api/water-quality', requireTenant, waterQualityRouter);
app.use('/api/pass-scan', requireTenant, passScanRouter);
app.use('/api/coach-payment', requireTenant, coachPaymentRouter);
app.use('/api/attendance-sheet', requireTenant, attendanceSheetRouter);
app.use('/api/balance-sheet', requireTenant, balanceSheetRouter);
app.use('/api/dashboard', requireTenant, dashboardRouter);
app.use('/api/pool-core-info', requireTenant, poolCoreInfoRouter);
app.use('/api/holidays', requireTenant, holidaysRouter);
app.use('/api/users', requireTenant, usersRouter);
app.use('/api/activity-log', requireTenant, auditLogRouter);
app.use('/api/service-packages', servicePackagesRouter);
app.use('/api/captcha', captchaRouter);
app.use('/api/remote-login', remoteLoginRouter);
app.use('/api/saas-accounts', saasAccountsRouter);
app.use('/api/saas-accounts', webauthnRouter);
app.use('/api/whatsapp', whatsappRouter);
app.use('/api/platform-payment', platformPaymentRouter);
app.use('/api/support', supportRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  const message = err instanceof Error ? err.message : 'Internal server error';
  if (message.includes('File too large')) {
    res.status(400).json({ error: 'Each photo must be 200 KB or less' });
    return;
  }
  res.status(500).json({ error: message });
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
  .catch((err) => {
    console.error('[schema] Failed to ensure login/geo columns', err);
  })
  .finally(() => {
    app.listen(port, '0.0.0.0', () => {
      console.log(`Server running at http://0.0.0.0:${port}`);
      if (hasClientBuild) {
        console.log(`Serving client from ${clientDist}`);
      }
      startSubscriptionExpiryReminders();
      startSubscriptionChatExpiryReminders();
      startPassExpiryReminders();
    });
  });
