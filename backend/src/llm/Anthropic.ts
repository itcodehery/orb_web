import Anthropic from '@anthropic-ai/sdk';
import { Readable } from 'stream';
import { LLM } from './LLM';
import { Message, ToolSchema, LLMResponse, ToolCall } from '../types';
import { getConnectorKey } from '../db/connectors.repo';

function toAnthropicTools(tools?: ToolSchema[]): Anthropic.Tool[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map(t => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
}

function parseArgs(args: string | undefined): any {
  if (!args) return {};
  try {
    return typeof args === 'string' ? JSON.parse(args) : args;
  } catch {
    return {};
  }
}

function toAnthropicMessages(messages: Message[]): Anthropic.MessageParam[] {
  const result: Anthropic.MessageParam[] = [];
  for (const m of messages) {
    if (m.role === 'system') continue; // system is a separate top-level param
    if (m.role === 'user') {
      result.push({ role: 'user', content: m.content || '' });
    } else if (m.role === 'assistant') {
      if (m.tool_calls && m.tool_calls.length > 0) {
        const blocks: Anthropic.ContentBlockParam[] = [];
        if (m.content) blocks.push({ type: 'text', text: m.content });
        for (const tc of m.tool_calls) {
          blocks.push({
            type: 'tool_use',
            id: tc.id || `call_${Math.random().toString(36).slice(2)}`,
            name: tc.function.name,
            input: parseArgs(tc.function.arguments),
          });
        }
        result.push({ role: 'assistant', content: blocks });
      } else {
        result.push({ role: 'assistant', content: m.content || '' });
      }
    } else if (m.role === 'tool') {
      // Anthropic has no 'tool' role — a tool result is a user message
      // containing a tool_result block correlated by tool_use_id.
      result.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: m.tool_call_id || m.name || 'unknown', content: m.content || '' }],
      });
    }
  }
  return result;
}

/**
 * Second LLM provider alongside Ollama, selected when the model name is
 * prefixed with 'claude-' (see llm/factory.ts). API key resolved via
 * db/connectors.repo.ts — a key saved through the Connectors UI, falling
 * back to the ANTHROPIC_API_KEY env var.
 *
 * chatStream() intentionally does NOT do true token-by-token streaming: it
 * calls the non-streaming Messages API and synthesizes a single Ollama-shaped
 * NDJSON chunk, so Agent.ts's Ollama-wire-format parser works unchanged. This
 * trades live token streaming for Claude responses (they arrive as one
 * chunk instead of progressively) for a much smaller, easier-to-verify
 * implementation. Upgrading to true streaming (translating Anthropic's SSE
 * events) is a known follow-up, not done here.
 */
export class AnthropicLLM implements LLM {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(model: string = 'claude-sonnet-5', maxTokens: number = 4096) {
    this.client = new Anthropic({ apiKey: getConnectorKey('anthropic') });
    this.model = model;
    this.maxTokens = maxTokens;
  }

  async chat(messages: Message[], tools?: ToolSchema[], systemPrompt?: string): Promise<LLMResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: systemPrompt,
      messages: toAnthropicMessages(messages),
      tools: toAnthropicTools(tools),
    });

    let text = '';
    const toolCalls: ToolCall[] = [];
    for (const block of response.content) {
      if (block.type === 'text') text += block.text;
      if (block.type === 'tool_use') {
        toolCalls.push({ id: block.id, type: 'function', function: { name: block.name, arguments: JSON.stringify(block.input) } });
      }
    }
    return { text: text || undefined, toolCalls: toolCalls.length ? toolCalls : undefined };
  }

  async chatStream(messages: Message[], tools?: ToolSchema[], systemPrompt?: string, signal?: AbortSignal): Promise<NodeJS.ReadableStream> {
    const response = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages: toAnthropicMessages(messages),
        tools: toAnthropicTools(tools),
      },
      { signal }
    );

    let text = '';
    const toolCalls: ToolCall[] = [];
    for (const block of response.content) {
      if (block.type === 'text') text += block.text;
      if (block.type === 'tool_use') {
        toolCalls.push({ id: block.id, type: 'function', function: { name: block.name, arguments: JSON.stringify(block.input) } });
      }
    }

    const lines: string[] = [];
    if (text || toolCalls.length) {
      lines.push(JSON.stringify({ message: { content: text || undefined, tool_calls: toolCalls.length ? toolCalls : undefined } }));
    }
    lines.push(JSON.stringify({ done: true, prompt_eval_count: response.usage.input_tokens, eval_count: response.usage.output_tokens }));

    const stream = new Readable({ read() {} });
    stream.push(Buffer.from(lines.join('\n') + '\n', 'utf-8'));
    stream.push(null);
    return stream as any;
  }
}
