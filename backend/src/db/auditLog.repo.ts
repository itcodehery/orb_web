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

export interface Anomaly {
  severity: 'warning' | 'critical';
  message: string;
}

export interface AnalyticsSummary {
  windowHours: number;
  totalRequests: number;
  blockedCount: number;
  errorCount: number;
  avgLatencyMs: number;
  maxLatencyMs: number;
  hourlyVolume: { hour: string; count: number }[];
  topTools: { name: string; count: number }[];
  anomalies: Anomaly[];
}

interface RawRow {
  timestamp: string;
  key_name: string;
  status_code: number;
  latency_ms: number;
  policy_decisions: string;
  tool_calls: string;
}

export function getAnalyticsSummary(hours: number = 24): AnalyticsSummary {
  const sinceIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const rows = db
    .prepare(
      `SELECT audit_logs.timestamp, api_keys.name as key_name, audit_logs.status_code,
              audit_logs.latency_ms, audit_logs.policy_decisions, audit_logs.tool_calls
       FROM audit_logs
       JOIN api_keys ON api_keys.id = audit_logs.api_key_id
       WHERE audit_logs.timestamp >= ?
       ORDER BY audit_logs.timestamp ASC`
    )
    .all(sinceIso) as RawRow[];

  const totalRequests = rows.length;
  const errorCount = rows.filter(r => r.status_code >= 500).length;
  const blockedCount = rows.filter(r => (r.policy_decisions || '').includes('Blocked')).length;
  const latencies = rows.map(r => r.latency_ms).filter(l => typeof l === 'number');
  const avgLatencyMs = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
  const maxLatencyMs = latencies.length ? Math.max(...latencies) : 0;

  const hourlyBuckets = new Map<string, number>();
  const toolTally = new Map<string, number>();
  const perKeyStats = new Map<string, { total: number; blocked: number }>();

  for (const r of rows) {
    const hour = r.timestamp.slice(0, 13) + ':00'; // YYYY-MM-DDTHH:00
    hourlyBuckets.set(hour, (hourlyBuckets.get(hour) || 0) + 1);

    try {
      const calls = JSON.parse(r.tool_calls || '[]');
      for (const c of calls) {
        const name = c?.function?.name;
        if (name) toolTally.set(name, (toolTally.get(name) || 0) + 1);
      }
    } catch { /* malformed row, skip */ }

    const stat = perKeyStats.get(r.key_name) || { total: 0, blocked: 0 };
    stat.total++;
    if ((r.policy_decisions || '').includes('Blocked')) stat.blocked++;
    perKeyStats.set(r.key_name, stat);
  }

  const hourlyVolume = Array.from(hourlyBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hour, count]) => ({ hour, count }));

  const topTools = Array.from(toolTally.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  const anomalies: Anomaly[] = [];

  const lastHourRows = rows.filter(r => r.timestamp >= new Date(Date.now() - 60 * 60 * 1000).toISOString());
  if (lastHourRows.length >= 5) {
    const lastHourErrorRate = lastHourRows.filter(r => r.status_code >= 500).length / lastHourRows.length;
    if (lastHourErrorRate > 0.2) {
      anomalies.push({ severity: 'critical', message: `Elevated error rate in the last hour: ${Math.round(lastHourErrorRate * 100)}% of requests failed.` });
    }
  }

  for (const [keyName, stat] of perKeyStats.entries()) {
    if (stat.total >= 3 && stat.blocked / stat.total > 0.5) {
      anomalies.push({ severity: 'warning', message: `API key "${keyName}" has an unusually high block rate: ${stat.blocked}/${stat.total} calls blocked.` });
    }
  }

  if (latencies.length >= 5 && avgLatencyMs > 200) {
    const recentAvg = latencies.slice(-5).reduce((a, b) => a + b, 0) / 5;
    if (recentAvg > avgLatencyMs * 2) {
      anomalies.push({ severity: 'warning', message: `Latency spike: recent requests averaging ${Math.round(recentAvg)}ms vs ${avgLatencyMs}ms overall.` });
    }
  }

  return { windowHours: hours, totalRequests, blockedCount, errorCount, avgLatencyMs, maxLatencyMs, hourlyVolume, topTools, anomalies };
}
