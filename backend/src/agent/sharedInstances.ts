import { ToolRegistry } from '../tools/registry';
import { ToolExecutor } from './ToolExecutor';
import { BashTool } from '../tools/BashTool';
import { FsTool } from '../tools/FsTool';
import { WebSearchTool } from '../tools/WebSearchTool';
import { WriteFileTool } from '../tools/WriteFileTool';
import { ListDirectoryTool } from '../tools/ListDirectoryTool';

export const registry = new ToolRegistry();
registry.register(new BashTool());
registry.register(new FsTool());
registry.register(new WebSearchTool());
registry.register(new WriteFileTool());
registry.register(new ListDirectoryTool());

export const executor = new ToolExecutor(registry);
