import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { saveConnectorKey, removeConnectorKey, listConnectorStatuses, Provider, KNOWN_PROVIDERS } from '../db/connectors.repo';

const router = Router();

function isKnownProvider(value: unknown): value is Provider {
  return typeof value === 'string' && KNOWN_PROVIDERS.some(p => p.id === value);
}

router.get('/connectors', requireAuth, (req: Request, res: Response) => {
  res.json(listConnectorStatuses());
});

router.post('/connectors', requireAuth, (req: Request, res: Response) => {
  const { provider, apiKey } = req.body;
  if (!isKnownProvider(provider)) {
    res.status(400).json({ error: 'Unknown provider' });
    return;
  }
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    res.status(400).json({ error: 'apiKey is required' });
    return;
  }
  saveConnectorKey(provider, apiKey.trim());
  res.status(201).json({ ok: true });
});

router.delete('/connectors/:provider', requireAuth, (req: Request, res: Response) => {
  const { provider } = req.params;
  if (!isKnownProvider(provider)) {
    res.status(400).json({ error: 'Unknown provider' });
    return;
  }
  removeConnectorKey(provider);
  res.status(204).end();
});

export default router;
