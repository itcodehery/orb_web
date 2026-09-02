import { db } from './db';
import {
  PolicyDocument, PolicyRule, DocumentStatus, EnforcementMode, RuleKind, RuleEffect, ToolName, MatchField, MatchKind, RuleOrigin,
  PolicyChannel, PolicyEventDecision, PolicyEventSource,
} from '../policy/types';
import { ValidatedRule } from '../policy/validateRule';

interface PolicyDocumentDbRow {
  id: number;
  title: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  source_hash: string;
  source_text: string;
  status: string;
  enforcement_mode: string;
  compile_model: string | null;
  compile_error: string | null;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
  activated_at: string | null;
}

interface PolicyRuleDbRow {
  id: number;
  document_id: number;
  ordinal: number;
  kind: string;
  title: string;
  effect: string;
  tool: string | null;
  match_field: string | null;
  match_kind: string | null;
  pattern: string | null;
  directive: string | null;
  source_excerpt: string | null;
  origin: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

function toPolicyDocumentRow(row: PolicyDocumentDbRow): PolicyDocument {
  return {
    id: row.id,
    title: row.title,
    filename: row.filename,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    source_hash: row.source_hash,
    source_text: row.source_text,
    status: row.status as DocumentStatus,
    enforcement_mode: row.enforcement_mode as EnforcementMode,
    compile_model: row.compile_model,
    compile_error: row.compile_error,
    uploaded_by: row.uploaded_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    activated_at: row.activated_at,
  };
}

function toPolicyRuleRow(row: PolicyRuleDbRow): PolicyRule {
  return {
    id: row.id,
    document_id: row.document_id,
    ordinal: row.ordinal,
    kind: row.kind as RuleKind,
    title: row.title,
    effect: row.effect as RuleEffect,
    tool: row.tool as ToolName | null,
    match_field: row.match_field as MatchField | null,
    match_kind: row.match_kind as MatchKind | null,
    pattern: row.pattern,
    directive: row.directive,
    source_excerpt: row.source_excerpt,
    origin: row.origin as RuleOrigin,
    enabled: row.enabled === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface DocumentSummary extends PolicyDocument {
  actionRuleCount: number;
  conductRuleCount: number;
  enabledRuleCount: number;
}

export interface CreateDocumentInput {
  title: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  source_hash: string;
  source_text: string;
  compile_model: string | null;
  uploaded_by: string;
}

export function createDocument(input: CreateDocumentInput): PolicyDocument {
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO policy_documents (title, filename, mime_type, size_bytes, source_hash, source_text, status, enforcement_mode, compile_model, compile_error, uploaded_by, created_at, updated_at, activated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'compiling', 'enforce', ?, NULL, ?, ?, ?, NULL)`
    )
    .run(input.title, input.filename, input.mime_type, input.size_bytes, input.source_hash, input.source_text, input.compile_model, input.uploaded_by, now, now);
  return getDocument(info.lastInsertRowid as number)!;
}

export function getDocument(id: number): PolicyDocument | null {
  const row = db.prepare(`SELECT * FROM policy_documents WHERE id = ?`).get(id) as PolicyDocumentDbRow | undefined;
  return row ? toPolicyDocumentRow(row) : null;
}

export function getActiveDocument(): PolicyDocument | null {
  const row = db.prepare(`SELECT * FROM policy_documents WHERE status = 'active' LIMIT 1`).get() as PolicyDocumentDbRow | undefined;
  return row ? toPolicyDocumentRow(row) : null;
}

export function listDocuments(): DocumentSummary[] {
  const rows = db.prepare(`SELECT * FROM policy_documents ORDER BY created_at DESC`).all() as PolicyDocumentDbRow[];
  return rows.map((row) => {
    const doc = toPolicyDocumentRow(row);
    const counts = db
      .prepare(`SELECT kind, COUNT(*) as count, SUM(enabled) as enabledCount FROM policy_rules WHERE document_id = ? GROUP BY kind`)
      .all(doc.id) as { kind: string; count: number; enabledCount: number | null }[];
    let actionRuleCount = 0;
    let conductRuleCount = 0;
    let enabledRuleCount = 0;
    for (const c of counts) {
      if (c.kind === 'action') actionRuleCount = c.count;
      if (c.kind === 'conduct') conductRuleCount = c.count;
      enabledRuleCount += c.enabledCount || 0;
    }
    return { ...doc, actionRuleCount, conductRuleCount, enabledRuleCount };
  });
}

export function updateDocument(id: number, patch: { title?: string; enforcement_mode?: EnforcementMode }): PolicyDocument {
  const current = getDocument(id)!;
  const now = new Date().toISOString();
  const title = patch.title !== undefined ? patch.title : current.title;
  const mode = patch.enforcement_mode !== undefined ? patch.enforcement_mode : current.enforcement_mode;
  db.prepare(`UPDATE policy_documents SET title = ?, enforcement_mode = ?, updated_at = ? WHERE id = ?`).run(title, mode, now, id);
  return getDocument(id)!;
}

export function setDocumentStatus(id: number, status: DocumentStatus, extra: { compile_error?: string | null; compile_model?: string | null } = {}): void {
  const current = getDocument(id);
  if (!current) return;
  const now = new Date().toISOString();
  const compileError = extra.compile_error !== undefined ? extra.compile_error : current.compile_error;
  const compileModel = extra.compile_model !== undefined ? extra.compile_model : current.compile_model;
  db.prepare(`UPDATE policy_documents SET status = ?, compile_error = ?, compile_model = ?, updated_at = ? WHERE id = ?`).run(status, compileError, compileModel, now, id);
}

// Archives whatever document is currently active (if any other than this
// one), then activates this document. Runs in a single transaction so there
// is never a moment with zero or two active documents.
export function activateDocument(id: number): PolicyDocument {
  const now = new Date().toISOString();
  const tx = db.transaction((docId: number) => {
    db.prepare(`UPDATE policy_documents SET status = 'archived', updated_at = ? WHERE status = 'active' AND id != ?`).run(now, docId);
    db.prepare(`UPDATE policy_documents SET status = 'active', updated_at = ?, activated_at = ? WHERE id = ?`).run(now, now, docId);
  });
  tx(id);
  return getDocument(id)!;
}

export function archiveDocument(id: number): PolicyDocument {
  const now = new Date().toISOString();
  db.prepare(`UPDATE policy_documents SET status = 'archived', updated_at = ? WHERE id = ?`).run(now, id);
  return getDocument(id)!;
}

// Rules reference the document via an unenforced-at-the-app-level FK, so
// rules are deleted first, matching the sessions/memories delete convention.
export function deleteDocument(id: number): void {
  const tx = db.transaction((docId: number) => {
    db.prepare(`DELETE FROM policy_rules WHERE document_id = ?`).run(docId);
    db.prepare(`DELETE FROM policy_documents WHERE id = ?`).run(docId);
  });
  tx(id);
}

export function listRules(documentId: number): PolicyRule[] {
  const rows = db.prepare(`SELECT * FROM policy_rules WHERE document_id = ? ORDER BY ordinal ASC`).all(documentId) as PolicyRuleDbRow[];
  return rows.map(toPolicyRuleRow);
}

export function getRule(documentId: number, ruleId: number): PolicyRule | null {
  const row = db.prepare(`SELECT * FROM policy_rules WHERE id = ? AND document_id = ?`).get(ruleId, documentId) as PolicyRuleDbRow | undefined;
  return row ? toPolicyRuleRow(row) : null;
}

export function countEnabledRules(documentId: number): number {
  const row = db.prepare(`SELECT COUNT(*) as count FROM policy_rules WHERE document_id = ? AND enabled = 1`).get(documentId) as { count: number };
  return row.count;
}

export function insertRules(documentId: number, rules: ValidatedRule[], origin: RuleOrigin): PolicyRule[] {
  if (rules.length === 0) return [];
  const now = new Date().toISOString();
  const maxRow = db.prepare(`SELECT COALESCE(MAX(ordinal), 0) as maxOrdinal FROM policy_rules WHERE document_id = ?`).get(documentId) as { maxOrdinal: number };
  const insert = db.prepare(
    `INSERT INTO policy_rules (document_id, ordinal, kind, title, effect, tool, match_field, match_kind, pattern, directive, source_excerpt, origin, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  );
  const ids: number[] = [];
  const tx = db.transaction((items: ValidatedRule[]) => {
    let ordinal = maxRow.maxOrdinal;
    for (const rule of items) {
      ordinal += 1;
      const info = insert.run(
        documentId, ordinal, rule.kind, rule.title, rule.effect, rule.tool, rule.match_field, rule.match_kind, rule.pattern, rule.directive, rule.source_excerpt, origin, now, now
      );
      ids.push(info.lastInsertRowid as number);
    }
  });
  tx(rules);
  return ids.map((id) => {
    const row = db.prepare(`SELECT * FROM policy_rules WHERE id = ?`).get(id) as PolicyRuleDbRow;
    return toPolicyRuleRow(row);
  });
}

export function updateRule(documentId: number, ruleId: number, rule: ValidatedRule, enabled?: boolean): PolicyRule | null {
  const existing = getRule(documentId, ruleId);
  if (!existing) return null;
  const nextEnabled = enabled === undefined ? existing.enabled : enabled;
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE policy_rules SET kind = ?, title = ?, effect = ?, tool = ?, match_field = ?, match_kind = ?, pattern = ?, directive = ?, source_excerpt = ?, enabled = ?, updated_at = ?
     WHERE id = ? AND document_id = ?`
  ).run(rule.kind, rule.title, rule.effect, rule.tool, rule.match_field, rule.match_kind, rule.pattern, rule.directive, rule.source_excerpt, nextEnabled ? 1 : 0, now, ruleId, documentId);
  return getRule(documentId, ruleId);
}

export function deleteRule(documentId: number, ruleId: number): boolean {
  const info = db.prepare(`DELETE FROM policy_rules WHERE id = ? AND document_id = ?`).run(ruleId, documentId);
  return info.changes > 0;
}

// Drops compiled rules ahead of a recompile; manually-added rules (origin
// 'manual') are deliberately left in place.
export function deleteCompiledRules(documentId: number): void {
  db.prepare(`DELETE FROM policy_rules WHERE document_id = ? AND origin = 'compiled'`).run(documentId);
}

export interface PolicyEventInput {
  channel: PolicyChannel;
  tool?: string | null;
  argumentsExcerpt?: string | null;
  decision: PolicyEventDecision;
  source: PolicyEventSource;
  documentId?: number | null;
  ruleId?: number | null;
  userId?: string | null;
  sessionId?: number | null;
  apiKeyId?: number | null;
  message?: string | null;
}

export function insertEvent(input: PolicyEventInput): void {
  db.prepare(
    `INSERT INTO policy_events (timestamp, document_id, rule_id, user_id, session_id, api_key_id, channel, tool, arguments_excerpt, decision, source, message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    new Date().toISOString(),
    input.documentId ?? null,
    input.ruleId ?? null,
    input.userId ?? null,
    input.sessionId ?? null,
    input.apiKeyId ?? null,
    input.channel,
    input.tool ?? null,
    input.argumentsExcerpt ?? null,
    input.decision,
    input.source,
    input.message ?? null
  );
}

export interface PolicyEventRow {
  id: number;
  timestamp: string;
  document_id: number | null;
  rule_id: number | null;
  user_id: string | null;
  session_id: number | null;
  api_key_id: number | null;
  channel: string;
  tool: string | null;
  arguments_excerpt: string | null;
  decision: string;
  source: string;
  message: string | null;
  rule_title: string | null;
  document_title: string | null;
}

export function listEvents(limit: number): PolicyEventRow[] {
  return db
    .prepare(
      `SELECT pe.*, pr.title as rule_title, pd.title as document_title
       FROM policy_events pe
       LEFT JOIN policy_rules pr ON pr.id = pe.rule_id
       LEFT JOIN policy_documents pd ON pd.id = pe.document_id
       ORDER BY pe.id DESC
       LIMIT ?`
    )
    .all(limit) as PolicyEventRow[];
}

export interface EventStats {
  windowHours: number;
  total: number;
  blocked: number;
  approvalRequired: number;
  approved: number;
  denied: number;
  monitored: number;
  flagged: number;
  allowed: number;
}

export function getEventStats(hours: number): EventStats {
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const rows = db
    .prepare(`SELECT decision, COUNT(*) as count FROM policy_events WHERE timestamp >= ? GROUP BY decision`)
    .all(since) as { decision: string; count: number }[];
  const counts: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    counts[row.decision] = row.count;
    total += row.count;
  }
  return {
    windowHours: hours,
    total,
    blocked: counts['blocked'] || 0,
    approvalRequired: counts['approval_required'] || 0,
    approved: counts['approved'] || 0,
    denied: counts['denied'] || 0,
    monitored: counts['monitored'] || 0,
    flagged: counts['flagged'] || 0,
    allowed: counts['allowed'] || 0,
  };
}
