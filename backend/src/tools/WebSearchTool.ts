import { Tool } from './Tool';
import { tavily } from '@tavily/core';

export class WebSearchTool implements Tool {
  name = 'web_search';
  description = 'Search the web for information.';
  schema = {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query' }
    },
    required: ['query']
  };

  private tvly: any;

  constructor() {
    this.tvly = tavily({ apiKey: process.env.TAVILY_API_KEY || '' });
  }

  async execute(args: any): Promise<string> {
    try {
      if (!process.env.TAVILY_API_KEY) {
        return 'Tavily API key is missing. Cannot perform web search.';
      }
      const searchResponse = await this.tvly.search(args.query, { searchDepth: "basic", maxResults: 5 });
      const resultsText = searchResponse.results
        .map((r: any) => `Title: ${r.title}\nURL: ${r.url}\nContent: ${r.content}`)
        .join('\n\n');
      return resultsText || 'No results found.';
    } catch (error: any) {
      return `Failed to search web: ${error.message}`;
    }
  }
}
