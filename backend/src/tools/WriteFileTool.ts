import { Tool } from './Tool';
import * as fs from 'fs';

export class WriteFileTool implements Tool {
  name = 'write_file';
  description = 'Write content to a file, creating it if it does not exist or overwriting it if it does.';
  schema = {
    type: 'object',
    properties: {
      filepath: { type: 'string', description: 'The absolute or relative path to the file' },
      content: { type: 'string', description: 'The content to write to the file' }
    },
    required: ['filepath', 'content']
  };

  async execute(args: any): Promise<string> {
    try {
      fs.writeFileSync(args.filepath, args.content, 'utf-8');
      return `Wrote ${args.content.length} bytes to ${args.filepath}`;
    } catch (error: any) {
      return `Failed to write file: ${error.message}`;
    }
  }
}
