import { matchesRule } from './matcher';
import { ActivePolicy, PolicyContext, PolicyDecision, PolicyDecisionSource, PolicyDecisionStatus, PolicyRule } from './types';

export const STATUS_RANK: Record<PolicyDecisionStatus, number> = {
  Allowed: 0,
  'Requires Approval': 1,
  Blocked: 2,
};

// Blocked > Requires Approval > Allowed. On a tie, `a` wins — callers pass
// the document decision first so its attribution (rule title, "why") is
// preferred over the generic session-layer reason when both agree.
export function mostRestrictive(a: PolicyDecision, b: PolicyDecision): PolicyDecision {
  return STATUS_RANK[a.status] >= STATUS_RANK[b.status] ? a : b;
}

export function toSessionDecision(status: PolicyDecisionStatus, source: PolicyDecisionSource, toolName: string): PolicyDecision {
  const reason =
    source === 'mode'
      ? `Chat mode sets ${toolName} to ${status}.`
      : source === 'api_key'
        ? `This API key's tool scope sets ${toolName} to ${status}.`
        : source === 'session'
          ? `This session's policy rules set ${toolName} to ${status}.`
          : `${toolName} is ${status}.`;
  return { status, source, reason };
}

// Evaluates only the active document's enabled action rules against one
// tool call. Pure and DB-free — exercised directly by scripts/eval-policy-engine.ts.
export function evaluateDocumentRules(activePolicy: ActivePolicy, toolName: string, args: Record<string, unknown> | null | undefined): PolicyDecision {
  const matched: PolicyRule[] = activePolicy.actionRules.filter((rule) => rule.enabled && matchesRule(rule, toolName, args));

  const deny = matched.find((r) => r.effect === 'deny');
  if (deny) {
    return {
      status: 'Blocked',
      source: 'document',
      reason: `Blocked by company policy "${activePolicy.document.title}" — rule "${deny.title}".`,
      ruleId: deny.id,
      ruleTitle: deny.title,
      documentId: activePolicy.document.id,
    };
  }

  const approval = matched.find((r) => r.effect === 'require_approval');
  if (approval) {
    return {
      status: 'Requires Approval',
      source: 'document',
      reason: `Company policy "${activePolicy.document.title}" requires human approval — rule "${approval.title}".`,
      ruleId: approval.id,
      ruleTitle: approval.title,
      documentId: activePolicy.document.id,
    };
  }

  const allow = matched.find((r) => r.effect === 'allow');
  if (allow) {
    return {
      status: 'Allowed',
      source: 'document',
      reason: `Allowed by company policy "${activePolicy.document.title}" — rule "${allow.title}".`,
      ruleId: allow.id,
      ruleTitle: allow.title,
      documentId: activePolicy.document.id,
    };
  }

  return {
    status: 'Allowed',
    source: 'document',
    reason: `No matching rule in company policy "${activePolicy.document.title}".`,
    documentId: activePolicy.document.id,
  };
}

export interface EvaluationResult {
  decision: PolicyDecision;
  // The raw document-layer decision before monitor-mode dampening — null when
  // there is no active document, or when it didn't end up restricting anything.
  documentDecision: PolicyDecision | null;
  monitored: boolean;
}

// The layered merge: mostRestrictive(documentDecision, sessionDecision),
// with monitor mode suppressing enforcement (log-only) and /api/v1 (allowApproval
// false) degrading a document "Requires Approval" to "Blocked" since there is
// no human present to ask.
export function evaluateToolCall(
  activePolicy: ActivePolicy | null,
  toolName: string,
  args: Record<string, unknown> | null | undefined,
  sessionDecision: PolicyDecision,
  ctx: PolicyContext
): EvaluationResult {
  if (!activePolicy) {
    return { decision: sessionDecision, documentDecision: null, monitored: false };
  }

  const documentDecision = evaluateDocumentRules(activePolicy, toolName, args);

  if (activePolicy.document.enforcement_mode === 'monitor') {
    const wouldBe = mostRestrictive(documentDecision, sessionDecision);
    const restricts = STATUS_RANK[wouldBe.status] > STATUS_RANK[sessionDecision.status];
    return { decision: sessionDecision, documentDecision: restricts ? wouldBe : null, monitored: restricts };
  }

  let merged = mostRestrictive(documentDecision, sessionDecision);

  if (merged.status === 'Requires Approval' && !ctx.allowApproval) {
    merged = {
      ...merged,
      status: 'Blocked',
      reason: `${merged.reason} Human approval is unavailable on the programmatic API — the action is blocked instead.`,
    };
  }

  return { decision: merged, documentDecision, monitored: false };
}
