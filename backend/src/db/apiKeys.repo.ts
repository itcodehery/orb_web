import crypto from 'crypto';
import { db } from './db';

export interface ToolsEnabled {
  fs: boolean;
  bash: boolean;
  web: boolean;
}

export interface ApiKeySummary {
  id: number;
  name: string;
  maskedKey: string;
  tools: ToolsEnabled;
  created_at: string;
  revoked_at: string | null;
}

export interface CreatedApiKey extends ApiKeySummary {
  key: string;
}

interface ApiKeyRow {
  id: number;
  name: string;
  key_hash: string;
  key_last4: string;
  tools_enabled: string;
  created_at: string;
  revoked_at: string | null;
}

function generateKey(): string {
  return 'orb_sk_' + crypto.randomBytes(16).toString('hex');
}

function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function toSummary(row: ApiKeyRow): ApiKeySummary {
  return {
    id: row.id,
    name: row.name,
    maskedKey: `orb_sk_****${row.key_last4}`,
    tools: JSON.parse(row.tools_enabled),
    created_at: row.created_at,
    revoked_at: row.revoked_at,
  };
}

export function createKey(name: string, tools: ToolsEnabled): CreatedApiKey {
  const key = generateKey();
  const key_hash = hashKey(key);
  const key_last4 = key.slice(-4);
  const created_at = new Date().toISOString();

  const info = db
    .prepare(
      `INSERT INTO api_keys (name, key_hash, key_last4, tools_enabled, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(name, key_hash, key_last4, JSON.stringify(tools), created_at);

  return {
    id: info.lastInsertRowid as number,
    name,
    key,
    maskedKey: `orb_sk_****${key_last4}`,
    tools,
    created_at,
    revoked_at: null,
  };
}

export function listKeys(): ApiKeySummary[] {
  const rows = db
    .prepare(`SELECT * FROM api_keys ORDER BY created_at DESC`)
    .all() as ApiKeyRow[];
  return rows.map(toSummary);
}

export function revokeKey(id: number): void {
  db.prepare(`UPDATE api_keys SET revoked_at = ? WHERE id = ?`).run(
    new Date().toISOString(),
    id
  );
}

export function updateKeyTools(id: number, tools: ToolsEnabled): void {
  db.prepare(`UPDATE api_keys SET tools_enabled = ? WHERE id = ?`).run(
    JSON.stringify(tools),
    id
  );
}

export function verifyKey(plaintext: string): ApiKeySummary | null {
  const key_hash = hashKey(plaintext);
  const row = db
    .prepare(`SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL`)
    .get(key_hash) as ApiKeyRow | undefined;
  return row ? toSummary(row) : null;
}
