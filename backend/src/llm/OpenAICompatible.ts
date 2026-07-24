import { Readable } from 'stream';
import { LLM } from './LLM';
import { Message, ToolSchema, LLMResponse, ToolCall } from '../types';

export interface OpenAICompatibleConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
}

/**
 * Generic connector for any OpenAI-Chat-Completions-compatible API — OpenAI
 * itself, Groq, Mistral, and many others expose this exact wire format, so
 * one class covers all of them via a configurable baseUrl (see
 * llm/factory.ts). Our internal Message/ToolSchema/ToolCall types already
 * mirror this shape (Ollama's own tool-calling format is itself
 * OpenAI-compatible), so unlike Anthropic there's almost no translation
 * layer needed here.
 *
 * Same non-streaming-internally compromise as Anthropic.ts, for the same
 * reason: calls the API with stream:false and synthesizes a single
 * Ollama-shaped NDJSON chunk rather than parsing SSE deltas — tool-call
 * argument fragments arrive incrementally across SSE events and are
 * meaningfully more complex to reassemble correctly than a single response.
 * Not live-tested — no API keys configured in this environment.
 */
export class OpenAICompatibleLLM implements LLM {
  constructor(private config: OpenAICompatibleConfig) {}

  private async complete(messages: Message[], tools?: ToolSchema[], systemPrompt?: string, signal?: AbortSignal) {
    const body: any = {
      model: this.config.model,
      messages: systemPrompt ? [{ role: 'system', content: systemPrompt }, ...messages] : messages,
      stream: false,
    };
    if (tools && tools.length > 0) body.tools = tools;

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey || ''}`,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      throw new Error(`${this.config.baseUrl} error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;
    const toolCalls: ToolCall[] = (message?.tool_calls || []).map((tc: any) => ({
      id: tc.id,
      type: 'function' as const,
      function: { name: tc.function.name, arguments: tc.function.arguments },
    }));
    return {
      text: message?.content || undefined,
      toolCalls: toolCalls.length ? toolCalls : undefined,
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
    };
  }

  async chat(messages: Message[], tools?: ToolSchema[], systemPrompt?: string): Promise<LLMResponse> {
    const { text, toolCalls } = await this.complete(messages, tools, systemPrompt);
    return { text, toolCalls };
  }

  async chatStream(messages: Message[], tools?: ToolSchema[], systemPrompt?: string, signal?: AbortSignal): Promise<NodeJS.ReadableStream> {
    const { text, toolCalls, promptTokens, completionTokens } = await this.complete(messages, tools, systemPrompt, signal);

    const lines: string[] = [];
    if (text || (toolCalls && toolCalls.length)) {
      lines.push(JSON.stringify({ message: { content: text, tool_calls: toolCalls } }));
    }
    lines.push(JSON.stringify({ done: true, prompt_eval_count: promptTokens, eval_count: completionTokens }));

    const stream = new Readable({ read() {} });
    stream.push(Buffer.from(lines.join('\n') + '\n', 'utf-8'));
    stream.push(null);
    return stream as any;
  }
}
