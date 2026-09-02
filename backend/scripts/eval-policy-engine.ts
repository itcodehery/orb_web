/**
 * Pure regression harness for the policy engine (matching, layered merge,
 * monitor mode, v1 degradation, rule validation). No DB, no LLM, no network.
 * Run: npx tsx scripts/eval-policy-engine.ts
 */
import { matchesRule, normalizePath } from '../src/policy/matcher';
import { evaluateDocumentRules, evaluateToolCall, mostRestrictive, toSessionDecision } from '../src/policy/evaluate';
import { validateRule } from '../src/policy/validateRule';
import { ActivePolicy, PolicyContext, PolicyDecision, PolicyDocument, PolicyRule } from '../src/policy/types';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1;
    console.log(`PASS — ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL — ${name}${detail ? ` (${detail})` : ''}`);
  }
}

function assertEqual<T>(name: string, actual: T, expected: T) {
  check(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

let nextRuleId = 1;
function makeRule(partial: Partial<PolicyRule> & Pick<PolicyRule, 'kind' | 'effect'>): PolicyRule {
  const now = new Date().toISOString();
  return {
    id: nextRuleId++,
    document_id: 1,
    ordinal: nextRuleId,
    title: partial.title || 'untitled rule',
    tool: null,
    match_field: null,
    match_kind: null,
    pattern: null,
    directive: null,
    source_excerpt: null,
    origin: 'compiled',
    enabled: true,
    created_at: now,
    updated_at: now,
    ...partial,
  };
}

function makeDocument(partial: Partial<PolicyDocument> = {}): PolicyDocument {
  const now = new Date().toISOString();
  return {
    id: 1,
    title: 'Acme AI Usage Policy',
    filename: 'policy.md',
    mime_type: 'text/markdown',
    size_bytes: 100,
    source_hash: 'abc',
    source_text: 'source',
    status: 'active',
    enforcement_mode: 'enforce',
    compile_model: 'qwen3:8b',
    compile_error: null,
    uploaded_by: 'user_1',
    created_at: now,
    updated_at: now,
    activated_at: now,
    ...partial,
  };
}

function makeActivePolicy(rules: PolicyRule[], documentPartial: Partial<PolicyDocument> = {}): ActivePolicy {
  const document = makeDocument(documentPartial);
  return {
    document,
    rules,
    actionRules: rules.filter((r) => r.kind === 'action'),
    conductRules: rules.filter((r) => r.kind === 'conduct'),
  };
}

function ctx(overrides: Partial<PolicyContext> = {}): PolicyContext {
  return { channel: 'chat', allowApproval: true, sessionSource: 'mode', ...overrides };
}

// ---------------------------------------------------------------------------
// matcher.ts
// ---------------------------------------------------------------------------

{
  const rule = makeRule({ kind: 'action', effect: 'deny', tool: 'execute_bash', match_field: 'command', match_kind: 'contains', pattern: 'sudo' });
  check('contains: matches substring case-insensitively', matchesRule(rule, 'execute_bash', { command: 'Sudo apt update' }));
  check('contains: no match on unrelated command', !matchesRule(rule, 'execute_bash', { command: 'ls -la' }));
  check('contains: no match on different tool', !matchesRule(rule, 'read_file', { command: 'sudo x' }));
}

{
  const rule = makeRule({ kind: 'action', effect: 'deny', tool: 'execute_bash', match_field: 'command', match_kind: 'prefix', pattern: 'git push' });
  check('prefix: matches leading text', matchesRule(rule, 'execute_bash', { command: 'git push origin main --force' }));
  check('prefix: no match mid-string', !matchesRule(rule, 'execute_bash', { command: 'echo git push' }));
}

{
  const rule = makeRule({ kind: 'action', effect: 'deny', tool: 'read_file', match_field: 'filepath', match_kind: 'glob', pattern: '/etc/**' });
  check('glob: matches absolute path under /etc', matchesRule(rule, 'read_file', { filepath: '/etc/passwd' }));
  check('glob: no match outside /etc', !matchesRule(rule, 'read_file', { filepath: '/home/user/notes.txt' }));
}

{
  const rule = makeRule({ kind: 'action', effect: 'require_approval', tool: 'write_file', match_field: 'filepath', match_kind: 'glob', pattern: '~/Documents/HR/**' });
  check('glob: expands ~ before matching', matchesRule(rule, 'write_file', { filepath: '~/Documents/HR/notes.txt' }));
  const normalized = normalizePath('~/Documents/HR/notes.txt');
  check('normalizePath: expands to an absolute path', normalized.startsWith('/'), normalized);
}

{
  const rule = makeRule({ kind: 'action', effect: 'deny', tool: 'execute_bash', match_field: 'command', match_kind: 'regex', pattern: 'rm\\s+-rf' });
  check('regex: matches pattern', matchesRule(rule, 'execute_bash', { command: 'rm -rf /' }));
  check('regex: no match without the pattern', !matchesRule(rule, 'execute_bash', { command: 'rm file.txt' }));
}

{
  const rule = makeRule({ kind: 'action', effect: 'deny', tool: 'execute_bash', match_kind: 'any' });
  check('any: matches every call to the tool regardless of args', matchesRule(rule, 'execute_bash', { command: 'literally anything' }));
  check('any: does not match a different tool', !matchesRule(rule, 'read_file', { filepath: '/tmp/x' }));
}

{
  const rule = makeRule({ kind: 'action', effect: 'deny', tool: '*', match_kind: 'any' });
  check('wildcard tool: matches any tool', matchesRule(rule, 'web_search', { query: 'x' }) && matchesRule(rule, 'list_directory', { dirpath: '/' }));
}

// ---------------------------------------------------------------------------
// evaluateDocumentRules: deny > require_approval > allow > no match
// ---------------------------------------------------------------------------

{
  const policy = makeActivePolicy([
    makeRule({ kind: 'action', effect: 'deny', tool: 'execute_bash', match_field: 'command', match_kind: 'contains', pattern: 'sudo', title: 'No sudo' }),
  ]);
  const decision = evaluateDocumentRules(policy, 'execute_bash', { command: 'sudo rm -rf /' });
  assertEqual('evaluateDocumentRules: deny match blocks', decision.status, 'Blocked');
  assertEqual('evaluateDocumentRules: deny match attributes the rule', decision.ruleTitle, 'No sudo');
}

{
  const policy = makeActivePolicy([
    makeRule({ kind: 'action', effect: 'require_approval', tool: 'write_file', match_field: 'filepath', match_kind: 'glob', pattern: '~/Documents/HR/**', title: 'HR writes need approval' }),
  ]);
  const decision = evaluateDocumentRules(policy, 'write_file', { filepath: '~/Documents/HR/note.txt' });
  assertEqual('evaluateDocumentRules: approval match requires approval', decision.status, 'Requires Approval');
}

{
  const policy = makeActivePolicy([
    makeRule({ kind: 'action', effect: 'deny', tool: 'execute_bash', match_field: 'command', match_kind: 'contains', pattern: 'sudo', title: 'No sudo', ordinal: 2 }),
    makeRule({ kind: 'action', effect: 'require_approval', tool: 'execute_bash', match_kind: 'any', title: 'Approve all shell', ordinal: 1 }),
  ]);
  const decision = evaluateDocumentRules(policy, 'execute_bash', { command: 'sudo ls' });
  assertEqual('evaluateDocumentRules: deny wins over a matching approval rule regardless of ordinal', decision.status, 'Blocked');
}

{
  const policy = makeActivePolicy([
    makeRule({ kind: 'action', effect: 'allow', tool: 'web_search', match_kind: 'any', title: 'Search allowed' }),
  ]);
  const decision = evaluateDocumentRules(policy, 'web_search', { query: 'weather' });
  assertEqual('evaluateDocumentRules: explicit allow match is Allowed', decision.status, 'Allowed');
  assertEqual('evaluateDocumentRules: allow match still attributes the rule', decision.ruleTitle, 'Search allowed');
}

{
  const policy = makeActivePolicy([
    makeRule({ kind: 'action', effect: 'deny', tool: 'execute_bash', match_field: 'command', match_kind: 'contains', pattern: 'sudo' }),
  ]);
  const decision = evaluateDocumentRules(policy, 'web_search', { query: 'anything' });
  assertEqual('evaluateDocumentRules: no matching rule is Allowed with no attribution', decision.status, 'Allowed');
  check('evaluateDocumentRules: no matching rule has no ruleId', decision.ruleId === undefined);
}

{
  const policy = makeActivePolicy([
    makeRule({ kind: 'action', effect: 'deny', tool: 'execute_bash', match_kind: 'any', enabled: false, title: 'Disabled deny' }),
  ]);
  const decision = evaluateDocumentRules(policy, 'execute_bash', { command: 'anything' });
  assertEqual('evaluateDocumentRules: disabled rules never match', decision.status, 'Allowed');
}

// ---------------------------------------------------------------------------
// mostRestrictive / layered merge (evaluateToolCall)
// ---------------------------------------------------------------------------

{
  const allowed: PolicyDecision = { status: 'Allowed', source: 'document', reason: 'a' };
  const blocked: PolicyDecision = { status: 'Blocked', source: 'session', reason: 'b' };
  assertEqual('mostRestrictive: Blocked beats Allowed regardless of order (1)', mostRestrictive(allowed, blocked).status, 'Blocked');
  assertEqual('mostRestrictive: Blocked beats Allowed regardless of order (2)', mostRestrictive(blocked, allowed).status, 'Blocked');
  const approval: PolicyDecision = { status: 'Requires Approval', source: 'document', reason: 'c' };
  assertEqual('mostRestrictive: Requires Approval beats Allowed', mostRestrictive(allowed, approval).status, 'Requires Approval');
  assertEqual('mostRestrictive: Blocked beats Requires Approval', mostRestrictive(approval, blocked).status, 'Blocked');
  assertEqual('mostRestrictive: tie prefers the first argument', mostRestrictive(allowed, { ...allowed, reason: 'other' }).reason, 'a');
}

{
  // No active document: session decision passes through untouched.
  const session = toSessionDecision('Requires Approval', 'mode', 'execute_bash');
  const result = evaluateToolCall(null, 'execute_bash', { command: 'ls' }, session, ctx());
  assertEqual('evaluateToolCall: no active document leaves session decision untouched', result.decision.status, 'Requires Approval');
  assertEqual('evaluateToolCall: no active document reports no document decision', result.documentDecision, null);
  assertEqual('evaluateToolCall: no active document is never monitored', result.monitored, false);
}

{
  // Company policy stricter than an Auto-mode session (the point of the feature).
  const policy = makeActivePolicy([
    makeRule({ kind: 'action', effect: 'deny', tool: 'execute_bash', match_field: 'command', match_kind: 'contains', pattern: 'sudo', title: 'No sudo' }),
  ]);
  const session = toSessionDecision('Allowed', 'mode', 'execute_bash'); // Auto mode: everything allowed
  const result = evaluateToolCall(policy, 'execute_bash', { command: 'sudo apt update' }, session, ctx());
  assertEqual('evaluateToolCall: company policy overrides Auto mode', result.decision.status, 'Blocked');
  assertEqual('evaluateToolCall: blocked decision is attributed to the document', result.decision.source, 'document');
}

{
  // A user can still be stricter than the company.
  const policy = makeActivePolicy([
    makeRule({ kind: 'action', effect: 'allow', tool: 'execute_bash', match_kind: 'any' }),
  ]);
  const session = toSessionDecision('Blocked', 'session', 'execute_bash');
  const result = evaluateToolCall(policy, 'execute_bash', { command: 'ls' }, session, ctx());
  assertEqual('evaluateToolCall: a stricter session-layer decision still wins', result.decision.status, 'Blocked');
}

{
  // Monitor mode: never blocks, but reports what would have happened.
  const policy = makeActivePolicy(
    [makeRule({ kind: 'action', effect: 'deny', tool: 'execute_bash', match_kind: 'any', title: 'No shell at all' })],
    { enforcement_mode: 'monitor' }
  );
  const session = toSessionDecision('Allowed', 'mode', 'execute_bash');
  const result = evaluateToolCall(policy, 'execute_bash', { command: 'ls' }, session, ctx());
  assertEqual('evaluateToolCall: monitor mode never blocks', result.decision.status, 'Allowed');
  check('evaluateToolCall: monitor mode reports the would-be decision', result.monitored === true && result.documentDecision?.status === 'Blocked');
}

{
  // Monitor mode with nothing that would restrict: not flagged as monitored.
  const policy = makeActivePolicy(
    [makeRule({ kind: 'action', effect: 'deny', tool: 'execute_bash', match_field: 'command', match_kind: 'contains', pattern: 'sudo' })],
    { enforcement_mode: 'monitor' }
  );
  const session = toSessionDecision('Allowed', 'mode', 'execute_bash');
  const result = evaluateToolCall(policy, 'execute_bash', { command: 'ls -la' }, session, ctx());
  assertEqual('evaluateToolCall: monitor mode with no restricting match is not flagged', result.monitored, false);
}

{
  // /api/v1 degradation: a document "Requires Approval" with no human present becomes Blocked.
  const policy = makeActivePolicy([
    makeRule({ kind: 'action', effect: 'require_approval', tool: 'write_file', match_kind: 'any', title: 'Writes need approval' }),
  ]);
  const session = toSessionDecision('Allowed', 'api_key', 'write_file');
  const result = evaluateToolCall(policy, 'write_file', { filepath: '/tmp/x', content: 'y' }, session, ctx({ channel: 'api', allowApproval: false }));
  assertEqual('evaluateToolCall: v1 degrades Requires Approval to Blocked', result.decision.status, 'Blocked');
  check('evaluateToolCall: v1 degradation reason explains why', result.decision.reason.includes('programmatic API'));
}

{
  // A document "Requires Approval" is preserved as-is when a human is present.
  const policy = makeActivePolicy([
    makeRule({ kind: 'action', effect: 'require_approval', tool: 'write_file', match_kind: 'any', title: 'Writes need approval' }),
  ]);
  const session = toSessionDecision('Allowed', 'mode', 'write_file');
  const result = evaluateToolCall(policy, 'write_file', { filepath: '/tmp/x', content: 'y' }, session, ctx({ channel: 'chat', allowApproval: true }));
  assertEqual('evaluateToolCall: chat keeps Requires Approval when a human is present', result.decision.status, 'Requires Approval');
}

// ---------------------------------------------------------------------------
// validateRule.ts
// ---------------------------------------------------------------------------

{
  const result = validateRule({ kind: 'action', title: 'No sudo', effect: 'deny', tool: 'execute_bash', matchField: 'command', matchKind: 'contains', pattern: 'sudo' });
  check('validateRule: accepts a well-formed action rule', result.ok);
}

{
  const result = validateRule({ kind: 'action', title: 'Bad', effect: 'deny', tool: 'web_search', matchField: 'command', matchKind: 'contains', pattern: 'sudo' });
  check('validateRule: rejects a field incompatible with the tool', !result.ok);
}

{
  const result = validateRule({ kind: 'action', title: 'Bad', effect: 'deny', tool: 'execute_bash', matchField: 'command', matchKind: 'contains' });
  check('validateRule: requires a pattern unless matchKind is "any"', !result.ok);
}

{
  const result = validateRule({ kind: 'action', title: 'Fine', effect: 'deny', tool: 'execute_bash', matchKind: 'any' });
  check('validateRule: "any" does not require a pattern', result.ok);
}

{
  const result = validateRule({ kind: 'conduct', title: 'No salary disclosure', directive: 'Never disclose employee salary data.' });
  check('validateRule: accepts a well-formed conduct rule', result.ok);
}

{
  const result = validateRule({ kind: 'conduct', title: 'Missing directive' });
  check('validateRule: rejects a conduct rule with no directive', !result.ok);
}

{
  const result = validateRule({ kind: 'action', title: 'x'.repeat(200), effect: 'deny', tool: 'execute_bash', matchKind: 'any' });
  check('validateRule: rejects an overlong title', !result.ok);
}

{
  // Classic catastrophic-backtracking pattern must be rejected by safe-regex2.
  const result = validateRule({ kind: 'action', title: 'Unsafe', effect: 'deny', tool: 'execute_bash', matchField: 'command', matchKind: 'regex', pattern: '(a+)+$' });
  check('validateRule: rejects an unsafe regex', !result.ok);
}

{
  const result = validateRule({ kind: 'action', title: 'Safe', effect: 'deny', tool: 'execute_bash', matchField: 'command', matchKind: 'regex', pattern: 'rm\\s+-rf' });
  check('validateRule: accepts a safe regex', result.ok);
}

// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
