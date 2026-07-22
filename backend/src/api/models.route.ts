import { Router, Request, Response } from 'express';

const router = Router();

router.get('/models', async (req: Request, res: Response) => {
  try {
    const response = await fetch('http://localhost:11434/api/tags');
    if (!response.ok) {
      res.status(response.status).json({ error: 'Failed to fetch models from Ollama' });
      return;
    }
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({ error: 'Failed to connect to local Ollama instance' });
  }
});

export default router;
