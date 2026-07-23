import { db } from './db';

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      key_last4 TEXT NOT NULL,
      tools_enabled TEXT NOT NULL,
      created_at TEXT NOT NULL,
      revoked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      api_key_id INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      model TEXT,
      request_messages TEXT,
      response_content TEXT,
      tool_calls TEXT,
      tool_results TEXT,
      policy_decisions TEXT,
      latency_ms INTEGER,
      tokens_in INTEGER,
      tokens_out INTEGER,
      status_code INTEGER,
      FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
    );
  `);
}
