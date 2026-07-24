export type PerformanceMode = 'low' | 'high';

export interface OllamaOptions {
  num_ctx: number;
  num_predict: number;
  num_thread?: number;
}

export interface PerformanceProfile {
  options: OllamaOptions;
  keepAlive: string;
  maxHistoryMessages?: number;
}

export const DEFAULT_PERFORMANCE_MODE: PerformanceMode = 'high';

export const PERFORMANCE_PROFILES: Record<PerformanceMode, PerformanceProfile> = {
  low: {
    options: { num_ctx: 2048, num_predict: 512, num_thread: 4 },
    keepAlive: '1m',
    maxHistoryMessages: 12,
  },
  high: {
    options: { num_ctx: 8192, num_predict: -1 },
    keepAlive: '30m',
  },
};

export function resolvePerformanceMode(value: unknown): PerformanceMode {
  return value === 'low' ? 'low' : 'high';
}

/**
 * The user-facing Output Limit is enforced as a soft prompt instruction (the
 * model is asked to wrap up within that budget), not a hard truncation. This
 * backstop is Ollama's num_predict — a safety ceiling that only kicks in if
 * the model ignores the instruction, sized generously above the soft target
 * so it rarely triggers. Low tier clamps it tighter to protect weak hardware
 * even if the user requests a very large Output Limit.
 */
export function computeNumPredictBackstop(mode: PerformanceMode, outputLimitTokens?: number): number {
  const base = PERFORMANCE_PROFILES[mode].options.num_predict;
  if (!outputLimitTokens || outputLimitTokens <= 0) return base;
  if (mode === 'low') return Math.min(Math.round(outputLimitTokens * 1.5), 4096);
  return Math.round(outputLimitTokens * 2);
}
