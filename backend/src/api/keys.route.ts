import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { createKey, listKeys, revokeKey, updateKeyTools, ToolsEnabled } from '../db/apiKeys.repo';
import { listLogs, getAnalyticsSummary } from '../db/auditLog.repo';

const router = Router();

function parseTools(body: any): ToolsEnabled {
  return {
    fs: !!body?.tools?.fs,
    bash: !!body?.tools?.bash,
    web: !!body?.tools?.web,
  };
}

// Key management and audit logs are sensitive — only a signed-in Clerk user may touch them.
// requireAuth is applied per-route (not router.use) so it can't accidentally intercept
// requests meant for other routers sharing the '/api' mount prefix.
router.post('/keys', requireAuth, (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const created = createKey(name, parseTools(req.body));
  res.status(201).json(created);
});

router.get('/keys', requireAuth, (req: Request, res: Response) => {
  res.json(listKeys());
});

router.delete('/keys/:id', requireAuth, (req: Request, res: Response) => {
  revokeKey(Number(req.params.id));
  res.status(204).end();
});

router.patch('/keys/:id/tools', requireAuth, (req: Request, res: Response) => {
  updateKeyTools(Number(req.params.id), parseTools(req.body));
  res.json({ ok: true });
});

router.get('/audit-logs', requireAuth, (req: Request, res: Response) => {
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  res.json(listLogs(limit));
});

router.get('/analytics/summary', requireAuth, (req: Request, res: Response) => {
  const hours = req.query.hours ? Number(req.query.hours) : 24;
  res.json(getAnalyticsSummary(hours));
});

export default router;
