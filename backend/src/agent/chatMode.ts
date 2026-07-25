export type ChatMode = 'Auto' | 'Policy' | 'Manual';

export function validChatMode(value: unknown): ChatMode {
  return value === 'Auto' || value === 'Manual' ? value : 'Policy';
}

/**
 * Auto: every tool call is allowed, ignoring configured policies entirely.
 * Manual: every tool call requires human approval, ignoring configured policies.
 * Policy: the configured toolPolicies apply (existing behavior).
 */
export function buildPolicyResolver(
  chatMode: ChatMode,
  toolPolicies: Record<string, string> | undefined
): (toolName: string) => string {
  return (toolName: string) => {
    if (chatMode === 'Auto') return 'Allowed';
    if (chatMode === 'Manual') return 'Requires Approval';
    if (toolPolicies && toolPolicies[toolName]) return toolPolicies[toolName];
    return 'Allowed';
  };
}
