export type RuleKind = 'action' | 'conduct';
export type RuleEffect = 'allow' | 'deny' | 'require_approval' | 'advise';
export type MatchField = 'command' | 'filepath' | 'dirpath' | 'query' | 'content' | '*';
export type MatchKind = 'any' | 'contains' | 'prefix' | 'glob' | 'regex';
export type RuleOrigin = 'compiled' | 'manual';
export type DocumentStatus = 'compiling' | 'review' | 'active' | 'archived' | 'failed';
export type EnforcementMode = 'enforce' | 'monitor';

export const TOOL_NAMES = ['execute_bash', 'read_file', 'write_file', 'list_directory', 'web_search', '*'] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export const MATCH_KINDS: MatchKind[] = ['any', 'contains', 'prefix', 'glob', 'regex'];
export const MATCH_FIELDS: MatchField[] = ['command', 'filepath', 'dirpath', 'query', 'content', '*'];
export const EFFECTS: RuleEffect[] = ['allow', 'deny', 'require_approval', 'advise'];

export interface PolicyRule {
  id: number;
  document_id: number;
  ordinal: number;
  kind: RuleKind;
  title: string;
  effect: RuleEffect;
  tool: ToolName | null;
  match_field: MatchField | null;
  match_kind: MatchKind | null;
  pattern: string | null;
  directive: string | null;
  source_excerpt: string | null;
  origin: RuleOrigin;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface PolicyDocument {
  id: number;
  title: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  source_hash: string;
  source_text: string;
  status: DocumentStatus;
  enforcement_mode: EnforcementMode;
  compile_model: string | null;
  compile_error: string | null;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
  activated_at: string | null;
}

export interface ActivePolicy {
  document: PolicyDocument;
  rules: PolicyRule[];
  actionRules: PolicyRule[];
  conductRules: PolicyRule[];
}

export type PolicyDecisionStatus = 'Allowed' | 'Blocked' | 'Requires Approval';
export type PolicyDecisionSource = 'document' | 'session' | 'api_key' | 'mode' | 'user';

export interface PolicyDecision {
  status: PolicyDecisionStatus;
  source: PolicyDecisionSource;
  reason: string;
  ruleId?: number;
  ruleTitle?: string;
  documentId?: number;
  monitored?: boolean;
}

export type PolicyChannel = 'chat' | 'api' | 'execute_tool' | 'executor' | 'judge' | 'dry_run';
export type PolicyEventDecision = 'allowed' | 'blocked' | 'approval_required' | 'approved' | 'denied' | 'monitored' | 'flagged';
export type PolicyEventSource = PolicyDecisionSource | 'judge';

// The "session layer" is whichever resolver already decided a status before
// the document layer is applied — Auto/Manual/Policy mode for cookie chat,
// or the API-key tool-scope check for /api/v1.
export interface PolicyContext {
  channel: PolicyChannel;
  userId?: string;
  sessionId?: number;
  apiKeyId?: number;
  allowApproval: boolean;
  sessionSource: 'mode' | 'session' | 'api_key';
}
