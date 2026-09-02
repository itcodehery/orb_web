import { ActivePolicy, PolicyRule } from './types';

const MAX_PROMPT_RULES = 40;
const MAX_PROMPT_CHARS = 4000;

// Allow rules don't need a prompt-level mention — allowed is the default for
// anything a deny/require_approval rule doesn't already cover.
function describeActionRule(rule: PolicyRule): string | null {
  if (rule.effect === 'allow') return null;
  const tool = rule.tool === '*' ? 'any tool' : rule.tool;
  const verb = rule.effect === 'deny' ? 'You must never use' : 'You must ask for human approval before using';

  if (rule.match_kind === 'any' || !rule.match_kind) {
    return `${verb} ${tool}.`;
  }

  const field = rule.match_field === '*' ? 'its arguments' : rule.match_field;
  const verbForKind = rule.match_kind === 'contains' ? 'contains' : rule.match_kind === 'prefix' ? 'starts with' : 'matches';
  return `${verb} ${tool} when ${field} ${verbForKind} "${rule.pattern}".`;
}

// Injected into the system prompt the same way memories are (chat.route.ts /
// v1/chat.route.ts): a "## " header followed by "- " bullets. Conduct rules
// first (they're plain directives), then deny/approval action rules in
// plain English. Capped so a large policy can't dominate the context window.
export function buildPolicyPromptSection(active: ActivePolicy | null): string {
  if (!active) return '';

  const lines: string[] = [];
  for (const rule of active.conductRules) {
    if (rule.directive) lines.push(`- ${rule.directive}`);
  }
  for (const rule of active.actionRules) {
    const line = describeActionRule(rule);
    if (line) lines.push(`- ${line}`);
  }

  if (lines.length === 0) return '';

  const kept: string[] = [];
  let size = 0;
  for (const line of lines) {
    if (kept.length >= MAX_PROMPT_RULES || size + line.length + 1 > MAX_PROMPT_CHARS) break;
    kept.push(line);
    size += line.length + 1;
  }
  const omitted = lines.length - kept.length;
  if (omitted > 0) kept.push(`- (${omitted} more rule${omitted === 1 ? '' : 's'} apply and are enforced by Orb.)`);

  return `\n\n## Company policy (enforced by Orb — you must comply)\n${kept.join('\n')}`;
}
