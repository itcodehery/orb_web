import { Router, Request, Response } from 'express';
import { getAuth } from '@clerk/express';
import { Agent } from '../agent/Agent';
import { Ollama } from '../llm/Ollama';
import { registry, executor } from '../agent/sharedInstances';
import { resolvePerformanceMode } from '../llm/performanceModes';
import { requireAuth } from '../middleware/requireAuth';
import { listMemories } from '../db/memories.repo';
import { extractAndSaveMemories } from '../agent/memoryExtractor';

const router = Router();

router.post('/chat', requireAuth, async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    const { messages, model = 'llama3.1', systemPrompt, toolPolicies, performanceMode } = req.body;

    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: 'Messages array is required' });
      return;
    }

    const existingFacts = listMemories(userId as string).map(m => m.content);
    const combinedSystemPrompt = existingFacts.length
      ? `${systemPrompt}\n\n## What you know about this user (from past conversations):\n${existingFacts.map(f => `- ${f}`).join('\n')}`
      : systemPrompt;

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

    const { finalReply } = await agent.run(messages, combinedSystemPrompt, streamCallback, getPolicyStatus, mode);

    res.end();

    if (finalReply) {
      const lastUserMessage = [...messages].reverse().find((m: any) => m.role === 'user');
      if (lastUserMessage?.content) {
        extractAndSaveMemories(userId as string, model, existingFacts, lastUserMessage.content, finalReply).catch(err => {
          console.error('Memory extraction failed:', err);
        });
      }
    }
  } catch (error: any) {
    console.error('Error in chat route:', error);
    res.write(JSON.stringify({ type: 'error', error: error.message }) + '\n');
    res.end();
  }
});

router.post('/execute_tool', requireAuth, async (req: Request, res: Response) => {
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
