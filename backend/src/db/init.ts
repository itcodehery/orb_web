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

    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id);

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT 'New Chat',
      messages TEXT NOT NULL DEFAULT '[]',
      policies TEXT NOT NULL DEFAULT '[]',
      settings TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_status ON sessions(user_id, status);

    CREATE TABLE IF NOT EXISTS connectors (
      provider TEXT PRIMARY KEY,
      api_key TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS policy_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      source_hash TEXT NOT NULL,
      source_text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'compiling',
      enforcement_mode TEXT NOT NULL DEFAULT 'enforce',
      compile_model TEXT,
      compile_error TEXT,
      uploaded_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      activated_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_policy_documents_status ON policy_documents(status);

    CREATE TABLE IF NOT EXISTS policy_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      ordinal INTEGER NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      effect TEXT NOT NULL,
      tool TEXT,
      match_field TEXT,
      match_kind TEXT,
      pattern TEXT,
      directive TEXT,
      source_excerpt TEXT,
      origin TEXT NOT NULL DEFAULT 'compiled',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (document_id) REFERENCES policy_documents(id)
    );

    CREATE INDEX IF NOT EXISTS idx_policy_rules_document ON policy_rules(document_id, ordinal);

    CREATE TABLE IF NOT EXISTS policy_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      document_id INTEGER,
      rule_id INTEGER,
      user_id TEXT,
      session_id INTEGER,
      api_key_id INTEGER,
      channel TEXT NOT NULL,
      tool TEXT,
      arguments_excerpt TEXT,
      decision TEXT NOT NULL,
      source TEXT NOT NULL,
      message TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_policy_events_time ON policy_events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_policy_events_session ON policy_events(session_id);
  `);
}
