import { Router, Request, Response } from 'express';
import { getAuth } from '@clerk/express';
import { requireAuth } from '../middleware/requireAuth';
import {
  getActiveSession,
  patchSettings,
  completeActiveSession,
  listSessions,
  getSession,
  resumeSession,
} from '../db/sessions.repo';

const router = Router();

// NOTE: /active and /active/complete must be registered before /:id and
// /:id/resume, or Express would match "active" as an :id param.

router.get('/sessions/active', requireAuth, (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  res.json(getActiveSession(userId as string));
});

router.patch('/sessions/active', requireAuth, (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const { policies, settings } = req.body;
  res.json(patchSettings(userId as string, { policies, settings }));
});

router.post('/sessions/active/complete', requireAuth, (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  completeActiveSession(userId as string);
  res.status(204).end();
});

router.get('/sessions', requireAuth, (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  res.json(listSessions(userId as string));
});

router.get('/sessions/:id', requireAuth, (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const session = getSession(Number(req.params.id), userId as string);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json(session);
});

router.post('/sessions/:id/resume', requireAuth, (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const session = resumeSession(Number(req.params.id), userId as string);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json(session);
});

export default router;
