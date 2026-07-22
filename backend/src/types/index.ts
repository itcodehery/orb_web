export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  name?: string; // For tool role
  tool_calls?: ToolCall[];
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
