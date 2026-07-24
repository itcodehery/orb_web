import { LLM } from './LLM';
import { Message, ToolSchema, LLMResponse, ToolCall } from '../types';
import { PerformanceMode, PERFORMANCE_PROFILES, DEFAULT_PERFORMANCE_MODE, computeNumPredictBackstop } from './performanceModes';

export class Ollama implements LLM {
  private baseUrl = 'http://localhost:11434';
  private model: string;
  private performanceMode: PerformanceMode;
  private outputLimitTokens?: number;

  constructor(model: string = 'llama3.1', performanceMode: PerformanceMode = DEFAULT_PERFORMANCE_MODE, outputLimitTokens?: number) {
    this.model = model;
    this.performanceMode = performanceMode;
    this.outputLimitTokens = outputLimitTokens;
  }

  async chat(messages: Message[], tools?: ToolSchema[], systemPrompt?: string): Promise<LLMResponse> {
    const systemMessage = systemPrompt ? [{ role: 'system', content: systemPrompt }] : [];
    const profile = PERFORMANCE_PROFILES[this.performanceMode];

    const requestBody: any = {
      model: this.model,
      messages: [...systemMessage, ...messages],
      stream: false,
      options: profile.options,
      keep_alive: profile.keepAlive,
    };

    if (tools && tools.length > 0) {
      requestBody.tools = tools;
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${await response.text()}`);
    }

    const data = await response.json();
    const responseMessage = data.message;

    return {
      text: responseMessage.content,
      toolCalls: responseMessage.tool_calls
    };
  }

  async chatStream(messages: Message[], tools?: ToolSchema[], systemPrompt?: string, signal?: AbortSignal): Promise<NodeJS.ReadableStream> {
    const systemMessage = systemPrompt ? [{ role: 'system', content: systemPrompt }] : [];
    const profile = PERFORMANCE_PROFILES[this.performanceMode];

    const requestBody: any = {
      model: this.model,
      messages: [...systemMessage, ...messages],
      stream: true,
      options: {
        ...profile.options,
        num_predict: computeNumPredictBackstop(this.performanceMode, this.outputLimitTokens),
      },
      keep_alive: profile.keepAlive,
    };

    if (tools && tools.length > 0) {
      requestBody.tools = tools;
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal,
    });

    if (!response.ok || !response.body) {
      const errorText = await response.text();
      throw new Error(`Ollama error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    // Node fetch polyfill or native fetch body is a ReadableStream (web stream)
    // We need to convert it to a Node Readable stream if we are in Node 18+ native fetch
    // Alternatively, we can just return the native web stream and consume it with async iterators.
    return response.body as any; // We will use async iterators in the Agent
  }
}
