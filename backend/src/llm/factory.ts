import { LLM } from './LLM';
import { Ollama } from './Ollama';
import { AnthropicLLM } from './Anthropic';
import { OpenAICompatibleLLM } from './OpenAICompatible';
import { PerformanceMode } from './performanceModes';
import { getConnectorKey, KNOWN_PROVIDERS } from '../db/connectors.repo';

export function isCloudModel(model: string): boolean {
  return KNOWN_PROVIDERS.some(p => p.chatSupported && model.startsWith(p.modelPrefix));
}

export function createLLM(model: string, mode: PerformanceMode, outputLimitTokens?: number): LLM {
  if (model.startsWith('claude-')) {
    return new AnthropicLLM(model, outputLimitTokens);
  }
  if (model.startsWith('gpt-')) {
    return new OpenAICompatibleLLM({ baseUrl: 'https://api.openai.com/v1', apiKey: getConnectorKey('openai'), model });
  }
  if (model.startsWith('groq/')) {
    return new OpenAICompatibleLLM({ baseUrl: 'https://api.groq.com/openai/v1', apiKey: getConnectorKey('groq'), model: model.slice('groq/'.length) });
  }
  if (model.startsWith('mistral/')) {
    return new OpenAICompatibleLLM({ baseUrl: 'https://api.mistral.ai/v1', apiKey: getConnectorKey('mistral'), model: model.slice('mistral/'.length) });
  }
  return new Ollama(model, mode, outputLimitTokens);
}
