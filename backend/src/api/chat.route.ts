import { Router, Request, Response } from 'express';
import { Agent } from '../agent/Agent';
import { Ollama } from '../llm/Ollama';
import { registry, executor } from '../agent/sharedInstances';
import { resolvePerformanceMode } from '../llm/performanceModes';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

router.use(requireAuth);

router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { messages, model = 'llama3.1', systemPrompt, toolPolicies, performanceMode } = req.body;

    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: 'Messages array is required' });
      return;
    }

    const mode = resolvePerformanceMode(performanceMode);
    const llm = new Ollama(model, mode);
    const agent = new Agent(llm, registry, executor);

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');

    const getPolicyStatus = (toolName: string) => {
      // toolPolicies could be an object mapping tool names to statuses
      // e.g., { 'execute_bash': 'Requires Approval', 'read_file': 'Allowed' }
      if (toolPolicies && toolPolicies[toolName]) {
        return toolPolicies[toolName];
      }
      return 'Allowed'; // Default policy
    };

    const streamCallback = (chunk: any) => {
      res.write(JSON.stringify(chunk) + '\n');
    };

    await agent.run(messages, systemPrompt, streamCallback, getPolicyStatus, mode);
    
    res.end();
  } catch (error: any) {
    console.error('Error in chat route:', error);
    res.write(JSON.stringify({ type: 'error', error: error.message }) + '\n');
    res.end();
  }
});

router.post('/execute_tool', async (req: Request, res: Response) => {
  try {
    const { tool_name, arguments: args } = req.body;
    
    // Execute a single tool call directly, useful for resuming after manual approval
    const result = await executor.execute({
      type: 'function',
      function: {
        name: tool_name,
        arguments: args
      }
    });

    res.json({ result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
