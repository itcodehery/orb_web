import { Router, Request, Response } from 'express';
import { createKey, listKeys, revokeKey, updateKeyTools, ToolsEnabled } from '../db/apiKeys.repo';
import { listLogs } from '../db/auditLog.repo';

const router = Router();

function parseTools(body: any): ToolsEnabled {
  return {
    fs: !!body?.tools?.fs,
    bash: !!body?.tools?.bash,
    web: !!body?.tools?.web,
  };
}

router.post('/keys', (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const created = createKey(name, parseTools(req.body));
  res.status(201).json(created);
});

router.get('/keys', (req: Request, res: Response) => {
  res.json(listKeys());
});

router.delete('/keys/:id', (req: Request, res: Response) => {
  revokeKey(Number(req.params.id));
  res.status(204).end();
});

router.patch('/keys/:id/tools', (req: Request, res: Response) => {
  updateKeyTools(Number(req.params.id), parseTools(req.body));
  res.json({ ok: true });
});

router.get('/audit-logs', (req: Request, res: Response) => {
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  res.json(listLogs(limit));
});

export default router;
