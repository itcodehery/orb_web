import path from 'path';
import os from 'os';
import picomatch from 'picomatch';
import { PolicyRule, MatchField } from './types';

function expandHome(value: string): string {
  if (value === '~') return os.homedir();
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
  return value;
}

export function normalizePath(value: string): string {
  return path.resolve(expandHome(value));
}

export function extractFieldValue(args: Record<string, unknown> | null | undefined, field: MatchField): string {
  if (field === '*') return JSON.stringify(args ?? {});
  const value = (args as any)?.[field];
  if (typeof value === 'string') return value;
  return value != null ? JSON.stringify(value) : '';
}

const globCache = new Map<string, (input: string) => boolean>();
function compileGlob(pattern: string): (input: string) => boolean {
  let matcher = globCache.get(pattern);
  if (!matcher) {
    matcher = picomatch(pattern, { dot: true });
    globCache.set(pattern, matcher);
  }
  return matcher;
}

// Anchored path patterns ("~/Documents/**", "/etc/**") are resolved the same
// way as the subject, so "~/..." rules match real absolute paths. Unanchored
// patterns ("**/.env*") are left alone — resolving them would wrongly pin an
// "anywhere" glob to the current working directory.
function preparePattern(pattern: string, isPathField: boolean): string {
  if (!isPathField) return pattern;
  if (pattern.startsWith('~')) return normalizePath(pattern);
  if (pattern.startsWith('/')) return path.resolve(pattern);
  return pattern;
}

// Pure and DB-free so it can be exercised directly by scripts/eval-policy-engine.ts.
export function matchesRule(rule: PolicyRule, toolName: string, args: Record<string, unknown> | null | undefined): boolean {
  if (rule.kind !== 'action') return false;
  if (rule.tool !== '*' && rule.tool !== toolName) return false;
  if (rule.match_kind === 'any' || !rule.match_kind) return true;

  const field = rule.match_field ?? '*';
  const rawValue = extractFieldValue(args, field);
  const pattern = rule.pattern ?? '';
  const isPathField = field === 'filepath' || field === 'dirpath';

  switch (rule.match_kind) {
    case 'contains':
      return rawValue.toLowerCase().includes(pattern.toLowerCase());
    case 'prefix':
      return rawValue.trim().toLowerCase().startsWith(pattern.trim().toLowerCase());
    case 'glob': {
      const subject = isPathField && rawValue ? normalizePath(rawValue) : rawValue;
      return compileGlob(preparePattern(pattern, isPathField))(subject);
    }
    case 'regex': {
      try {
        return new RegExp(pattern, 'i').test(rawValue);
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}
