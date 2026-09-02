import { ToolRegistry } from '../tools/registry';
import { ToolCall } from '../types';
import { hardDenyCheck } from '../policy/engine';

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

      // Defense in depth: even a caller that reaches ToolExecutor directly
      // (bypassing the resolver) cannot run something the active, enforcing
      // company policy explicitly denies.
      const denial = hardDenyCheck(toolCall.function.name, args);
      if (denial) return denial.reason;

      const result = await tool.execute(args);
      return result;
    } catch (error: any) {
      return `Error executing ${toolCall.function.name}: ${error.message}`;
    }
  }
}
