import safeRegex from 'safe-regex2';
import { RuleEffect, ToolName, MatchField, MatchKind, TOOL_NAMES, MATCH_FIELDS, MATCH_KINDS } from './types';

const FIELD_TOOLS: Record<Exclude<MatchField, '*'>, ToolName[]> = {
  command: ['execute_bash', '*'],
  filepath: ['read_file', 'write_file', '*'],
  dirpath: ['list_directory', '*'],
  query: ['web_search', '*'],
  content: ['write_file', '*'],
};

export interface RuleInput {
  kind?: string;
  title?: string;
  effect?: string;
  tool?: string;
  matchField?: string;
  matchKind?: string;
  pattern?: string;
  directive?: string;
  sourceExcerpt?: string;
}

export interface ValidatedActionRule {
  kind: 'action';
  title: string;
  effect: RuleEffect;
  tool: ToolName;
  match_field: MatchField;
  match_kind: MatchKind;
  pattern: string | null;
  directive: null;
  source_excerpt: string | null;
}

export interface ValidatedConductRule {
  kind: 'conduct';
  title: string;
  effect: 'advise';
  tool: null;
  match_field: null;
  match_kind: null;
  pattern: null;
  directive: string;
  source_excerpt: string | null;
}

export type ValidatedRule = ValidatedActionRule | ValidatedConductRule;
export type ValidateResult = { ok: true; rule: ValidatedRule } | { ok: false; error: string };

const MAX_TITLE_LEN = 160;
const MAX_PATTERN_LEN = 300;
const MAX_DIRECTIVE_LEN = 500;

export function validateRule(input: RuleInput): ValidateResult {
  if (!input || typeof input !== 'object') return { ok: false, error: 'rule must be an object' };

  const kind = input.kind;
  if (kind !== 'action' && kind !== 'conduct') return { ok: false, error: 'kind must be "action" or "conduct"' };

  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) return { ok: false, error: 'title is required' };
  if (title.length > MAX_TITLE_LEN) return { ok: false, error: `title must be at most ${MAX_TITLE_LEN} characters` };

  const sourceExcerpt = typeof input.sourceExcerpt === 'string' && input.sourceExcerpt.trim()
    ? input.sourceExcerpt.trim().slice(0, 500)
    : null;

  if (kind === 'conduct') {
    const directive = typeof input.directive === 'string' ? input.directive.trim() : '';
    if (!directive) return { ok: false, error: 'directive is required for conduct rules' };
    if (directive.length > MAX_DIRECTIVE_LEN) return { ok: false, error: `directive must be at most ${MAX_DIRECTIVE_LEN} characters` };
    return {
      ok: true,
      rule: { kind: 'conduct', title, effect: 'advise', tool: null, match_field: null, match_kind: null, pattern: null, directive, source_excerpt: sourceExcerpt },
    };
  }

  const effect = input.effect;
  if (effect !== 'allow' && effect !== 'deny' && effect !== 'require_approval') {
    return { ok: false, error: 'effect must be "allow", "deny" or "require_approval" for action rules' };
  }

  const tool = input.tool;
  if (typeof tool !== 'string' || !(TOOL_NAMES as readonly string[]).includes(tool)) {
    return { ok: false, error: `tool must be one of ${TOOL_NAMES.join(', ')}` };
  }

  const matchKind = input.matchKind;
  if (typeof matchKind !== 'string' || !(MATCH_KINDS as readonly string[]).includes(matchKind)) {
    return { ok: false, error: `matchKind must be one of ${MATCH_KINDS.join(', ')}` };
  }

  // "any" matches every call to the tool regardless of arguments, so the
  // field is irrelevant — default it to '*' rather than forcing the caller
  // to pick one.
  const matchField = matchKind === 'any' && input.matchField === undefined ? '*' : input.matchField;
  if (typeof matchField !== 'string' || !(MATCH_FIELDS as readonly string[]).includes(matchField)) {
    return { ok: false, error: `matchField must be one of ${MATCH_FIELDS.join(', ')}` };
  }
  if (matchKind !== 'any' && matchField !== '*') {
    const compatibleTools = FIELD_TOOLS[matchField as Exclude<MatchField, '*'>];
    if (!compatibleTools.includes(tool as ToolName)) {
      return { ok: false, error: `matchField "${matchField}" is not valid for tool "${tool}" (expected one of ${compatibleTools.join(', ')})` };
    }
  }

  let pattern: string | null = null;
  if (matchKind !== 'any') {
    const raw = typeof input.pattern === 'string' ? input.pattern.trim() : '';
    if (!raw) return { ok: false, error: 'pattern is required unless matchKind is "any"' };
    if (raw.length > MAX_PATTERN_LEN) return { ok: false, error: `pattern must be at most ${MAX_PATTERN_LEN} characters` };
    if (matchKind === 'regex') {
      let compiled: RegExp;
      try {
        compiled = new RegExp(raw, 'i');
      } catch (err: any) {
        return { ok: false, error: `invalid regex: ${err.message}` };
      }
      if (!safeRegex(compiled)) return { ok: false, error: 'regex pattern is potentially unsafe (catastrophic backtracking risk)' };
    }
    pattern = raw;
  }

  return {
    ok: true,
    rule: {
      kind: 'action',
      title,
      effect,
      tool: tool as ToolName,
      match_field: matchField as MatchField,
      match_kind: matchKind as MatchKind,
      pattern,
      directive: null,
      source_excerpt: sourceExcerpt,
    },
  };
}

// Converts a stored PolicyRule row back into RuleInput shape so a PATCH can
// merge partial edits onto it and re-validate the whole thing.
export function ruleToInput(rule: {
  kind: string;
  title: string;
  effect: string;
  tool: string | null;
  match_field: string | null;
  match_kind: string | null;
  pattern: string | null;
  directive: string | null;
  source_excerpt: string | null;
}): RuleInput {
  return {
    kind: rule.kind,
    title: rule.title,
    effect: rule.effect,
    tool: rule.tool ?? undefined,
    matchField: rule.match_field ?? undefined,
    matchKind: rule.match_kind ?? undefined,
    pattern: rule.pattern ?? undefined,
    directive: rule.directive ?? undefined,
    sourceExcerpt: rule.source_excerpt ?? undefined,
  };
}
