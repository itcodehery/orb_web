import { getActivePolicy, hardDenyCheck } from './engine';
import { evaluateToolCall, toSessionDecision } from './evaluate';
import { insertEvent } from '../db/policies.repo';
import { PolicyContext, PolicyDecision, PolicyDecisionSource, PolicyDecisionStatus, PolicyEventDecision } from './types';
import { ToolCall } from '../types';

function parseArgs(toolCall: ToolCall): Record<string, unknown> {
  const raw = toolCall.function.arguments;
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw as Record<string, unknown>;
}

function excerptArgs(args: Record<string, unknown>): string {
  return JSON.stringify(args).slice(0, 500);
}

const EVENT_DECISION_BY_STATUS: Record<PolicyDecisionStatus, PolicyEventDecision> = {
  Allowed: 'allowed',
  Blocked: 'blocked',
  'Requires Approval': 'approval_required',
};

export interface ResolverOptions {
  // The existing per-session resolver (buildPolicyResolver for cookie chat,
  // the API-key tool-scope check for v1) — unchanged, becomes the fallback layer.
  sessionResolver: (toolName: string) => string;
  sessionSource: PolicyDecisionSource;
  ctx: PolicyContext;
}

// Builds the getPolicyStatus function Agent.run expects: layers the active
// company policy over the session-level resolver (most-restrictive wins),
// logs one policy_events row per decision, and keeps Agent.ts itself DB-ignorant.
export function createPolicyResolver(options: ResolverOptions): (toolCall: ToolCall) => PolicyDecision {
  return (toolCall: ToolCall) => {
    const toolName = toolCall.function.name;
    const args = parseArgs(toolCall);
    const sessionDecision = toSessionDecision(options.sessionResolver(toolName) as PolicyDecisionStatus, options.sessionSource, toolName);
    const activePolicy = getActivePolicy();
    const result = evaluateToolCall(activePolicy, toolName, args, sessionDecision, options.ctx);

    if (result.monitored && result.documentDecision) {
      insertEvent({
        channel: options.ctx.channel,
        tool: toolName,
        argumentsExcerpt: excerptArgs(args),
        decision: 'monitored',
        source: result.documentDecision.source,
        documentId: result.documentDecision.documentId,
        ruleId: result.documentDecision.ruleId,
        userId: options.ctx.userId,
        sessionId: options.ctx.sessionId,
        apiKeyId: options.ctx.apiKeyId,
        message: result.documentDecision.reason,
      });
    }

    insertEvent({
      channel: options.ctx.channel,
      tool: toolName,
      argumentsExcerpt: excerptArgs(args),
      decision: EVENT_DECISION_BY_STATUS[result.decision.status],
      source: result.decision.source,
      documentId: result.decision.documentId,
      ruleId: result.decision.ruleId,
      userId: options.ctx.userId,
      sessionId: options.ctx.sessionId,
      apiKeyId: options.ctx.apiKeyId,
      message: result.decision.reason,
    });

    return result.decision;
  };
}

// POST /api/execute_tool resumes after the human already approved this exact
// call, so a document "require_approval" match is treated as satisfied —
// otherwise the resume path would ask for approval forever. Only an explicit
// "deny" rule still blocks it here.
export function evaluateApprovedToolCall(toolCall: ToolCall, ctx: PolicyContext): PolicyDecision | null {
  const toolName = toolCall.function.name;
  const args = parseArgs(toolCall);
  const blocked = hardDenyCheck(toolName, args);

  if (blocked) {
    insertEvent({
      channel: ctx.channel,
      tool: toolName,
      argumentsExcerpt: excerptArgs(args),
      decision: 'blocked',
      source: blocked.source,
      documentId: blocked.documentId,
      ruleId: blocked.ruleId,
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      message: blocked.reason,
    });
    return blocked;
  }

  insertEvent({
    channel: ctx.channel,
    tool: toolName,
    argumentsExcerpt: excerptArgs(args),
    decision: 'approved',
    source: 'user',
    userId: ctx.userId,
    sessionId: ctx.sessionId,
    message: 'Approved by user.',
  });
  return null;
}

// Records that the user denied an approval request, so denials show up in
// the policy events audit trail alongside blocks and approvals.
export function recordDenial(toolCall: ToolCall, ctx: PolicyContext): void {
  const toolName = toolCall.function.name;
  const args = parseArgs(toolCall);
  insertEvent({
    channel: ctx.channel,
    tool: toolName,
    argumentsExcerpt: excerptArgs(args),
    decision: 'denied',
    source: 'user',
    userId: ctx.userId,
    sessionId: ctx.sessionId,
    message: 'Denied by user.',
  });
}
