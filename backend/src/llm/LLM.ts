import { Message, ToolSchema, LLMResponse } from '../types';

export interface LLM {
  /**
   * Send a chat request to the LLM and wait for the complete response.
   * Useful for internal planning where streaming isn't needed.
   */
  chat(messages: Message[], tools?: ToolSchema[], systemPrompt?: string): Promise<LLMResponse>;

  /**
   * Send a chat request and get a readable stream of NDJSON strings or raw bytes.
   */
  chatStream(messages: Message[], tools?: ToolSchema[], systemPrompt?: string): Promise<NodeJS.ReadableStream>;
}
