import { Request, Response, NextFunction } from 'express';
import { getAuth } from '@clerk/express';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const { isAuthenticated } = getAuth(req);
  if (!isAuthenticated) {
    res.status(401).json({ error: 'Sign in required' });
    return;
  }
  next();
}
