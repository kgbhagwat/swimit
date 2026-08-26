import { parentPort } from 'node:worker_threads';
import { Pool } from 'pg';
import { buildDashboardSnapshot } from './dashboardSnapshot.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

/** Dedicated pool so snapshot queries do not use the main API pool. */
const snapshotPool = new Pool({
  connectionString,
  max: 4,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  options: '-c timezone=Asia/Kolkata',
});

type BuildMessage = {
  type: 'build';
  id: number;
  accountId: number;
  asOf: string;
};

if (!parentPort) {
  throw new Error('dashboard snapshot worker must run as a worker thread');
}

let chain = Promise.resolve();

parentPort.on('message', (message: BuildMessage) => {
  if (!message || message.type !== 'build') return;
  const { id, accountId, asOf } = message;
  chain = chain
    .then(() => buildDashboardSnapshot(snapshotPool, accountId, asOf))
    .then((snapshot) => {
      parentPort?.postMessage({ type: 'result', id, ok: true, snapshot });
    })
    .catch((err) => {
      parentPort?.postMessage({
        type: 'result',
        id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    });
});
