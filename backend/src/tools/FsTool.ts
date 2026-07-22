import { Tool } from './Tool';
import * as fs from 'fs';

export class FsTool implements Tool {
  name = 'read_file';
  description = 'Read the contents of a file.';
  schema = {
    type: 'object',
    properties: {
      filepath: { type: 'string', description: 'The absolute or relative path to the file' }
    },
    required: ['filepath']
  };

  async execute(args: any): Promise<string> {
    try {
      const content = fs.readFileSync(args.filepath, 'utf-8');
      return content.substring(0, 5000); // Limit output length
    } catch (error: any) {
      return `Failed to read file: ${error.message}`;
    }
  }
}
