export interface Tool {
  name: string;
  description: string;
  schema: any; // JSON Schema for arguments
  execute(args: any): Promise<any>;
}
