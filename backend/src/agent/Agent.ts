import { LLM } from '../llm/LLM';
import { ToolRegistry } from '../tools/registry';
import { ToolExecutor } from './ToolExecutor';
import { Message, ToolCall } from '../types';
import { PerformanceMode, PERFORMANCE_PROFILES } from '../llm/performanceModes';

export class Agent {
  constructor(
    private llm: LLM,
    private registry: ToolRegistry,
    private executor: ToolExecutor
  ) {}

  /**
   * The core Reason-Act-Observe loop with streaming support and policy handling.
   */
  async run(
    messages: Message[],
    systemPrompt: string,
    streamCallback: (chunk: any) => void,
    getPolicyStatus: (toolName: string) => string,
    performanceMode: PerformanceMode = 'high'
  ) {
    let currentMessages = [...messages];

    const { maxHistoryMessages } = PERFORMANCE_PROFILES[performanceMode];
    if (maxHistoryMessages && currentMessages.length > maxHistoryMessages) {
      currentMessages = currentMessages.slice(-maxHistoryMessages);
    }

    while (true) {
      const responseStream = await this.llm.chatStream(
        currentMessages,
        this.registry.getSchemas(),
        systemPrompt
      );

      let fullContent = '';
      let toolCalls: ToolCall[] = [];
      let contextTokens = 0;

      const decoder = new TextDecoder('utf-8');

      // Async iterator over the web stream
      for await (const chunk of (responseStream as any)) {
        const decoded = decoder.decode(chunk, { stream: true });
        const lines = decoded.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.message) {
              if (data.message.content) {
                fullContent += data.message.content;
                // Stream content fragment back to client
                streamCallback({ type: 'content_chunk', content: data.message.content });
              }
              if (data.message.tool_calls) {
                // Assuming Ollama streams tool calls either fully or we just take the last accumulated array.
                // Usually Ollama's tool_calls come fully formed in the last chunks if using non-streaming,
                // but in streaming it might accumulate them. We will just capture the ones sent.
                toolCalls = data.message.tool_calls;
              }
            }
            // Ollama's final chunk (done: true) reports how many tokens of the
            // context window this turn actually used.
            if (data.done && typeof data.prompt_eval_count === 'number') {
              contextTokens = data.prompt_eval_count + (data.eval_count || 0);
            }
          } catch (e) {
            // Ignore parse errors on incomplete chunks
          }
        }
      }

      // If the LLM replied with content, record it
      if (fullContent) {
        currentMessages.push({ role: 'assistant', content: fullContent });
      }

      // Handle tool calls
      if (toolCalls && toolCalls.length > 0) {
        // Record assistant's tool call intent
        currentMessages.push({ role: 'assistant', content: '', tool_calls: toolCalls });
        
        streamCallback({ type: 'tool_call_intent', toolCalls });

        for (const toolCall of toolCalls) {
          const policy = getPolicyStatus(toolCall.function.name);

          if (policy === 'Blocked') {
            const blockMsg = `Action Blocked: Policy enforces blocking for ${toolCall.function.name}.`;
            currentMessages.push({ role: 'tool', name: toolCall.function.name, content: blockMsg });
            streamCallback({ type: 'tool_result', name: toolCall.function.name, result: blockMsg });
          } else if (policy === 'Requires Approval') {
            // Pause loop and yield back to client
            streamCallback({ type: 'requires_approval', toolCall });
            // End the current run. The client must resume.
            return;
          } else {
            // Execute immediately
            const result = await this.executor.execute(toolCall);
            currentMessages.push({ role: 'tool', name: toolCall.function.name, content: result });
            streamCallback({ type: 'tool_result', name: toolCall.function.name, result });
          }
        }

        // Loop continues because we have new tool results to feed back to the LLM
        continue;
      }

      // No tool calls, meaning the LLM has given its final answer
      streamCallback({ type: 'done', contextTokens });
      break;
    }
  }
}
