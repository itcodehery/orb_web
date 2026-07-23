import { Router, Request, Response } from 'express';
import os from 'os';

const router = Router();

router.get('/system-info', (req: Request, res: Response) => {
  const cpuCores = os.cpus().length;
  const totalMemGB = os.totalmem() / (1024 ** 3);
  const recommendedMode = cpuCores >= 8 && totalMemGB >= 16 ? 'high' : 'low';

  res.json({
    cpuCores,
    totalMemGB: Math.round(totalMemGB * 10) / 10,
    recommendedMode,
  });
});

export default router;
