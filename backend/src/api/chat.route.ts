import { Router, Request, Response } from 'express';
import { getAuth } from '@clerk/express';
import { Agent } from '../agent/Agent';
import { createLLM } from '../llm/factory';
import { registry, executor } from '../agent/sharedInstances';
import { resolvePerformanceMode } from '../llm/performanceModes';
import { validChatMode, buildPolicyResolver } from '../agent/chatMode';
import { TOOL_USE_DIRECTIVE } from '../agent/systemPrompt';
import { requireAuth } from '../middleware/requireAuth';
import { listMemories } from '../db/memories.repo';
import { getActiveSession, createActiveSession, upsertActiveMessages } from '../db/sessions.repo';
import { analyzeChat } from '../agent/postChatAnalysis';

const router = Router();

router.post('/chat', requireAuth, async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    const { messages, model = 'llama3.1', systemPrompt, toolPolicies, performanceMode, chatMode, outputLimitTokens } = req.body;

    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: 'Messages array is required' });
      return;
    }

    const session = getActiveSession(userId as string) || createActiveSession(userId as string);
    const messageIndex = messages.length;
    const requestStartedAt = Date.now();

    const existingFacts = listMemories(userId as string).map(m => m.content);
    let combinedSystemPrompt = (existingFacts.length
      ? `${systemPrompt}\n\n## What you know about this user (from past conversations):\n${existingFacts.map(f => `- ${f}`).join('\n')}`
      : systemPrompt) + TOOL_USE_DIRECTIVE;

    const limit = typeof outputLimitTokens === 'number' && outputLimitTokens > 0 ? outputLimitTokens : undefined;
    if (limit) {
      combinedSystemPrompt += `\n\nKeep your response within approximately ${limit} tokens (roughly ${Math.round(limit * 0.75)} words). Wrap up your answer naturally before hitting this budget rather than trailing off mid-thought.`;
    }

    const mode = resolvePerformanceMode(performanceMode);
    const llm = createLLM(model, mode, limit);
    const agent = new Agent(llm, registry, executor);

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');

    const getPolicyStatus = buildPolicyResolver(validChatMode(chatMode), toolPolicies);

    const streamCallback = (chunk: any) => {
      if (!res.writableEnded) res.write(JSON.stringify(chunk) + '\n');
    };

    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    const { finalReply } = await agent.run(messages, combinedSystemPrompt, streamCallback, getPolicyStatus, mode, abortController.signal);

    if (!res.writableEnded) res.end();

    if (finalReply) {
      const lastUserMessage = [...messages].reverse().find((m: any) => m.role === 'user');
      const assistantMessage = { role: 'assistant', content: finalReply, totalMs: Date.now() - requestStartedAt };
      upsertActiveMessages(session.id, userId as string, [...messages, assistantMessage]);

      if (lastUserMessage?.content) {
        analyzeChat(userId as string, model, session.id, messageIndex, existingFacts, lastUserMessage.content, finalReply).catch(err => {
          console.error('Post-chat analysis failed:', err);
        });
      }
    }
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      if (!res.writableEnded) res.end();
      return;
    }
    console.error('Error in chat route:', error);
    if (!res.writableEnded) {
      res.write(JSON.stringify({ type: 'error', error: error.message }) + '\n');
      res.end();
    }
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
