import { db } from './db';

export interface AuditLogEntry {
  api_key_id: number;
  timestamp: string;
  endpoint: string;
  model?: string;
  request_messages: unknown;
  response_content?: string;
  tool_calls: unknown;
  tool_results: unknown;
  policy_decisions: unknown;
  latency_ms: number;
  tokens_in?: number | null;
  tokens_out?: number | null;
  status_code: number;
}

export interface AuditLogRow {
  id: number;
  api_key_id: number;
  key_name: string;
  timestamp: string;
  endpoint: string;
  model: string | null;
  tool_calls: string | null;
  status_code: number;
  latency_ms: number;
}

export function insertLog(entry: AuditLogEntry): void {
  db.prepare(
    `INSERT INTO audit_logs
      (api_key_id, timestamp, endpoint, model, request_messages, response_content,
       tool_calls, tool_results, policy_decisions, latency_ms, tokens_in, tokens_out, status_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    entry.api_key_id,
    entry.timestamp,
    entry.endpoint,
    entry.model ?? null,
    JSON.stringify(entry.request_messages ?? []),
    entry.response_content ?? '',
    JSON.stringify(entry.tool_calls ?? []),
    JSON.stringify(entry.tool_results ?? []),
    JSON.stringify(entry.policy_decisions ?? {}),
    entry.latency_ms,
    entry.tokens_in ?? null,
    entry.tokens_out ?? null,
    entry.status_code
  );
}

export function listLogs(limit: number = 50): AuditLogRow[] {
  return db
    .prepare(
      `SELECT audit_logs.id, audit_logs.api_key_id, api_keys.name as key_name,
              audit_logs.timestamp, audit_logs.endpoint, audit_logs.model,
              audit_logs.tool_calls, audit_logs.status_code, audit_logs.latency_ms
       FROM audit_logs
       JOIN api_keys ON api_keys.id = audit_logs.api_key_id
       ORDER BY audit_logs.timestamp DESC
       LIMIT ?`
    )
    .all(limit) as AuditLogRow[];
}
