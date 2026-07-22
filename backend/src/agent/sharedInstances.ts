import { ToolRegistry } from '../tools/registry';
import { ToolExecutor } from './ToolExecutor';
import { BashTool } from '../tools/BashTool';
import { FsTool } from '../tools/FsTool';
import { WebSearchTool } from '../tools/WebSearchTool';

export const registry = new ToolRegistry();
registry.register(new BashTool());
registry.register(new FsTool());
registry.register(new WebSearchTool());

export const executor = new ToolExecutor(registry);
