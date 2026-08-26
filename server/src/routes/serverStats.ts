import { Router } from 'express';
import { collectAndRecordServerStats } from '../serverMonitor.js';

export const serverStatsRouter = Router();

serverStatsRouter.get('/', async (_req, res) => {
  try {
    const body = await collectAndRecordServerStats();
    res.json(body);
  } catch (err) {
    console.error('[server-stats]', err);
    res.status(500).json({
      error: 'Failed to load server stats',
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});
