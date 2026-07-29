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
import { passScanRouter } from './routes/passScan.js';
import { coachPaymentRouter } from './routes/coachPayment.js';
import { attendanceSheetRouter } from './routes/attendanceSheet.js';
import { balanceSheetRouter } from './routes/balanceSheet.js';
import { poolCoreInfoRouter } from './routes/poolCoreInfo.js';
import { holidaysRouter } from './routes/holidays.js';
import { usersRouter } from './routes/users.js';
import { servicePackagesRouter } from './routes/servicePackages.js';
import { saasAccountsRouter } from './routes/saasAccounts.js';
import { whatsappRouter } from './routes/whatsapp.js';
import { platformPaymentRouter } from './routes/platformPayment.js';
import { requireTenant } from './middleware/tenant.js';
import { startSubscriptionExpiryReminders } from './subscriptionReminders.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT ?? 4000);
const corsOrigin = process.env.CORS_ORIGIN ?? true;
const clientDist = path.resolve(__dirname, '../../client/dist');
const hasClientBuild = fs.existsSync(path.join(clientDist, 'index.html'));

app.use(cors({ origin: corsOrigin === 'true' ? true : corsOrigin }));
app.use(express.json());
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

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
app.use('/api/pass-scan', requireTenant, passScanRouter);
app.use('/api/coach-payment', requireTenant, coachPaymentRouter);
app.use('/api/attendance-sheet', requireTenant, attendanceSheetRouter);
app.use('/api/balance-sheet', requireTenant, balanceSheetRouter);
app.use('/api/pool-core-info', requireTenant, poolCoreInfoRouter);
app.use('/api/holidays', requireTenant, holidaysRouter);
app.use('/api/users', requireTenant, usersRouter);
app.use('/api/service-packages', servicePackagesRouter);
app.use('/api/saas-accounts', saasAccountsRouter);
app.use('/api/whatsapp', whatsappRouter);
app.use('/api/platform-payment', platformPaymentRouter);

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
  app.use(express.static(clientDist, { index: false }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      next();
      return;
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${port}`);
  if (hasClientBuild) {
    console.log(`Serving client from ${clientDist}`);
  }
  startSubscriptionExpiryReminders();
});
