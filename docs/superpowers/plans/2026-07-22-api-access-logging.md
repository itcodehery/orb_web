# API Access + Audit Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let external systems call Orb's agent via a scoped, revocable API key, with every call durably audit-logged to a new local SQLite store, plus a dashboard screen to manage keys and see that logging works.

**Architecture:** New `backend/src/db/` module (SQLite via `better-sqlite3`) backs two tables (`api_keys`, `audit_logs`). Internal CRUD routes let the dashboard manage keys (unauthenticated, matching the existing internal-API trust model). A new `/api/v1/*` namespace, gated by a bearer-token middleware, reuses the existing `Agent`/`Ollama` machinery unchanged but resolves tool policy from the calling key's `tools_enabled` flags instead of a request-supplied `toolPolicies` object, and logs one row per exchange. The frontend gets a new `ApiScreen` reachable from a new Appbar icon.

**Tech Stack:** Node/Express/TypeScript (`tsx`) backend, `better-sqlite3` (new dep), Next.js/React frontend — no new frontend deps.

## Global Constraints

- No test framework exists in either package (`backend/package.json`, `frontend/package.json` both confirmed) — every task verifies via manual `curl`/console output, not automated tests, matching how the existing codebase (and the prior Performance Mode work) was verified.
- Key format: `orb_sk_` + 32 hex chars (`crypto.randomBytes(16).toString('hex')`). Hash: `crypto.createHash('sha256')`. Plaintext is returned once at creation and never persisted.
- API-key-gated calls never produce `'Requires Approval'` — enabling a tool for a key is the consent; disabled tools resolve to `'Blocked'`. (Decided during brainstorming: no human is on the other end of a headless API call.)
- Internal dashboard endpoints (`/api/chat`, `/api/models`, `/api/execute_tool`) stay exactly as they are — unauthenticated, not logged. Only `/api/v1/*` is key-gated and logged.
- Tool flag → tool name mapping used everywhere: `fs → read_file`, `bash → execute_bash`, `web → web_search` (confirmed exact names via `grep "name = " backend/src/tools/*.ts`).
- Base URL shown in the UI: `http://localhost:3001/api/v1`.
- Spec refinement made during planning (not in the original spec doc, needed to satisfy it): the `api_keys` table needs a `key_last4` column to render `orb_sk_****<last4>` masking, since only a hash — not the plaintext — is stored after creation, and a hash cannot be partially displayed.

---

### Task 1: SQLite storage foundation

**Files:**
- Modify: `backend/package.json` (add `better-sqlite3` dependency)
- Create: `backend/src/db/db.ts`
- Create: `backend/src/db/init.ts`
- Modify: `backend/src/index.ts`
- Modify: `backend/.gitignore`

**Interfaces:**
- Produces: `db` (a `better-sqlite3` `Database` instance) from `backend/src/db/db.ts`; `initDb(): void` from `backend/src/db/init.ts`. Later tasks import `db` to prepare statements and call `initDb()` once at boot.

- [ ] **Step 1: Add the dependency**

```bash
cd backend && npm install better-sqlite3@^13.0.1
```
(`better-sqlite3` ships its own TypeScript types — no separate `@types` package needed.)

- [ ] **Step 2: Create `backend/src/db/db.ts`**

```ts
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dataDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'orb.db');
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
```

- [ ] **Step 3: Create `backend/src/db/init.ts`**

```ts
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
```

- [ ] **Step 4: Wire `initDb()` into server boot**

In `backend/src/index.ts`, add the import and call it before `app.listen`:

```ts
import { initDb } from './db/init';
```
(add alongside the other imports near the top)

```ts
initDb();

app.listen(PORT, () => {
```
(replace the existing `app.listen(PORT, () => {` line — `initDb()` goes immediately before it)

- [ ] **Step 5: Ignore the data directory**

Append to `backend/.gitignore`:
```
# sqlite data
/data
```

- [ ] **Step 6: Verify**

```bash
cd backend && npm run dev
```
Expected: server starts with no errors (same `Agent backend server running on http://localhost:3001` line as before).

In another terminal:
```bash
sqlite3 backend/data/orb.db ".tables"
```
Expected output: `api_keys    audit_logs`

- [ ] **Step 7: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/db/db.ts backend/src/db/init.ts backend/src/index.ts backend/.gitignore
git commit -m "feat: add SQLite storage foundation for API keys and audit logs"
```

---

### Task 2: API keys repository

**Files:**
- Create: `backend/src/db/apiKeys.repo.ts`

**Interfaces:**
- Consumes: `db` from `backend/src/db/db.ts` (Task 1).
- Produces: `ToolsEnabled` (`{fs, bash, web}` booleans), `ApiKeySummary` (`{id, name, maskedKey, tools, created_at, revoked_at}`), `CreatedApiKey` (`ApiKeySummary & {key: string}`), and functions `createKey(name: string, tools: ToolsEnabled): CreatedApiKey`, `listKeys(): ApiKeySummary[]`, `revokeKey(id: number): void`, `updateKeyTools(id: number, tools: ToolsEnabled): void`, `verifyKey(plaintext: string): ApiKeySummary | null`. Task 4 (routes) and Task 5/6 (v1 auth + chat) depend on these exact names.

- [ ] **Step 1: Create `backend/src/db/apiKeys.repo.ts`**

```ts
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
```

- [ ] **Step 2: Verify with a throwaway script**

Create `backend/scripts/tmp-verify.ts`:
```ts
import { initDb } from '../src/db/init';
import { createKey, listKeys, verifyKey, revokeKey } from '../src/db/apiKeys.repo';

initDb();

const created = createKey('verify-script-key', { fs: true, bash: false, web: true });
console.log('created:', created);

console.log('listed:', listKeys());

console.log('verify valid:', verifyKey(created.key));
console.log('verify garbage:', verifyKey('not-a-real-key'));

revokeKey(created.id);
console.log('verify after revoke:', verifyKey(created.key));
```

Run:
```bash
cd backend && npx tsx scripts/tmp-verify.ts
```
Expected: `created` has a `key` starting with `orb_sk_`; `listed` shows one entry with `maskedKey` like `orb_sk_****ab12` (no `key` or `key_hash` field); `verify valid` returns the same summary; `verify garbage` prints `null`; `verify after revoke` prints `null`.

Delete the script afterward:
```bash
rm backend/scripts/tmp-verify.ts
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/db/apiKeys.repo.ts
git commit -m "feat: add API keys repository (create/list/revoke/verify)"
```

---

### Task 3: Audit log repository

**Files:**
- Create: `backend/src/db/auditLog.repo.ts`

**Interfaces:**
- Consumes: `db` from `backend/src/db/db.ts` (Task 1).
- Produces: `AuditLogEntry` (input shape), `AuditLogRow` (output shape), `insertLog(entry: AuditLogEntry): void`, `listLogs(limit?: number): AuditLogRow[]`. Task 4 (routes) and Task 6 (`/api/v1/chat`) depend on these exact names.

- [ ] **Step 1: Create `backend/src/db/auditLog.repo.ts`**

```ts
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
```

- [ ] **Step 2: Verify with a throwaway script**

Create `backend/scripts/tmp-verify.ts`:
```ts
import { initDb } from '../src/db/init';
import { createKey } from '../src/db/apiKeys.repo';
import { insertLog, listLogs } from '../src/db/auditLog.repo';

initDb();

const key = createKey('verify-log-key', { fs: false, bash: false, web: true });

insertLog({
  api_key_id: key.id,
  timestamp: new Date().toISOString(),
  endpoint: '/api/v1/chat',
  model: 'llama3.1',
  request_messages: [{ role: 'user', content: 'hi' }],
  response_content: 'hello!',
  tool_calls: [],
  tool_results: [],
  policy_decisions: { web_search: 'Allowed' },
  latency_ms: 123,
  status_code: 200,
});

console.log('logs:', listLogs(10));
```

Run:
```bash
cd backend && npx tsx scripts/tmp-verify.ts
```
Expected: `logs` array has one entry with `key_name: 'verify-log-key'`, `endpoint: '/api/v1/chat'`, `status_code: 200`, `latency_ms: 123`.

Delete the script afterward:
```bash
rm backend/scripts/tmp-verify.ts
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/db/auditLog.repo.ts
git commit -m "feat: add audit log repository (insert/list)"
```

---

### Task 4: Internal key-management + audit-log routes

**Files:**
- Create: `backend/src/api/keys.route.ts`
- Modify: `backend/src/index.ts`

**Interfaces:**
- Consumes: `createKey`, `listKeys`, `revokeKey`, `updateKeyTools` from `apiKeys.repo` (Task 2); `listLogs` from `auditLog.repo` (Task 3).
- Produces: `POST /api/keys`, `GET /api/keys`, `DELETE /api/keys/:id`, `PATCH /api/keys/:id/tools`, `GET /api/audit-logs` — consumed by the frontend in Tasks 8-9.

- [ ] **Step 1: Create `backend/src/api/keys.route.ts`**

```ts
import { Router, Request, Response } from 'express';
import { createKey, listKeys, revokeKey, updateKeyTools, ToolsEnabled } from '../db/apiKeys.repo';
import { listLogs } from '../db/auditLog.repo';

const router = Router();

function parseTools(body: any): ToolsEnabled {
  return {
    fs: !!body?.tools?.fs,
    bash: !!body?.tools?.bash,
    web: !!body?.tools?.web,
  };
}

router.post('/keys', (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const created = createKey(name, parseTools(req.body));
  res.status(201).json(created);
});

router.get('/keys', (req: Request, res: Response) => {
  res.json(listKeys());
});

router.delete('/keys/:id', (req: Request, res: Response) => {
  revokeKey(Number(req.params.id));
  res.status(204).end();
});

router.patch('/keys/:id/tools', (req: Request, res: Response) => {
  updateKeyTools(Number(req.params.id), parseTools(req.body));
  res.json({ ok: true });
});

router.get('/audit-logs', (req: Request, res: Response) => {
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  res.json(listLogs(limit));
});

export default router;
```

- [ ] **Step 2: Mount the router**

In `backend/src/index.ts`, add the import:
```ts
import keysRoutes from './api/keys.route';
```
and mount it alongside the existing routes:
```ts
app.use('/api', keysRoutes);
```

- [ ] **Step 3: Verify**

```bash
cd backend && npm run dev
```

```bash
curl -s -X POST http://localhost:3001/api/keys -H "Content-Type: application/json" \
  -d '{"name":"test-key","tools":{"fs":true,"bash":false,"web":true}}'
```
Expected: `201` JSON with a `key` field starting `orb_sk_`. Note the `id`.

```bash
curl -s http://localhost:3001/api/keys
```
Expected: array with one entry, `maskedKey` present, no `key` or `key_hash` field.

```bash
curl -s -X PATCH http://localhost:3001/api/keys/1/tools -H "Content-Type: application/json" -d '{"tools":{"fs":true,"bash":true,"web":true}}'
```
Expected: `{"ok":true}`

```bash
curl -s -X DELETE http://localhost:3001/api/keys/1 -w "%{http_code}\n"
```
Expected: `204`

```bash
curl -s http://localhost:3001/api/audit-logs
```
Expected: `[]` (no `/api/v1` calls have happened yet).

- [ ] **Step 4: Commit**

```bash
git add backend/src/api/keys.route.ts backend/src/index.ts
git commit -m "feat: add internal API-key management and audit-log routes"
```

---

### Task 5: API-key auth middleware + protected `GET /api/v1/models`

**Files:**
- Create: `backend/src/middleware/apiKeyAuth.ts`
- Create: `backend/src/api/v1/models.route.ts`
- Modify: `backend/src/index.ts`

**Interfaces:**
- Consumes: `verifyKey`, `ApiKeySummary` from `apiKeys.repo` (Task 2).
- Produces: Express middleware `apiKeyAuth` that sets `req.apiKey: ApiKeySummary` on success; `GET /api/v1/models`. Task 6 depends on `apiKeyAuth` and the `req.apiKey` typing.

- [ ] **Step 1: Create `backend/src/middleware/apiKeyAuth.ts`**

```ts
import { Request, Response, NextFunction } from 'express';
import { verifyKey, ApiKeySummary } from '../db/apiKeys.repo';

declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKeySummary;
    }
  }
}

export function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match ? match[1] : null;

  if (!token) {
    res.status(401).json({ error: 'Invalid or missing API key' });
    return;
  }

  const key = verifyKey(token);
  if (!key) {
    res.status(401).json({ error: 'Invalid or missing API key' });
    return;
  }

  req.apiKey = key;
  next();
}
```

- [ ] **Step 2: Create `backend/src/api/v1/models.route.ts`**

```ts
import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../../middleware/apiKeyAuth';

const router = Router();

router.get('/models', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const response = await fetch('http://localhost:11434/api/tags');
    if (!response.ok) {
      res.status(response.status).json({ error: 'Failed to fetch models from Ollama' });
      return;
    }
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to connect to local Ollama instance' });
  }
});

export default router;
```

- [ ] **Step 3: Mount the router**

In `backend/src/index.ts`, add:
```ts
import v1ModelsRoutes from './api/v1/models.route';
```
and:
```ts
app.use('/api/v1', v1ModelsRoutes);
```

- [ ] **Step 4: Verify**

Create a fresh key to use for this and later verifications:
```bash
curl -s -X POST http://localhost:3001/api/keys -H "Content-Type: application/json" \
  -d '{"name":"v1-test-key","tools":{"fs":false,"bash":false,"web":true}}'
```
Copy the `key` value from the response as `$KEY` for the commands below.

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/v1/models
```
Expected: `401` (no header)

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/v1/models -H "Authorization: Bearer not-a-real-key"
```
Expected: `401`

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/v1/models -H "Authorization: Bearer $KEY"
```
Expected: `200`

- [ ] **Step 5: Commit**

```bash
git add backend/src/middleware/apiKeyAuth.ts backend/src/api/v1/models.route.ts backend/src/index.ts
git commit -m "feat: add API-key auth middleware and protected /api/v1/models"
```

---

### Task 6: `POST /api/v1/chat` with audit logging

**Files:**
- Create: `backend/src/agent/sharedInstances.ts`
- Modify: `backend/src/api/chat.route.ts`
- Create: `backend/src/api/v1/chat.route.ts`
- Modify: `backend/src/index.ts`

**Interfaces:**
- Consumes: `Agent` (`backend/src/agent/Agent.ts`, unchanged — `run(messages, systemPrompt, streamCallback, getPolicyStatus, performanceMode?)`), `Ollama` (`backend/src/llm/Ollama.ts`, unchanged), `resolvePerformanceMode` (`backend/src/llm/performanceModes.ts`, unchanged), `apiKeyAuth` (Task 5), `insertLog` (Task 3).
- Produces: `registry`, `executor` (shared singletons, now importable by both the internal and v1 chat routes) from `backend/src/agent/sharedInstances.ts`; `POST /api/v1/chat`.

**Why `sharedInstances.ts`:** `chat.route.ts` currently instantiates `ToolRegistry`/`ToolExecutor` as module-local singletons and registers all three tools on them. The new `/api/v1/chat` route needs the exact same registry/executor (so both routes see the same tool set) — duplicating the registration would double tool instances for no reason. Extracting it once is the smallest change that keeps both routes DRY.

- [ ] **Step 1: Create `backend/src/agent/sharedInstances.ts`**

```ts
import { ToolRegistry } from '../tools/registry';
import { ToolExecutor } from './ToolExecutor';
import { BashTool } from '../tools/BashTool';
import { FsTool } from '../tools/FsTool';
import { WebSearchTool } from '../tools/WebSearchTool';

export const registry = new ToolRegistry();
registry.register(new BashTool());
registry.register(new FsTool());
registry.register(new WebSearchTool());

export const executor = new ToolExecutor(registry);
```

- [ ] **Step 2: Update `backend/src/api/chat.route.ts` to use the shared instances**

Replace the top of the file — from the imports through the "Initialize global dependencies" block — with:

```ts
import { Router, Request, Response } from 'express';
import { Agent } from '../agent/Agent';
import { Ollama } from '../llm/Ollama';
import { registry, executor } from '../agent/sharedInstances';
import { resolvePerformanceMode } from '../llm/performanceModes';

const router = Router();
```

(This removes the now-unused `ToolRegistry`, `ToolExecutor`, `BashTool`, `FsTool`, `WebSearchTool` imports and the manual `registry`/`executor` construction — they're replaced by the shared import. Nothing else in this file changes: the `/chat` and `/execute_tool` handlers keep using `registry`/`executor` by the same names, now sourced from the import instead of local construction.)

- [ ] **Step 3: Create `backend/src/api/v1/chat.route.ts`**

```ts
import { Router, Request, Response } from 'express';
import { Agent } from '../../agent/Agent';
import { Ollama } from '../../llm/Ollama';
import { registry, executor } from '../../agent/sharedInstances';
import { resolvePerformanceMode } from '../../llm/performanceModes';
import { apiKeyAuth } from '../../middleware/apiKeyAuth';
import { insertLog } from '../../db/auditLog.repo';
import { Message, ToolCall } from '../../types';

const router = Router();

const TOOL_NAME_BY_FLAG: Record<'fs' | 'bash' | 'web', string> = {
  fs: 'read_file',
  bash: 'execute_bash',
  web: 'web_search',
};

router.post('/chat', apiKeyAuth, async (req: Request, res: Response) => {
  const startedAt = Date.now();
  const apiKey = req.apiKey!;
  const { messages, model = 'llama3.1', systemPrompt, performanceMode } = req.body;

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'Messages array is required' });
    return;
  }

  const mode = resolvePerformanceMode(performanceMode);
  const llm = new Ollama(model, mode);
  const agent = new Agent(llm, registry, executor);

  const enabledToolNames = new Set(
    (Object.keys(TOOL_NAME_BY_FLAG) as Array<'fs' | 'bash' | 'web'>)
      .filter((flag) => apiKey.tools[flag])
      .map((flag) => TOOL_NAME_BY_FLAG[flag])
  );

  const policyDecisions: Record<string, string> = {};
  const getPolicyStatus = (toolName: string) => {
    const status = enabledToolNames.has(toolName) ? 'Allowed' : 'Blocked';
    policyDecisions[toolName] = status;
    return status;
  };

  let responseContent = '';
  const toolCallsLog: ToolCall[] = [];
  const toolResultsLog: { name: string; result: string }[] = [];
  let statusCode = 200;

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');

  const streamCallback = (chunk: any) => {
    if (chunk.type === 'content_chunk') {
      responseContent += chunk.content;
    } else if (chunk.type === 'tool_call_intent') {
      toolCallsLog.push(...chunk.toolCalls);
    } else if (chunk.type === 'tool_result') {
      toolResultsLog.push({ name: chunk.name, result: chunk.result });
    } else if (chunk.type === 'error') {
      statusCode = 500;
    }
    res.write(JSON.stringify(chunk) + '\n');
  };

  try {
    await agent.run(messages as Message[], systemPrompt, streamCallback, getPolicyStatus, mode);
  } catch (error: any) {
    statusCode = 500;
    streamCallback({ type: 'error', error: error.message });
  } finally {
    res.end();
    insertLog({
      api_key_id: apiKey.id,
      timestamp: new Date(startedAt).toISOString(),
      endpoint: '/api/v1/chat',
      model,
      request_messages: messages,
      response_content: responseContent,
      tool_calls: toolCallsLog,
      tool_results: toolResultsLog,
      policy_decisions: policyDecisions,
      latency_ms: Date.now() - startedAt,
      tokens_in: null,
      tokens_out: null,
      status_code: statusCode,
    });
  }
});

export default router;
```

- [ ] **Step 4: Mount the router**

In `backend/src/index.ts`, add:
```ts
import v1ChatRoutes from './api/v1/chat.route';
```
and:
```ts
app.use('/api/v1', v1ChatRoutes);
```

- [ ] **Step 5: Verify**

Ensure Ollama is running locally with at least one model pulled. Using the `$KEY` from Task 5 (created with only `web: true`):

```bash
curl -N -X POST http://localhost:3001/api/v1/chat -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Say hello in one short sentence. Do not use any tools."}]}'
```
Expected: streamed NDJSON lines (`content_chunk`... `done`), non-empty text.

```bash
curl -N -X POST http://localhost:3001/api/v1/chat -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Run the bash command: ls"}]}'
```
Expected: since `bash` is disabled for this key, if the model attempts `execute_bash` the response includes a `tool_result` chunk whose `result` reads `Action Blocked: Policy enforces blocking for execute_bash.` (LLM tool-call behavior can vary run to run — if the model answers without calling any tool, that's also an acceptable outcome; the key check is that IF it calls `execute_bash`, it must be blocked, never executed).

```bash
curl -s http://localhost:3001/api/audit-logs
```
Expected: two rows with `endpoint: "/api/v1/chat"`, correct `status_code`, non-zero `latency_ms`.

Confirm no regression on the internal endpoint:
```bash
curl -N -X POST http://localhost:3001/api/chat -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hi"}]}'
```
Expected: streams normally, same as before this task.

- [ ] **Step 6: Commit**

```bash
git add backend/src/agent/sharedInstances.ts backend/src/api/chat.route.ts backend/src/api/v1/chat.route.ts backend/src/index.ts
git commit -m "feat: add key-scoped /api/v1/chat with audit logging"
```

---

### Task 7: `ApiScreen` scaffold + nav entry + base URL card

**Files:**
- Modify: `frontend/src/app/page.tsx`

**Interfaces:**
- Consumes: existing `Appbar`, `handleNavigate`, CSS classes `dash-title`, `glass-panel`, `icon-btn` (all already defined/used elsewhere in this file).
- Produces: `ApiScreen` component; `Home`'s `screen` state type gains `'api'`. Tasks 8-9 add to this same component.

- [ ] **Step 1: Extend the screen union type and render switch**

In the `Home` function near the top of the file, change:
```ts
const [screen, setScreen] = useState<'landing' | 'app' | 'sessions' | 'transition'>('landing');
const [nextScreen, setNextScreen] = useState<'landing' | 'app' | 'sessions'>('app');
```
to:
```ts
const [screen, setScreen] = useState<'landing' | 'app' | 'sessions' | 'api' | 'transition'>('landing');
const [nextScreen, setNextScreen] = useState<'landing' | 'app' | 'sessions' | 'api'>('app');
```
and the `handleNavigate` signature:
```ts
const handleNavigate = (target: 'landing' | 'app' | 'sessions') => {
```
to:
```ts
const handleNavigate = (target: 'landing' | 'app' | 'sessions' | 'api') => {
```

In the render `AnimatePresence` block, add a new line alongside the existing screen branches:
```tsx
{screen === 'api' && <ApiScreen key="api" handleNavigate={handleNavigate} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />}
```

- [ ] **Step 2: Add an API nav button to `Appbar`**

Replace the `Appbar` component:
```tsx
const Appbar = ({ onLogoClick, isDarkMode, setIsDarkMode }: any) => (
  <nav className="app-nav">
    <motion.div
      className="logo"
      onClick={onLogoClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--accent-gradient)' }}></div>
      orb.
    </motion.div>
    <div style={{ display: 'flex', gap: '2rem', fontSize: '0.875rem', fontWeight: 600, alignItems: 'center' }}>
      <span>Work</span>
      <span>About</span>
      <span>Info</span>
      <button
        onClick={() => setIsDarkMode(!isDarkMode)}
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-color)', display: 'flex' }}
      >
        {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
      </button>
    </div>
  </nav>
);
```
with:
```tsx
const Appbar = ({ onLogoClick, onApiClick, isDarkMode, setIsDarkMode }: any) => (
  <nav className="app-nav">
    <motion.div
      className="logo"
      onClick={onLogoClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--accent-gradient)' }}></div>
      orb.
    </motion.div>
    <div style={{ display: 'flex', gap: '2rem', fontSize: '0.875rem', fontWeight: 600, alignItems: 'center' }}>
      <span>Work</span>
      <span>About</span>
      <span>Info</span>
      <button
        onClick={onApiClick}
        title="API Access"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-color)', display: 'flex' }}
      >
        <Code size={20} />
      </button>
      <button
        onClick={() => setIsDarkMode(!isDarkMode)}
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-color)', display: 'flex' }}
      >
        {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
      </button>
    </div>
  </nav>
);
```

- [ ] **Step 3: Pass `onApiClick` at every `<Appbar />` call site**

There are three existing call sites (`LandingScreen`, `AppScreen`, `SessionsScreen`), each currently reading:
```tsx
<Appbar onLogoClick={() => handleNavigate('landing')} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
```
Change each to:
```tsx
<Appbar onLogoClick={() => handleNavigate('landing')} onApiClick={() => handleNavigate('api')} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
```

- [ ] **Step 4: Add the `ApiScreen` component**

Insert after the `SessionsScreen` component definition (before `TransitionScreen`):

```tsx
const ApiScreen = ({ handleNavigate, isDarkMode, setIsDarkMode }: any) => {
  const baseUrl = 'http://localhost:3001/api/v1';
  const [copied, setCopied] = useState(false);

  const handleCopyBaseUrl = () => {
    navigator.clipboard.writeText(baseUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <motion.div
      className="dashboard-wrapper"
      initial={{ opacity: 0, scale: 0.98, filter: 'blur(10px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
      transition={{ duration: 0.4 }}
    >
      <Appbar onLogoClick={() => handleNavigate('landing')} onApiClick={() => handleNavigate('api')} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />

      <div style={{ maxWidth: '1000px', margin: '0 auto', width: '100%', padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div className="dash-title" style={{ paddingBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="icon-btn" onClick={() => handleNavigate('app')}><ChevronLeft size={20} /></button>
            <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-color)' }}>API Access</h1>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Base URL</div>
            <code style={{ fontSize: '1rem', color: 'var(--text-color)' }}>{baseUrl}</code>
          </div>
          <button className="icon-btn" onClick={handleCopyBaseUrl}>{copied ? 'Copied!' : <FileText size={16} />}</button>
        </div>
      </div>
    </motion.div>
  );
};
```

- [ ] **Step 5: Verify**

```bash
cd frontend && npm run dev
```
Expected: dev server recompiles with no errors (check the running dev-server log for `✓ Compiled` and no red error output).

```bash
cd frontend && npx tsc --noEmit
```
Expected: no output (clean).

Manual click-through recommended (no headless browser tool available in this environment): open `http://localhost:3000`, click Launch Dashboard, click the new `</>` icon in the top nav, confirm the API Access screen renders with the base URL card and back-chevron works.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: add API Access screen scaffold with nav entry"
```

---

### Task 8: Create-key form + plaintext-once panel + keys list

**Files:**
- Modify: `frontend/src/app/page.tsx` (inside `ApiScreen`)

**Interfaces:**
- Consumes: `POST /api/keys`, `GET /api/keys`, `DELETE /api/keys/:id` (Task 4).
- Produces: nothing new consumed by later tasks — this completes the key-management half of `ApiScreen`.

- [ ] **Step 1: Add state and handlers inside `ApiScreen`**

Right after the `const [copied, setCopied] = useState(false);` line added in Task 7, add:

```ts
  const [keys, setKeys] = useState<any[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyTools, setNewKeyTools] = useState({ fs: false, bash: false, web: false });
  const [createdKey, setCreatedKey] = useState<any>(null);
  const [isCreating, setIsCreating] = useState(false);

  const fetchKeys = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/keys');
      const data = await res.json();
      setKeys(data);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;
    setIsCreating(true);
    try {
      const res = await fetch('http://localhost:3001/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName, tools: newKeyTools }),
      });
      const data = await res.json();
      setCreatedKey(data);
      setNewKeyName('');
      setNewKeyTools({ fs: false, bash: false, web: false });
      fetchKeys();
    } catch (error) {
      console.error(error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async (id: number) => {
    if (!window.confirm('Revoke this API key? This cannot be undone.')) return;
    await fetch(`http://localhost:3001/api/keys/${id}`, { method: 'DELETE' });
    fetchKeys();
  };
```

- [ ] **Step 2: Add the UI blocks**

Insert immediately after the Base URL `glass-panel` block added in Task 7 (still inside the same `<div style={{ maxWidth: '1000px', ...}}>` wrapper):

```tsx
        {createdKey && (
          <div className="glass-panel" style={{ padding: '1.5rem', border: '1px solid var(--warning-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <strong style={{ color: 'var(--warning-color)' }}>New key created — copy it now, it won't be shown again</strong>
              <button className="icon-btn" onClick={() => setCreatedKey(null)}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-color)', padding: '0.75rem 1rem', borderRadius: '8px' }}>
              <code>{createdKey.key}</code>
              <button className="icon-btn" onClick={() => navigator.clipboard.writeText(createdKey.key)}><FileText size={16} /></button>
            </div>
          </div>
        )}

        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div className="dash-title-small" style={{ marginBottom: '1rem' }}>Create New Key</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input type="text" className="form-input" placeholder="Key name, e.g. my-script" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} />
            <div style={{ display: 'flex', gap: '1.5rem' }}>
              {(['fs', 'bash', 'web'] as const).map(flag => (
                <label key={flag} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--text-color)' }}>
                  <input type="checkbox" checked={newKeyTools[flag]} onChange={(e) => setNewKeyTools({ ...newKeyTools, [flag]: e.target.checked })} />
                  {flag === 'fs' ? 'Local FS' : flag === 'bash' ? 'Bash Exec' : 'Web Search'}
                </label>
              ))}
            </div>
            <button className="btn-pill" style={{ alignSelf: 'flex-start', padding: '0.75rem 1.5rem' }} onClick={handleCreateKey} disabled={!newKeyName.trim() || isCreating}>Create Key</button>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div className="dash-title-small" style={{ marginBottom: '1rem' }}>Active Keys</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {keys.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No keys yet.</div>}
            {keys.map(k => (
              <div key={k.id} className="rule-row">
                <div>
                  <div className="rule-row-title">{k.name} <code style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{k.maskedKey}</code></div>
                  <div className="rule-row-desc">
                    {Object.entries(k.tools).filter(([, v]) => v).map(([t]) => t).join(', ') || 'no tools enabled'}
                    {k.revoked_at ? ' · revoked' : ''}
                  </div>
                </div>
                {!k.revoked_at && (
                  <button className="icon-btn" onClick={() => handleRevoke(k.id)}><X size={16} /></button>
                )}
              </div>
            ))}
          </div>
        </div>
```

- [ ] **Step 3: Verify**

```bash
cd frontend && npx tsc --noEmit
```
Expected: clean.

With both dev servers running, manual click-through: open the API screen, create a key named `test-ui-key` with only Web Search checked, confirm the plaintext-once panel appears and the key starts with `orb_sk_`, dismiss it, confirm `test-ui-key` now appears in Active Keys with the correct masked value and `web` tag, click Revoke, confirm it disappears (or shows `· revoked` per this implementation) from the actionable list.

Cross-check against the backend directly:
```bash
curl -s http://localhost:3001/api/keys
```
Expected: reflects the same key created through the UI.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: add create-key form and keys list to API Access screen"
```

---

### Task 9: Audit log table

**Files:**
- Modify: `frontend/src/app/page.tsx` (inside `ApiScreen`)

**Interfaces:**
- Consumes: `GET /api/audit-logs` (Task 4).

- [ ] **Step 1: Add state and fetch**

Right after the `handleRevoke` function added in Task 8, add:

```ts
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/audit-logs?limit=50');
      const data = await res.json();
      setAuditLogs(data);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, []);
```

- [ ] **Step 2: Add the UI block**

Insert after the "Active Keys" `glass-panel` block added in Task 8:

```tsx
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div className="dash-title-small">Recent API Activity</div>
            <button className="icon-btn" onClick={fetchAuditLogs}>Refresh</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {auditLogs.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No API activity yet.</div>}
            {auditLogs.map(log => (
              <div key={log.id} className="rule-row">
                <div>
                  <div className="rule-row-title">{log.key_name} → {log.endpoint}</div>
                  <div className="rule-row-desc">
                    {new Date(log.timestamp).toLocaleString()} · {JSON.parse(log.tool_calls || '[]').map((t: any) => t.function?.name).join(', ') || 'no tools'} · {log.latency_ms}ms
                  </div>
                </div>
                <div className="status-indicator">
                  <div className={`status-dot ${log.status_code === 200 ? 'green' : 'red'}`}></div> {log.status_code}
                </div>
              </div>
            ))}
          </div>
        </div>
```

- [ ] **Step 3: Verify**

```bash
cd frontend && npx tsc --noEmit
```
Expected: clean.

Generate a log entry via the API (reusing `$KEY` from Task 6, or the `test-ui-key` created in Task 8's manual step — must have `web` enabled):
```bash
curl -N -X POST http://localhost:3001/api/v1/chat -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hi, no tools needed"}]}'
```

Manual click-through: reload the API screen (or click Refresh), confirm the new row appears in "Recent API Activity" with the correct key name, endpoint, timestamp, and a green status dot for `200`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: add audit log table to API Access screen"
```

---

## Self-Review

**Spec coverage:** Storage/data-model section → Task 1-3. API surface/auth flow section → Tasks 4-6 (internal CRUD, key-gated middleware + models, key-gated chat + logging). Frontend UI section → Tasks 7-9 (scaffold+nav, keys, audit table). Error-handling section → covered inline in Task 5 (401 paths) and Task 6 (Blocked-tool path, mid-stream error path, logged in `finally`). Non-goals (rate limiting, policy override, key rotation UI, buffered-response option) are intentionally not built — matches spec.

**Placeholder scan:** No TBD/TODO; every step has complete, runnable code; no "similar to Task N" shorthand — v1 chat and models routes are each written out in full even though they parallel the internal ones.

**Type consistency:** `ToolsEnabled`/`ApiKeySummary`/`CreatedApiKey` (Task 2) are the exact types imported and used in Tasks 4, 5, 6. `AuditLogEntry`/`AuditLogRow` (Task 3) match the fields written in Task 6's `insertLog` call and read in Task 9's table rendering (`key_name`, `tool_calls` as a JSON string requiring `JSON.parse` client-side — consistent with `listLogs`'s SQL selecting the raw TEXT column). `registry`/`executor` (Task 6) are the same names both `chat.route.ts` and `v1/chat.route.ts` import from `sharedInstances.ts`. `req.apiKey` typing (Task 5's `declare global` augmentation) matches its usage in Task 6 (`req.apiKey!`).
