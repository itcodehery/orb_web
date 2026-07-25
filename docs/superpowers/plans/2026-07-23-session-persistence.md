# Session Persistence, Real Hallucination Risk, Avg Latency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist chat sessions (transcript, policies, settings) per Clerk user; make the Sessions screen show and resume real sessions instead of a hardcoded array; compute a real hallucination-risk score per reply; add an Avg Latency stat; fix two hardcoded UI elements (`"Hello Hari"`, fake `"Tokens Saved"` counter).

**Architecture:** A new `sessions` SQLite table (JSON blobs in TEXT columns, matching the `audit_logs`/`memories` convention), with the invariant that at most one session per user is `'active'`. Session-transcript persistence and the combined memory-extraction + hallucination-scoring background call both live in `chat.route.ts`, since it already receives the full messages array and is the natural race-free place to know exactly which session+message-index a delayed background result belongs to. Policies/settings/tools, which can change independent of sending a message, get their own lightweight debounced `PATCH` endpoint from the frontend.

**Tech Stack:** Express + better-sqlite3 (backend), Next.js + `@clerk/nextjs` (frontend), Ollama. No test framework in this repo — verification is `tsc --noEmit`, `curl`, isolated `tsx` scripts, and manual browser checks, matching the existing project convention.

## Global Constraints

- At most one `'active'` session per user — enforced in code (`resumeSession`/`completeActiveSession`), not a DB constraint (spec §Data model).
- `requireAuth` must always be applied per-route (`router.get('/path', requireAuth, handler)`), never `router.use(requireAuth)` unpathed on a router sharing the `/api` mount prefix — this caused a real regression in the previous plan (see `backend/src/api/keys.route.ts` for the corrected pattern).
- Background analysis patches results by an explicit `(sessionId, messageIndex)` captured at request time, never "whichever session is currently active" — avoids race conditions since the call can take 40-75s (spec §Key decisions 6).
- `/api/v1/*` (API-key-scoped, programmatic) routes are untouched — no session persistence there (spec §Error handling table).
- Only `"Hello Hari"` and the `"Tokens Saved"` counter get fixed in this pass. `"1,204 Actions Blocked"` and the `+ Add Tool` alert stub are explicitly left alone (spec §Key decisions 7).
- Express route registration order matters for path-prefix collisions: `/sessions/active` and `/sessions/active/complete` must be registered before `/sessions/:id` and `/sessions/:id/resume`, or Express would match `active` as an `:id` param.

---

### Task 1: `sessions` table and repo

**Files:**
- Modify: `backend/src/db/init.ts`
- Create: `backend/src/db/sessions.repo.ts`

**Interfaces:**
- Produces: `SessionSettings { systemPrompt: string; selectedModel: string; chatMode: string; performanceMode: 'low' | 'high'; inputLimitIdx: number; outputLimitIdx: number; tools: { id: string; name: string; active: boolean }[] }`
- Produces: `SessionRow { id: number; user_id: string; title: string; messages: any[]; policies: any[]; settings: SessionSettings; status: 'active' | 'completed'; created_at: string; updated_at: string }`
- Produces: `SessionSummary { id: number; title: string; status: 'active' | 'completed'; created_at: string; updated_at: string; messageCount: number; avgLatencyMs: number | null; avgRiskScore: number | null }`
- Produces: `getActiveSession(userId)`, `createActiveSession(userId)`, `upsertActiveMessages(userId, messages)`, `patchSettings(userId, {policies?, settings?})`, `patchMessageRiskScore(sessionId, userId, messageIndex, riskScore)`, `completeActiveSession(userId)`, `listSessions(userId)`, `getSession(id, userId)`, `resumeSession(id, userId)`

- [ ] **Step 1: Add the `sessions` table to `init.ts`**

Find in `backend/src/db/init.ts`:
```ts
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id);
  `);
}
```

Replace with:
```ts
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
  `);
}
```

- [ ] **Step 2: Create the repo file**

```ts
// backend/src/db/sessions.repo.ts
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
```

- [ ] **Step 3: Type-check**

Run: `cd backend && npx tsc --noEmit -p .`
Expected: no output (clean).

- [ ] **Step 4: Verify the table gets created**

`CREATE TABLE IF NOT EXISTS` is additive and won't touch existing data. `tsx watch` auto-restarts on save; if it's not already running, start it (`cd backend && npm run dev &`), then:

```bash
sleep 2
sqlite3 backend/data/orb.db ".schema sessions"
```
Expected output includes the `CREATE TABLE sessions (...)` statement and both indexes.

- [ ] **Step 5: Commit**

```bash
git add backend/src/db/init.ts backend/src/db/sessions.repo.ts
git commit -m "feat: add sessions table and repo"
```

---

### Task 2: `/api/sessions` endpoints

**Files:**
- Create: `backend/src/api/sessions.route.ts`
- Modify: `backend/src/index.ts`

**Interfaces:**
- Consumes: everything from `../db/sessions.repo` (Task 1), `requireAuth` from `../middleware/requireAuth`

- [ ] **Step 1: Create the route file**

```ts
// backend/src/api/sessions.route.ts
import { Router, Request, Response } from 'express';
import { getAuth } from '@clerk/express';
import { requireAuth } from '../middleware/requireAuth';
import {
  getActiveSession,
  patchSettings,
  completeActiveSession,
  listSessions,
  getSession,
  resumeSession,
} from '../db/sessions.repo';

const router = Router();

// NOTE: /active and /active/complete must be registered before /:id and
// /:id/resume, or Express would match "active" as an :id param.

router.get('/sessions/active', requireAuth, (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  res.json(getActiveSession(userId as string));
});

router.patch('/sessions/active', requireAuth, (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const { policies, settings } = req.body;
  res.json(patchSettings(userId as string, { policies, settings }));
});

router.post('/sessions/active/complete', requireAuth, (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  completeActiveSession(userId as string);
  res.status(204).end();
});

router.get('/sessions', requireAuth, (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  res.json(listSessions(userId as string));
});

router.get('/sessions/:id', requireAuth, (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const session = getSession(Number(req.params.id), userId as string);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json(session);
});

router.post('/sessions/:id/resume', requireAuth, (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const session = resumeSession(Number(req.params.id), userId as string);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json(session);
});

export default router;
```

- [ ] **Step 2: Mount it in `index.ts`**

Find:
```ts
import memoriesRoutes from './api/memories.route';
import v1ModelsRoutes from './api/v1/models.route';
```

Replace with:
```ts
import memoriesRoutes from './api/memories.route';
import sessionsRoutes from './api/sessions.route';
import v1ModelsRoutes from './api/v1/models.route';
```

Find:
```ts
app.use('/api', memoriesRoutes);
app.use('/api/v1', v1ModelsRoutes);
```

Replace with:
```ts
app.use('/api', memoriesRoutes);
app.use('/api', sessionsRoutes);
app.use('/api/v1', v1ModelsRoutes);
```

- [ ] **Step 3: Type-check**

Run: `cd backend && npx tsc --noEmit -p .`
Expected: no output (clean).

- [ ] **Step 4: Verify unauthenticated access is rejected, and route ordering works**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/sessions/active
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH http://localhost:3001/api/sessions/active -H "Content-Type: application/json" -d '{}'
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/api/sessions/active/complete
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/sessions
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/sessions/1
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/api/sessions/1/resume
```
Expected: `401` for all six (confirms both auth gating and that `/active` isn't being swallowed by the `/:id` route matching `"active"` as an id — a 401 on all of them, not a 404 on the first two, means routing order is correct).

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/sessions.route.ts backend/src/index.ts
git commit -m "feat: add /api/sessions endpoints"
```

---

### Task 3: Combined post-chat analysis, wired into `chat.route.ts`

**Files:**
- Create: `backend/src/agent/postChatAnalysis.ts`
- Delete: `backend/src/agent/memoryExtractor.ts`
- Modify: `backend/src/api/chat.route.ts`

**Interfaces:**
- Consumes: `createMemory` from `../db/memories.repo`, `patchMessageRiskScore` from `../db/sessions.repo`, `Ollama` from `../llm/Ollama`
- Produces: `analyzeChat(userId: string, model: string, sessionId: number, messageIndex: number, existingFacts: string[], userMessage: string, assistantReply: string): Promise<void>`

- [ ] **Step 1: Create `postChatAnalysis.ts`**

```ts
// backend/src/agent/postChatAnalysis.ts
import { Ollama } from '../llm/Ollama';
import { createMemory } from '../db/memories.repo';
import { patchMessageRiskScore } from '../db/sessions.repo';

export async function analyzeChat(
  userId: string,
  model: string,
  sessionId: number,
  messageIndex: number,
  existingFacts: string[],
  userMessage: string,
  assistantReply: string
): Promise<void> {
  if (!userMessage || !assistantReply) return;

  const prompt = `You analyze one exchange from a conversation between a user and an AI assistant.

Facts already known about this user:
${existingFacts.length ? existingFacts.map(f => `- ${f}`).join('\n') : '(none yet)'}

Latest exchange:
User: ${userMessage}
Assistant: ${assistantReply}

Do two things:
1. List any genuinely new, durable facts about the user that are not already known above — things like their name, stated preferences, ongoing projects, or recurring context. Do NOT include one-off questions, requests, or facts already listed.
2. Rate, from 0 to 100, how likely the Assistant's reply contains ungrounded, fabricated, or unsupported claims (0 = fully grounded/safe, 100 = highly likely to be hallucinated).

Respond with a single JSON object and nothing else, in this exact shape:
{"newFacts": ["fact one", "fact two"], "hallucinationRisk": 15}

If there are no new facts, use an empty array. hallucinationRisk must always be a number.`;

  try {
    const llm = new Ollama(model, 'low');
    const response = await llm.chat([{ role: 'user', content: prompt }]);
    const text = (response.text || '').trim();

    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) return;

    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    if (typeof parsed !== 'object' || parsed === null) return;

    if (Array.isArray(parsed.newFacts)) {
      for (const fact of parsed.newFacts) {
        if (typeof fact === 'string' && fact.trim()) {
          createMemory(userId, fact.trim());
        }
      }
    }

    if (typeof parsed.hallucinationRisk === 'number') {
      patchMessageRiskScore(sessionId, userId, messageIndex, parsed.hallucinationRisk);
    }
  } catch (error) {
    console.error('Post-chat analysis failed:', error);
  }
}
```

- [ ] **Step 2: Delete the old `memoryExtractor.ts`**

```bash
rm backend/src/agent/memoryExtractor.ts
```

- [ ] **Step 3: Wire session persistence and the new analysis call into `chat.route.ts`**

Find:
```ts
import { Router, Request, Response } from 'express';
import { getAuth } from '@clerk/express';
import { Agent } from '../agent/Agent';
import { Ollama } from '../llm/Ollama';
import { registry, executor } from '../agent/sharedInstances';
import { resolvePerformanceMode } from '../llm/performanceModes';
import { requireAuth } from '../middleware/requireAuth';
import { listMemories } from '../db/memories.repo';
import { extractAndSaveMemories } from '../agent/memoryExtractor';

const router = Router();

router.post('/chat', requireAuth, async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    const { messages, model = 'llama3.1', systemPrompt, toolPolicies, performanceMode } = req.body;

    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: 'Messages array is required' });
      return;
    }

    const existingFacts = listMemories(userId as string).map(m => m.content);
    const combinedSystemPrompt = existingFacts.length
      ? `${systemPrompt}\n\n## What you know about this user (from past conversations):\n${existingFacts.map(f => `- ${f}`).join('\n')}`
      : systemPrompt;

    const mode = resolvePerformanceMode(performanceMode);
    const llm = new Ollama(model, mode);
    const agent = new Agent(llm, registry, executor);

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');

    const getPolicyStatus = (toolName: string) => {
      // toolPolicies could be an object mapping tool names to statuses
      // e.g., { 'execute_bash': 'Requires Approval', 'read_file': 'Allowed' }
      if (toolPolicies && toolPolicies[toolName]) {
        return toolPolicies[toolName];
      }
      return 'Allowed'; // Default policy
    };

    const streamCallback = (chunk: any) => {
      res.write(JSON.stringify(chunk) + '\n');
    };

    const { finalReply } = await agent.run(messages, combinedSystemPrompt, streamCallback, getPolicyStatus, mode);

    res.end();

    if (finalReply) {
      const lastUserMessage = [...messages].reverse().find((m: any) => m.role === 'user');
      if (lastUserMessage?.content) {
        extractAndSaveMemories(userId as string, model, existingFacts, lastUserMessage.content, finalReply).catch(err => {
          console.error('Memory extraction failed:', err);
        });
      }
    }
  } catch (error: any) {
    console.error('Error in chat route:', error);
    res.write(JSON.stringify({ type: 'error', error: error.message }) + '\n');
    res.end();
  }
});
```

Replace with:
```ts
import { Router, Request, Response } from 'express';
import { getAuth } from '@clerk/express';
import { Agent } from '../agent/Agent';
import { Ollama } from '../llm/Ollama';
import { registry, executor } from '../agent/sharedInstances';
import { resolvePerformanceMode } from '../llm/performanceModes';
import { requireAuth } from '../middleware/requireAuth';
import { listMemories } from '../db/memories.repo';
import { getActiveSession, createActiveSession, upsertActiveMessages } from '../db/sessions.repo';
import { analyzeChat } from '../agent/postChatAnalysis';

const router = Router();

router.post('/chat', requireAuth, async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    const { messages, model = 'llama3.1', systemPrompt, toolPolicies, performanceMode } = req.body;

    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: 'Messages array is required' });
      return;
    }

    const session = getActiveSession(userId as string) || createActiveSession(userId as string);
    const messageIndex = messages.length;
    const requestStartedAt = Date.now();

    const existingFacts = listMemories(userId as string).map(m => m.content);
    const combinedSystemPrompt = existingFacts.length
      ? `${systemPrompt}\n\n## What you know about this user (from past conversations):\n${existingFacts.map(f => `- ${f}`).join('\n')}`
      : systemPrompt;

    const mode = resolvePerformanceMode(performanceMode);
    const llm = new Ollama(model, mode);
    const agent = new Agent(llm, registry, executor);

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');

    const getPolicyStatus = (toolName: string) => {
      // toolPolicies could be an object mapping tool names to statuses
      // e.g., { 'execute_bash': 'Requires Approval', 'read_file': 'Allowed' }
      if (toolPolicies && toolPolicies[toolName]) {
        return toolPolicies[toolName];
      }
      return 'Allowed'; // Default policy
    };

    const streamCallback = (chunk: any) => {
      res.write(JSON.stringify(chunk) + '\n');
    };

    const { finalReply } = await agent.run(messages, combinedSystemPrompt, streamCallback, getPolicyStatus, mode);

    res.end();

    if (finalReply) {
      const lastUserMessage = [...messages].reverse().find((m: any) => m.role === 'user');
      const assistantMessage = { role: 'assistant', content: finalReply, totalMs: Date.now() - requestStartedAt };
      upsertActiveMessages(userId as string, [...messages, assistantMessage]);

      if (lastUserMessage?.content) {
        analyzeChat(userId as string, model, session.id, messageIndex, existingFacts, lastUserMessage.content, finalReply).catch(err => {
          console.error('Post-chat analysis failed:', err);
        });
      }
    }
  } catch (error: any) {
    console.error('Error in chat route:', error);
    res.write(JSON.stringify({ type: 'error', error: error.message }) + '\n');
    res.end();
  }
});
```

Note: `totalMs` stored here is measured server-side (request-received to reply-finished), which is a separate, simpler measurement from the frontend's own client-side `firstTokenMs`/`totalMs` (used for the live per-message timing display shipped earlier) — the server doesn't know the frontend's exact timings, and doesn't need to; this copy exists purely so `listSessions`'s avg-latency computation has real data to work with.

- [ ] **Step 4: Type-check**

Run: `cd backend && npx tsc --noEmit -p .`
Expected: no output (clean).

- [ ] **Step 5: Verify auth gating still correct on chat routes**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/api/chat -H "Content-Type: application/json" -d '{"messages":[]}'
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/api/execute_tool -H "Content-Type: application/json" -d '{}'
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/models
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/system-info
```
Expected: `401`, `401`, `200`, `200` — confirms the chat gating is intact and the public routes are still public (regression check for the earlier auth-scoping bug).

- [ ] **Step 6: Verify the analysis JSON parsing works, in isolation**

This bypasses Clerk (plain function call) to directly exercise the riskiest new logic — the combined JSON prompt/parse — against the local model, following the same pattern used to verify the original memory extractor.

```bash
mkdir -p backend/src/__manual_check__
cat > backend/src/__manual_check__/test-analysis.ts << 'EOF'
import { analyzeChat } from '../agent/postChatAnalysis';
import { listMemories, deleteMemory } from '../db/memories.repo';
import { getActiveSession, createActiveSession, upsertActiveMessages, getSession } from '../db/sessions.repo';
import { initDb } from '../db/init';

initDb();
const TEST_USER = 'test_user_analysis_check';

async function main() {
  const session = getActiveSession(TEST_USER) || createActiveSession(TEST_USER);
  upsertActiveMessages(TEST_USER, [
    { role: 'user', content: 'hey i am praneeth, i like sci-fi movies' },
    { role: 'assistant', content: 'Nice to meet you, Praneeth!' },
  ]);

  await analyzeChat(
    TEST_USER,
    'qwen3:8b',
    session.id,
    1,
    [],
    'hey i am praneeth, i like sci-fi movies',
    'Nice to meet you, Praneeth!'
  );

  const facts = listMemories(TEST_USER);
  const updated = getSession(session.id, TEST_USER);
  console.log('Facts:', JSON.stringify(facts.map(f => f.content)));
  console.log('Message 1 riskScore:', updated?.messages[1]?.riskScore);

  facts.forEach(f => deleteMemory(f.id, TEST_USER));
}

main();
EOF
cd backend && npx tsx src/__manual_check__/test-analysis.ts
```
Expected: prints extracted facts (e.g. `["name: Praneeth", "likes sci-fi movies"]` or similar) and a numeric `Message 1 riskScore` (e.g. `Message 1 riskScore: 5`). This call takes 40-75s per the prior spec's finding with reasoning models — that's expected, not a bug.

- [ ] **Step 7: Clean up the throwaway test**

```bash
rm -rf backend/src/__manual_check__
sqlite3 backend/data/orb.db "DELETE FROM sessions WHERE user_id = 'test_user_analysis_check';"
```

- [ ] **Step 8: Commit**

```bash
git add backend/src/agent/postChatAnalysis.ts backend/src/api/chat.route.ts
git rm backend/src/agent/memoryExtractor.ts
git commit -m "feat: persist chat transcript per session, combine memory extraction with hallucination scoring"
```

---

### Task 4: Frontend session hydration and debounced autosave

**Files:**
- Modify: `frontend/src/app/page.tsx`

**Interfaces:**
- Consumes: `GET /api/sessions/active`, `PATCH /api/sessions/active` (Task 2)
- Produces: module-level `DEFAULT_TOOLS` constant, reused by Task 5

- [ ] **Step 1: Add a `DEFAULT_TOOLS` constant and use it for the initial `tools` state**

Tool objects currently embed a React icon element directly in state, which isn't JSON-serializable for persistence — this constant lets both the initial default and hydration reconstruct the icon from a stable `id`, while only the serializable fields (`id`, `name`, `active`) ever get sent to the backend.

Find in `frontend/src/app/page.tsx`:
```ts
// Mirrors backend/src/llm/performanceModes.ts PERFORMANCE_PROFILES — keep in sync if those change.
const PERFORMANCE_PROFILE_INFO: Record<'low' | 'high', { summary: string; ctxSize: number }> = {
  low: { summary: '2K context · 512 tok response cap · 12-message history · model unloads after 1m idle', ctxSize: 2048 },
  high: { summary: '8K context · unlimited response · full history · model stays loaded 30m idle', ctxSize: 8192 },
};
```

Replace with:
```ts
// Mirrors backend/src/llm/performanceModes.ts PERFORMANCE_PROFILES — keep in sync if those change.
const PERFORMANCE_PROFILE_INFO: Record<'low' | 'high', { summary: string; ctxSize: number }> = {
  low: { summary: '2K context · 512 tok response cap · 12-message history · model unloads after 1m idle', ctxSize: 2048 },
  high: { summary: '8K context · unlimited response · full history · model stays loaded 30m idle', ctxSize: 8192 },
};

// Icons aren't JSON-serializable, so persisted session settings only ever carry
// { id, name, active } — this map reconstructs the icon by id after hydration.
const DEFAULT_TOOLS = [
  { id: 'fs', name: 'Local FS', icon: <FileText size={14} /> },
  { id: 'bash', name: 'Bash Exec', icon: <Terminal size={14} /> },
  { id: 'web', name: 'Web Search', icon: <Globe size={14} /> },
];
```

Find:
```ts
  const [tools, setTools] = useState([
    { id: 'fs', name: 'Local FS', active: true, icon: <FileText size={14} /> },
    { id: 'bash', name: 'Bash Exec', active: true, icon: <Terminal size={14} /> },
    { id: 'web', name: 'Web Search', active: true, icon: <Globe size={14} /> }
  ]);
```

Replace with:
```ts
  const [tools, setTools] = useState(DEFAULT_TOOLS.map(t => ({ ...t, active: true })));
```

- [ ] **Step 2: Add the hydration effect**

Find in `AppScreen`:
```ts
  const [messages, setMessages] = useState<any[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('You are Orb, a local AI assistant. Ensure all actions are safe and approved.');
  const [isLoading, setIsLoading] = useState(false);
```

Replace with:
```ts
  const [messages, setMessages] = useState<any[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('You are Orb, a local AI assistant. Ensure all actions are safe and approved.');
  const [isLoading, setIsLoading] = useState(false);
  const hasHydratedRef = useRef(false);

  useEffect(() => {
    if (!isSignedIn) return;
    const hydrate = async () => {
      try {
        const res = await fetch('http://localhost:3001/api/sessions/active', { credentials: 'include' });
        if (!res.ok) return;
        const session = await res.json();
        if (!session) return;

        if (Array.isArray(session.messages)) setMessages(session.messages);
        if (Array.isArray(session.policies) && session.policies.length) setPolicies(session.policies);

        const s = session.settings || {};
        if (s.systemPrompt) setSystemPrompt(s.systemPrompt);
        if (s.selectedModel) setSelectedModel(s.selectedModel);
        if (s.chatMode) setChatMode(s.chatMode);
        if (s.performanceMode) {
          setPerformanceMode(s.performanceMode);
          userSetPerfModeRef.current = true;
        }
        if (typeof s.inputLimitIdx === 'number') setInputLimitIdx(s.inputLimitIdx);
        if (typeof s.outputLimitIdx === 'number') setOutputLimitIdx(s.outputLimitIdx);
        if (Array.isArray(s.tools) && s.tools.length) {
          setTools(s.tools.map((t: any) => ({ ...t, icon: DEFAULT_TOOLS.find(d => d.id === t.id)?.icon })));
        }
      } catch (error) {
        console.error('Failed to hydrate active session:', error);
      } finally {
        hasHydratedRef.current = true;
      }
    };
    hydrate();
  }, [isSignedIn]);
```

- [ ] **Step 3: Add the debounced autosave effect**

Insert immediately after the hydration effect added in Step 2:

```ts
  useEffect(() => {
    if (!hasHydratedRef.current || !isSignedIn) return;

    const timeoutId = setTimeout(() => {
      fetch('http://localhost:3001/api/sessions/active', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policies,
          settings: {
            systemPrompt,
            selectedModel,
            chatMode,
            performanceMode,
            inputLimitIdx,
            outputLimitIdx,
            tools: tools.map(({ id, name, active }) => ({ id, name, active })),
          },
        }),
      }).catch(err => console.error('Failed to save session settings:', err));
    }, 800);

    return () => clearTimeout(timeoutId);
  }, [policies, systemPrompt, selectedModel, chatMode, performanceMode, inputLimitIdx, outputLimitIdx, tools, isSignedIn]);
```

Note: `hasHydratedRef.current` guards against firing before hydration completes (which would overwrite real persisted settings with blank defaults — a correctness issue, not just wasted effort). One harmless side effect: the hydration-triggered state updates also satisfy this effect's dependency array, so it fires once right after hydration completes, re-saving the same data it just loaded — a redundant but idempotent network call, not worth extra complexity to eliminate.

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit -p .`
Expected: no output (clean).

- [ ] **Step 5: Manual browser verification**

With both dev servers running, signed in:
1. Toggle Performance Mode (Low/High) or drag the Input/Output Limit slider.
2. Wait ~1 second, then check: `curl -s http://localhost:3001/api/sessions/active` from the same signed-in browser tab (open it in a new tab so the session cookie carries over) — confirm `settings.performanceMode` (or the relevant field) reflects your change.
3. Reload the page — confirm the toggle/slider still shows your change (hydration restored it).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: hydrate and autosave chat session settings/policies"
```

---

### Task 5: "New Chat" button

**Files:**
- Modify: `frontend/src/app/page.tsx`

**Interfaces:**
- Consumes: `POST /api/sessions/active/complete` (Task 2), `DEFAULT_TOOLS` (Task 4)

- [ ] **Step 1: Add the handler and button**

Find in `AppScreen`'s JSX (center panel header):
```ts
            <button className="subtle-btn" onClick={() => handleNavigate('sessions')}>
              View all sessions
            </button>
```

Replace with:
```ts
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="subtle-btn" onClick={handleNewChat}>
                New Chat
              </button>
              <button className="subtle-btn" onClick={() => handleNavigate('sessions')}>
                View all sessions
              </button>
            </div>
```

Find the `handleSaveRule` function (defined earlier in `AppScreen`, right before the `messages` state declaration touched in Task 4):
```ts
  const handleSaveRule = () => {
    if (!ruleTarget.trim()) return;
    const newPolicy = {
      id: `custom-${Date.now()}`,
      title: `${ruleCondition}: ${ruleTarget}`,
      condition: conditionToTool[ruleCondition],
      status: actionToStatus[ruleAction],
    };
    setPolicies([...policies, newPolicy]);
    setRuleTarget('');
    setRuleCondition('Contains Command');
    setRuleAction('Block');
    setIsAddingRule(false);
  };
```

Add the new handler immediately after it:
```ts
  const handleSaveRule = () => {
    if (!ruleTarget.trim()) return;
    const newPolicy = {
      id: `custom-${Date.now()}`,
      title: `${ruleCondition}: ${ruleTarget}`,
      condition: conditionToTool[ruleCondition],
      status: actionToStatus[ruleAction],
    };
    setPolicies([...policies, newPolicy]);
    setRuleTarget('');
    setRuleCondition('Contains Command');
    setRuleAction('Block');
    setIsAddingRule(false);
  };

  const handleNewChat = async () => {
    try {
      await fetch('http://localhost:3001/api/sessions/active/complete', { method: 'POST', credentials: 'include' });
    } catch (error) {
      console.error('Failed to complete session:', error);
    }
    setMessages([]);
    setPolicies([
      { id: 'fs', title: 'Read Local Files', condition: 'read_file', status: 'Allowed' },
      { id: 'bash', title: 'System Modifications', condition: 'execute_bash', status: 'Requires Approval' },
      { id: 'web', title: 'Web Search', condition: 'web_search', status: 'Allowed' },
    ]);
    setTools(DEFAULT_TOOLS.map(t => ({ ...t, active: true })));
    setSystemPrompt('You are Orb, a local AI assistant. Ensure all actions are safe and approved.');
  };
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit -p .`
Expected: no output (clean).

- [ ] **Step 3: Manual browser verification**

1. Send a chat message so an active session exists with content.
2. Click "New Chat" — confirm the chat view clears and policies/tools/system prompt reset to defaults.
3. `curl -s http://localhost:3001/api/sessions` from a signed-in browser tab — confirm the previous session now shows `"status":"completed"`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: add New Chat button to finalize and start sessions"
```

---

### Task 6: Real Hallucination Risk and Avg Latency stat tiles

**Files:**
- Modify: `frontend/src/app/page.tsx`

**Interfaces:**
- Consumes: `GET /api/sessions/active` (Task 2), local `messages` state (already carries `totalMs` from the response-timing feature, and now `riskScore` once patched server-side)

- [ ] **Step 1: Add the `RefreshCw` icon import**

Find:
```ts
import {
  ChevronLeft, ChevronRight, TriangleAlert, ShieldAlert, Shield, Zap,
  Cpu, Terminal, Search, Send, Plus, X, Globe, FileText, Sun, Moon,
  MessageSquare, Sparkles, Code, Clock, Brain
} from 'lucide-react';
```

Replace with:
```ts
import {
  ChevronLeft, ChevronRight, TriangleAlert, ShieldAlert, Shield, Zap,
  Cpu, Terminal, Search, Send, Plus, X, Globe, FileText, Sun, Moon,
  MessageSquare, Sparkles, Code, Clock, Brain, RefreshCw
} from 'lucide-react';
```

- [ ] **Step 2: Replace the hardcoded `hallucinationRisk` with derived values, and add a refresh function**

Find in `AppScreen`:
```ts
  const [contextTokens, setContextTokens] = useState(0);
  const ctxPercent = Math.min(100, Math.round((contextTokens / PERFORMANCE_PROFILE_INFO[performanceMode].ctxSize) * 100));
  const hallucinationRisk = 14.5;
  const tokenPresets = [512, 1024, 2048, 4096, 8192, 16384, 32768, 128000];
```

Replace with:
```ts
  const [contextTokens, setContextTokens] = useState(0);
  const ctxPercent = Math.min(100, Math.round((contextTokens / PERFORMANCE_PROFILE_INFO[performanceMode].ctxSize) * 100));
  const tokenPresets = [512, 1024, 2048, 4096, 8192, 16384, 32768, 128000];

  const messagesWithLatency = messages.filter((m: any) => m.role === 'assistant' && typeof m.totalMs === 'number');
  const avgLatencyMs = messagesWithLatency.length
    ? Math.round(messagesWithLatency.reduce((sum: number, m: any) => sum + m.totalMs, 0) / messagesWithLatency.length)
    : null;

  const messagesWithRisk = messages.filter((m: any) => m.role === 'assistant' && typeof m.riskScore === 'number');
  const hallucinationRisk = messagesWithRisk.length
    ? Math.round(messagesWithRisk.reduce((sum: number, m: any) => sum + m.riskScore, 0) / messagesWithRisk.length)
    : 0;

  const refreshActiveSession = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/sessions/active', { credentials: 'include' });
      if (!res.ok) return;
      const session = await res.json();
      if (!Array.isArray(session?.messages)) return;
      setMessages((prev: any[]) => prev.map((m, i) => {
        const serverMsg = session.messages[i];
        return serverMsg && typeof serverMsg.riskScore === 'number' ? { ...m, riskScore: serverMsg.riskScore } : m;
      }));
    } catch (error) {
      console.error('Failed to refresh session:', error);
    }
  };
```

- [ ] **Step 3: Add the Refresh button and Avg Latency tile in the left pane**

Find:
```ts
              <div className="stat-item glass-panel">
                <div className="stat-item-header">
                  <span>Hallucination Risk</span>
                  {hallucinationRisk > 10 ? (
                    <motion.div className="status-indicator" animate={{ opacity: [1, 0.5, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                      <div className="status-dot red"></div> High
                    </motion.div>
                  ) : (
                    <div className="status-indicator">
                      <div className="status-dot green"></div> Nominal
                    </div>
                  )}
                </div>
                <div className="stat-value-large" style={{ color: hallucinationRisk > 10 ? 'var(--danger-color)' : 'var(--text-color)' }}>
                  {hallucinationRisk}<span style={{ fontSize: '1.5rem', fontWeight: 500 }}>%</span>
                </div>
              </div>
```

Replace with:
```ts
              <div className="stat-item glass-panel">
                <div className="stat-item-header">
                  <span>Hallucination Risk</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button className="icon-btn" onClick={refreshActiveSession} title="Refresh"><RefreshCw size={14} /></button>
                    {hallucinationRisk > 10 ? (
                      <motion.div className="status-indicator" animate={{ opacity: [1, 0.5, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                        <div className="status-dot red"></div> High
                      </motion.div>
                    ) : (
                      <div className="status-indicator">
                        <div className="status-dot green"></div> Nominal
                      </div>
                    )}
                  </div>
                </div>
                <div className="stat-value-large" style={{ color: hallucinationRisk > 10 ? 'var(--danger-color)' : 'var(--text-color)' }}>
                  {hallucinationRisk}<span style={{ fontSize: '1.5rem', fontWeight: 500 }}>%</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {messagesWithRisk.length ? `Avg over ${messagesWithRisk.length} scored ${messagesWithRisk.length === 1 ? 'reply' : 'replies'}` : 'Scores land ~1-2 min after each reply — hit refresh'}
                </div>
              </div>

              <div className="stat-item glass-panel">
                <div className="stat-item-header">
                  <span>Avg Latency</span>
                </div>
                <div className="stat-value-large" style={{ color: 'var(--text-color)' }}>
                  {avgLatencyMs != null ? (avgLatencyMs / 1000).toFixed(2) : '—'}<span style={{ fontSize: '1.5rem', fontWeight: 500 }}>s</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {messagesWithLatency.length ? `Avg over ${messagesWithLatency.length} ${messagesWithLatency.length === 1 ? 'reply' : 'replies'} this session` : 'No replies yet'}
                </div>
              </div>
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit -p .`
Expected: no output (clean).

- [ ] **Step 5: Manual browser verification**

1. Send a chat message — confirm "Avg Latency" shows a real value immediately after the reply (uses the existing client-side `totalMs` already tracked per message).
2. Confirm "Hallucination Risk" shows `0%` / "Scores land ~1-2 min..." immediately after (no score patched yet).
3. Wait ~1-2 minutes, click the Refresh icon next to Hallucination Risk — confirm it updates to a real score once the background analysis lands.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: compute real Hallucination Risk and add Avg Latency stat tile"
```

---

### Task 7: Dummy UI cleanup — real user name, remove fake Tokens Saved

**Files:**
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: Use the real signed-in user's name**

Find in `AppScreen`:
```ts
const AppScreen = ({ handleNavigate, isDarkMode, setIsDarkMode }: any) => {
  const { isSignedIn, isLoaded } = useUser();
```

Replace with:
```ts
const AppScreen = ({ handleNavigate, isDarkMode, setIsDarkMode }: any) => {
  const { isSignedIn, isLoaded, user } = useUser();
```

Find:
```ts
              <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-color)' }}>Hello Hari</span>
```

Replace with:
```ts
              <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-color)' }}>Hello {user?.firstName || 'there'}</span>
```

- [ ] **Step 2: Remove the fake "Tokens Saved" chip**

Find:
```ts
                <div className="telemetry-chip"><Shield size={14} color="var(--success-color)" /> <span>1,204 Actions Blocked</span></div>
                <div className="telemetry-chip"><Zap size={14} color="var(--warning-color)" /> <span>42.1k Tokens Saved</span></div>
              </div>
```

Replace with:
```ts
                <div className="telemetry-chip"><Shield size={14} color="var(--success-color)" /> <span>1,204 Actions Blocked</span></div>
              </div>
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit -p .`
Expected: no output (clean).

- [ ] **Step 4: Manual browser verification**

Confirm the header shows your real Clerk first name (not "Hari"), and the "Tokens Saved" chip is gone while "Actions Blocked" is still there unchanged.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "fix: use real signed-in user name, remove fake Tokens Saved counter"
```

---

### Task 8: Sessions screen — real data and resume

**Files:**
- Modify: `frontend/src/app/page.tsx`

**Interfaces:**
- Consumes: `GET /api/sessions`, `POST /api/sessions/:id/resume` (Task 2)

- [ ] **Step 1: Replace the hardcoded `SessionsScreen` body**

Find the entire `SessionsScreen` component:
```ts
const SessionsScreen = ({ handleNavigate, isDarkMode, setIsDarkMode }: any) => {
  return (
    <motion.div
      className="dashboard-wrapper"
      initial={{ opacity: 0, scale: 0.98, filter: 'blur(10px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
      transition={{ duration: 0.4 }}
    >
      <Appbar onLogoClick={() => handleNavigate('landing')} onApiClick={() => handleNavigate('api')} onMemoryClick={() => handleNavigate('memory')} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />

      <div style={{ maxWidth: '1000px', margin: '0 auto', width: '100%', padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)' }}>
        <div className="dash-title" style={{ paddingBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="icon-btn" onClick={() => handleNavigate('app')}><ChevronLeft size={20} /></button>
            <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-color)' }}>Past Sessions</h1>
          </div>
        </div>

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', paddingRight: '1rem' }}>
          {[
            { id: 1, title: 'System upgrade and dependency check', date: 'Today, 10:24 AM', tokens: '14.2k', risk: '14.5%', status: 'Blocked Actions' },
            { id: 2, title: 'Analyze frontend bundle size', date: 'Yesterday, 4:12 PM', tokens: '8.4k', risk: '2.1%', status: 'Completed' },
            { id: 3, title: 'Refactor user authentication flow', date: 'Jul 19, 2:45 PM', tokens: '32.1k', risk: '8.4%', status: 'Completed' },
            { id: 4, title: 'Scan home directory for large files', date: 'Jul 18, 9:15 AM', tokens: '4.2k', risk: '1.2%', status: 'Completed' },
          ].map(session => (
            <div key={session.id} className="glass-panel" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-color)' }}>{session.title}</h3>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{session.date}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div className="telemetry-chip"><Zap size={14} color="var(--warning-color)" /> <span>{session.tokens}</span></div>
                  <div className="telemetry-chip"><TriangleAlert size={14} color="var(--danger-color)" /> <span>{session.risk}</span></div>
                </div>
                <div className="status-indicator">
                  {session.status === 'Completed' ? <><div className="status-dot green"></div> {session.status}</> : <><div className="status-dot red"></div> {session.status}</>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};
```

Replace with:
```ts
const SessionsScreen = ({ handleNavigate, isDarkMode, setIsDarkMode }: any) => {
  const { isSignedIn, isLoaded } = useUser();
  const [sessions, setSessions] = useState<any[]>([]);

  const fetchSessions = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/sessions', { credentials: 'include' });
      if (!res.ok) { setSessions([]); return; }
      const data = await res.json();
      setSessions(data);
    } catch (error) {
      console.error(error);
      setSessions([]);
    }
  };

  useEffect(() => {
    if (isSignedIn) fetchSessions();
    else setSessions([]);
  }, [isSignedIn]);

  const handleResume = async (id: number) => {
    try {
      await fetch(`http://localhost:3001/api/sessions/${id}/resume`, { method: 'POST', credentials: 'include' });
      handleNavigate('app');
    } catch (error) {
      console.error('Failed to resume session:', error);
    }
  };

  return (
    <motion.div
      className="dashboard-wrapper"
      initial={{ opacity: 0, scale: 0.98, filter: 'blur(10px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
      transition={{ duration: 0.4 }}
    >
      <Appbar onLogoClick={() => handleNavigate('landing')} onApiClick={() => handleNavigate('api')} onMemoryClick={() => handleNavigate('memory')} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />

      <div style={{ maxWidth: '1000px', margin: '0 auto', width: '100%', padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)' }}>
        <div className="dash-title" style={{ paddingBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="icon-btn" onClick={() => handleNavigate('app')}><ChevronLeft size={20} /></button>
            <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-color)' }}>Past Sessions</h1>
          </div>
        </div>

        {!isLoaded ? null : !isSignedIn ? (
          <div className="glass-panel" style={{ padding: '2.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
            <MessageSquare size={28} color="var(--text-muted)" />
            <div style={{ fontWeight: 600, color: 'var(--text-color)' }}>Sign in to view your sessions</div>
            <SignInButton mode="modal">
              <button className="btn-pill" style={{ marginTop: '0.5rem', padding: '0.75rem 1.5rem' }}>Sign In</button>
            </SignInButton>
          </div>
        ) : (
          <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', paddingRight: '1rem' }}>
            {sessions.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No sessions yet. Start chatting to create one.</div>}
            {sessions.map((session: any) => (
              <div key={session.id} className="glass-panel" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => handleResume(session.id)}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-color)' }}>{session.title}</h3>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{new Date(session.updated_at).toLocaleString()}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <div className="telemetry-chip"><Clock size={14} color="var(--warning-color)" /> <span>{session.avgLatencyMs != null ? `${(session.avgLatencyMs / 1000).toFixed(1)}s avg` : '—'}</span></div>
                    <div className="telemetry-chip"><TriangleAlert size={14} color="var(--danger-color)" /> <span>{session.avgRiskScore != null ? `${session.avgRiskScore}% risk` : '—'}</span></div>
                  </div>
                  <div className="status-indicator">
                    {session.status === 'active' ? <><div className="status-dot green"></div> Active</> : <><div className="status-dot green"></div> Completed</>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit -p .`
Expected: no output (clean).

- [ ] **Step 3: Manual browser verification**

1. Navigate to "View all sessions" — confirm it shows real session(s) from earlier tasks' testing, not the old hardcoded 4-item list.
2. Click a completed session — confirm it navigates to the chat screen with that session's transcript/policies/settings restored.
3. `curl -s http://localhost:3001/api/sessions` from a signed-in tab — confirm the resumed session now shows `"status":"active"` and any previously-active session shows `"status":"completed"`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: show and resume real sessions instead of hardcoded list"
```
