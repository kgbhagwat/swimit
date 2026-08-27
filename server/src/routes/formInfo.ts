import { Router } from 'express';
import { recordAudit } from '../auditLog.js';
import { getFormRules, saveFormRules } from '../formInfoRules.js';
import { tenantId } from '../middleware/tenant.js';

export const formInfoRouter = Router();

formInfoRouter.get('/', async (req, res) => {
  try {
    const rules = await getFormRules(tenantId(req));
    res.json(rules);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load form info' });
  }
});

formInfoRouter.put('/', async (req, res) => {
  try {
    if (req.publicTenantAccess) {
      res.status(403).json({ error: 'Sign in to edit form info' });
      return;
    }
    const rules = await saveFormRules(tenantId(req), req.body);
    await recordAudit(req, {
      action: 'update',
      entityType: 'form_info',
      entityId: String(tenantId(req)),
      summary: 'Updated form field requirements',
    });
    res.json(rules);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save form info' });
  }
});
