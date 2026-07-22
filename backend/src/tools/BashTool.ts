import { Tool } from './Tool';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class BashTool implements Tool {
  name = 'execute_bash';
  description = 'Execute a bash command on the host system.';
  schema = {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The bash command to execute' }
    },
    required: ['command']
  };

  async execute(args: any): Promise<string> {
    try {
      const { stdout, stderr } = await execAsync(args.command);
      let result = '';
      if (stdout) result += stdout;
      if (stderr) result += stderr;
      return result.trim() || 'Command executed with no output.';
    } catch (error: any) {
      return `Error executing command: ${error.message}\n${error.stdout || ''}\n${error.stderr || ''}`;
    }
  }
}
