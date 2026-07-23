import { db } from './db';

export interface SessionSettings {
  systemPrompt: string;
  selectedModel: string;
  chatMode: string;
  performanceMode: 'low' | 'high';
  inputLimitIdx: number;
  outputLimitIdx: number;
  tools: { id: string; name: string; active: boolean }[];
}

export interface SessionRow {
  id: number;
  user_id: string;
  title: string;
  messages: any[];
  policies: any[];
  settings: SessionSettings;
  status: 'active' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface SessionSummary {
  id: number;
  title: string;
  status: 'active' | 'completed';
  created_at: string;
  updated_at: string;
  messageCount: number;
  avgLatencyMs: number | null;
  avgRiskScore: number | null;
}

interface SessionDbRow {
  id: number;
  user_id: string;
  title: string;
  messages: string;
  policies: string;
  settings: string;
  status: string;
  created_at: string;
  updated_at: string;
}

function toSessionRow(row: SessionDbRow): SessionRow {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    messages: JSON.parse(row.messages),
    policies: JSON.parse(row.policies),
    settings: JSON.parse(row.settings),
    status: row.status as 'active' | 'completed',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function getActiveSession(userId: string): SessionRow | null {
  const row = db
    .prepare(`SELECT * FROM sessions WHERE user_id = ? AND status = 'active' LIMIT 1`)
    .get(userId) as SessionDbRow | undefined;
  return row ? toSessionRow(row) : null;
}

export function createActiveSession(userId: string): SessionRow {
  const now = new Date().toISOString();
  db.prepare(`UPDATE sessions SET status = 'completed', updated_at = ? WHERE user_id = ? AND status = 'active'`).run(
    now,
    userId
  );

  const info = db
    .prepare(
      `INSERT INTO sessions (user_id, title, messages, policies, settings, status, created_at, updated_at)
       VALUES (?, 'New Chat', '[]', '[]', '{}', 'active', ?, ?)`
    )
    .run(userId, now, now);
  return {
    id: info.lastInsertRowid as number,
    user_id: userId,
    title: 'New Chat',
    messages: [],
    policies: [],
    settings: {} as SessionSettings,
    status: 'active',
    created_at: now,
    updated_at: now,
  };
}

function deriveTitle(messages: any[]): string | null {
  const firstUser = messages.find((m: any) => m.role === 'user' && m.content);
  if (!firstUser) return null;
  const text = String(firstUser.content).trim();
  return text.length > 60 ? text.slice(0, 60) + '…' : text;
}

export function upsertActiveMessages(userId: string, messages: any[]): SessionRow {
  const session = getActiveSession(userId) || createActiveSession(userId);
  const now = new Date().toISOString();
  const title = session.title === 'New Chat' ? (deriveTitle(messages) || session.title) : session.title;

  db.prepare(`UPDATE sessions SET messages = ?, title = ?, updated_at = ? WHERE id = ?`).run(
    JSON.stringify(messages),
    title,
    now,
    session.id
  );

  return { ...session, messages, title, updated_at: now };
}

export function patchSettings(userId: string, data: { policies?: any[]; settings?: any }): SessionRow {
  const session = getActiveSession(userId) || createActiveSession(userId);
  const now = new Date().toISOString();
  const policies = data.policies !== undefined ? data.policies : session.policies;
  const settings = data.settings !== undefined ? data.settings : session.settings;

  db.prepare(`UPDATE sessions SET policies = ?, settings = ?, updated_at = ? WHERE id = ?`).run(
    JSON.stringify(policies),
    JSON.stringify(settings),
    now,
    session.id
  );

  return { ...session, policies, settings, updated_at: now };
}

export function patchMessageRiskScore(
  sessionId: number,
  userId: string,
  messageIndex: number,
  riskScore: number
): void {
  const row = db
    .prepare(`SELECT * FROM sessions WHERE id = ? AND user_id = ?`)
    .get(sessionId, userId) as SessionDbRow | undefined;
  if (!row) return;

  const messages = JSON.parse(row.messages);
  if (!Array.isArray(messages) || messageIndex < 0 || messageIndex >= messages.length) return;

  messages[messageIndex] = { ...messages[messageIndex], riskScore };
  db.prepare(`UPDATE sessions SET messages = ?, updated_at = ? WHERE id = ?`).run(
    JSON.stringify(messages),
    new Date().toISOString(),
    sessionId
  );
}

export function completeActiveSession(userId: string): void {
  db.prepare(`UPDATE sessions SET status = 'completed', updated_at = ? WHERE user_id = ? AND status = 'active'`).run(
    new Date().toISOString(),
    userId
  );
}

export function listSessions(userId: string): SessionSummary[] {
  const rows = db
    .prepare(`SELECT * FROM sessions WHERE user_id = ? ORDER BY updated_at DESC`)
    .all(userId) as SessionDbRow[];

  return rows.map(row => {
    const messages: any[] = JSON.parse(row.messages);
    const latencies = messages.map(m => m.totalMs).filter((v): v is number => typeof v === 'number');
    const risks = messages.map(m => m.riskScore).filter((v): v is number => typeof v === 'number');
    return {
      id: row.id,
      title: row.title,
      status: row.status as 'active' | 'completed',
      created_at: row.created_at,
      updated_at: row.updated_at,
      messageCount: messages.length,
      avgLatencyMs: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
      avgRiskScore: risks.length ? Math.round(risks.reduce((a, b) => a + b, 0) / risks.length) : null,
    };
  });
}

export function getSession(id: number, userId: string): SessionRow | null {
  const row = db
    .prepare(`SELECT * FROM sessions WHERE id = ? AND user_id = ?`)
    .get(id, userId) as SessionDbRow | undefined;
  return row ? toSessionRow(row) : null;
}

export function resumeSession(id: number, userId: string): SessionRow | null {
  const target = db
    .prepare(`SELECT * FROM sessions WHERE id = ? AND user_id = ?`)
    .get(id, userId) as SessionDbRow | undefined;
  if (!target) return null;

  const now = new Date().toISOString();
  db.prepare(`UPDATE sessions SET status = 'completed', updated_at = ? WHERE user_id = ? AND status = 'active' AND id != ?`).run(
    now,
    userId,
    id
  );
  db.prepare(`UPDATE sessions SET status = 'active', updated_at = ? WHERE id = ?`).run(now, id);

  return getSession(id, userId);
}
