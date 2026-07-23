import { Router, Request, Response } from 'express';
import { getAuth } from '@clerk/express';
import { requireAuth } from '../middleware/requireAuth';
import { listMemories, deleteMemory } from '../db/memories.repo';

const router = Router();

router.use(requireAuth);

router.get('/memories', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  res.json(listMemories(userId as string));
});

router.delete('/memories/:id', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  deleteMemory(Number(req.params.id), userId as string);
  res.status(204).end();
});

export default router;
