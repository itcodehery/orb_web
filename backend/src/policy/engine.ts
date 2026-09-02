import { getActiveDocument, listRules } from '../db/policies.repo';
import { evaluateDocumentRules } from './evaluate';
import { ActivePolicy, PolicyDecision } from './types';

// Module-level cache of the active document + its enabled rules. Rebuilt on
// first access after every mutation (see invalidatePolicyCache), avoiding a
// DB round trip on every tool call in the hot chat path.
let cached: ActivePolicy | null | undefined;

export function invalidatePolicyCache(): void {
  cached = undefined;
}

export function getActivePolicy(): ActivePolicy | null {
  if (cached !== undefined) return cached;

  const document = getActiveDocument();
  if (!document) {
    cached = null;
    return cached;
  }

  const rules = listRules(document.id).filter((r) => r.enabled);
  cached = {
    document,
    rules,
    actionRules: rules.filter((r) => r.kind === 'action'),
    conductRules: rules.filter((r) => r.kind === 'conduct'),
  };
  return cached;
}

// Defense in depth: any caller that executes a tool call directly — bypassing
// the resolver entirely — still cannot run something the active, enforcing
// policy explicitly denies. Used by ToolExecutor.execute() and by the
// /api/execute_tool approval-resume path.
export function hardDenyCheck(toolName: string, args: Record<string, unknown> | null | undefined): PolicyDecision | null {
  const active = getActivePolicy();
  if (!active || active.document.enforcement_mode !== 'enforce') return null;
  const decision = evaluateDocumentRules(active, toolName, args);
  return decision.status === 'Blocked' ? decision : null;
}
