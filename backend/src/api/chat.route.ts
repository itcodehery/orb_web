import { Router, Request, Response } from 'express';
import { Agent } from '../agent/Agent';
import { Ollama } from '../llm/Ollama';
import { ToolRegistry } from '../tools/registry';
import { ToolExecutor } from '../agent/ToolExecutor';
import { BashTool } from '../tools/BashTool';
import { FsTool } from '../tools/FsTool';
import { WebSearchTool } from '../tools/WebSearchTool';
import { resolvePerformanceMode } from '../llm/performanceModes';

const router = Router();

// Initialize global dependencies (Dependency Injection)
const registry = new ToolRegistry();
registry.register(new BashTool());
registry.register(new FsTool());
registry.register(new WebSearchTool());

const executor = new ToolExecutor(registry);

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
