export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  name?: string; // For tool role
  tool_calls?: ToolCall[];
  tool_call_id?: string; // For tool role — correlates the result to the originating tool_calls[].id
}

export interface ToolCall {
  id?: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any; // JSON Schema object
  };
}

export interface LLMResponse {
  text?: string;
  toolCalls?: ToolCall[];
}
