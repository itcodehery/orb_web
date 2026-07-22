import { Tool } from './Tool';
import { ToolSchema } from '../types';

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool) {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getSchemas(): ToolSchema[] {
    return Array.from(this.tools.values()).map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.schema
      }
    }));
  }

  getTools(): Tool[] {
    return Array.from(this.tools.values());
  }
}
