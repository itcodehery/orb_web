import { Request, Response, NextFunction } from 'express';
import { verifyKey, ApiKeySummary } from '../db/apiKeys.repo';

declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKeySummary;
    }
  }
}

export function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match ? match[1] : null;

  if (!token) {
    res.status(401).json({ error: 'Invalid or missing API key' });
    return;
  }

  const key = verifyKey(token);
  if (!key) {
    res.status(401).json({ error: 'Invalid or missing API key' });
    return;
  }

  req.apiKey = key;
  next();
}
