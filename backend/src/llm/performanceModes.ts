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
