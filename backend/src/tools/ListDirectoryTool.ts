import { Tool } from './Tool';
import * as fs from 'fs';

export class ListDirectoryTool implements Tool {
  name = 'list_directory';
  description = 'List files and folders inside a directory.';
  schema = {
    type: 'object',
    properties: {
      dirpath: { type: 'string', description: 'The absolute or relative path to the directory' }
    },
    required: ['dirpath']
  };

  async execute(args: any): Promise<string> {
    try {
      const entries = fs.readdirSync(args.dirpath, { withFileTypes: true });
      return entries.map(e => `${e.isDirectory() ? 'd' : '-'} ${e.name}`).join('\n') || '(empty directory)';
    } catch (error: any) {
      return `Failed to list directory: ${error.message}`;
    }
  }
}
