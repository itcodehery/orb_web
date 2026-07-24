import { Router, Request, Response } from 'express';
import { Agent } from '../../agent/Agent';
import { createLLM } from '../../llm/factory';
import { registry, executor } from '../../agent/sharedInstances';
import { resolvePerformanceMode } from '../../llm/performanceModes';
import { apiKeyAuth } from '../../middleware/apiKeyAuth';
import { insertLog } from '../../db/auditLog.repo';
import { TOOL_USE_DIRECTIVE } from '../../agent/systemPrompt';
import { Message, ToolCall } from '../../types';

const router = Router();

const TOOL_NAMES_BY_FLAG: Record<'fs' | 'bash' | 'web', string[]> = {
  fs: ['read_file', 'write_file', 'list_directory'],
  bash: ['execute_bash'],
  web: ['web_search'],
};

router.post('/chat', apiKeyAuth, async (req: Request, res: Response) => {
  const startedAt = Date.now();
  const apiKey = req.apiKey!;
  const { messages, model = 'llama3.1', systemPrompt, performanceMode } = req.body;

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'Messages array is required' });
    return;
  }

  const mode = resolvePerformanceMode(performanceMode);
  const llm = createLLM(model, mode);
  const agent = new Agent(llm, registry, executor);
  const combinedSystemPrompt = (systemPrompt || '') + TOOL_USE_DIRECTIVE;

  const enabledToolNames = new Set(
    (Object.keys(TOOL_NAMES_BY_FLAG) as Array<'fs' | 'bash' | 'web'>)
      .filter((flag) => apiKey.tools[flag])
      .flatMap((flag) => TOOL_NAMES_BY_FLAG[flag])
  );

  const policyDecisions: Record<string, string> = {};
  const getPolicyStatus = (toolName: string) => {
    const status = enabledToolNames.has(toolName) ? 'Allowed' : 'Blocked';
    policyDecisions[toolName] = status;
    return status;
  };

  let responseContent = '';
  const toolCallsLog: ToolCall[] = [];
  const toolResultsLog: { name: string; result: string }[] = [];
  let statusCode = 200;

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');

  const streamCallback = (chunk: any) => {
    if (chunk.type === 'content_chunk') {
      responseContent += chunk.content;
    } else if (chunk.type === 'tool_call_intent') {
      toolCallsLog.push(...chunk.toolCalls);
    } else if (chunk.type === 'tool_result') {
      toolResultsLog.push({ name: chunk.name, result: chunk.result });
    } else if (chunk.type === 'error') {
      statusCode = 500;
    }
    res.write(JSON.stringify(chunk) + '\n');
  };

  try {
    await agent.run(messages as Message[], combinedSystemPrompt, streamCallback, getPolicyStatus, mode);
  } catch (error: any) {
    statusCode = 500;
    streamCallback({ type: 'error', error: error.message });
  } finally {
    res.end();
    insertLog({
      api_key_id: apiKey.id,
      timestamp: new Date(startedAt).toISOString(),
      endpoint: '/api/v1/chat',
      model,
      request_messages: messages,
      response_content: responseContent,
      tool_calls: toolCallsLog,
      tool_results: toolResultsLog,
      policy_decisions: policyDecisions,
      latency_ms: Date.now() - startedAt,
      tokens_in: null,
      tokens_out: null,
      status_code: statusCode,
    });
  }
});

export default router;
