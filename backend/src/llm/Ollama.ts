import { LLM } from './LLM';
import { Message, ToolSchema, LLMResponse, ToolCall } from '../types';

export class Ollama implements LLM {
  private baseUrl = 'http://localhost:11434';
  private model: string;

  constructor(model: string = 'llama3.1') {
    this.model = model;
  }

  async chat(messages: Message[], tools?: ToolSchema[], systemPrompt?: string): Promise<LLMResponse> {
    const systemMessage = systemPrompt ? [{ role: 'system', content: systemPrompt }] : [];
    
    const requestBody: any = {
      model: this.model,
      messages: [...systemMessage, ...messages],
      stream: false,
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

  async chatStream(messages: Message[], tools?: ToolSchema[], systemPrompt?: string): Promise<NodeJS.ReadableStream> {
    const systemMessage = systemPrompt ? [{ role: 'system', content: systemPrompt }] : [];
    
    const requestBody: any = {
      model: this.model,
      messages: [...systemMessage, ...messages],
      stream: true,
    };
    
    if (tools && tools.length > 0) {
      requestBody.tools = tools;
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
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
