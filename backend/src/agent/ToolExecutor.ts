import { ToolRegistry } from '../tools/registry';
import { ToolCall } from '../types';

export class ToolExecutor {
  constructor(private registry: ToolRegistry) {}

  async execute(toolCall: ToolCall): Promise<string> {
    const tool = this.registry.get(toolCall.function.name);
    if (!tool) {
      return `Error: Tool '${toolCall.function.name}' not found.`;
    }

    try {
      let args = {};
      if (toolCall.function.arguments) {
        // Ollama might return args as a string or an object depending on version/parsing.
        if (typeof toolCall.function.arguments === 'string') {
          args = JSON.parse(toolCall.function.arguments);
        } else {
          args = toolCall.function.arguments;
        }
      }
      const result = await tool.execute(args);
      return result;
    } catch (error: any) {
      return `Error executing ${toolCall.function.name}: ${error.message}`;
    }
  }
}
