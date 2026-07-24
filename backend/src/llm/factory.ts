import { LLM } from './LLM';
import { Ollama } from './Ollama';
import { AnthropicLLM } from './Anthropic';
import { PerformanceMode } from './performanceModes';

export function isClaudeModel(model: string): boolean {
  return model.startsWith('claude-');
}

export function createLLM(model: string, mode: PerformanceMode, outputLimitTokens?: number): LLM {
  if (isClaudeModel(model)) {
    return new AnthropicLLM(model, outputLimitTokens);
  }
  return new Ollama(model, mode, outputLimitTokens);
}
