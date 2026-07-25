# User Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the assistant a durable, per-user memory of facts (name, preferences, ongoing projects) that survives across separate conversations, automatically extracted in the background and injected into every chat's system prompt.

**Architecture:** A new `memories` SQLite table (one row per fact, keyed by Clerk `userId`) alongside the existing `api_keys`/`audit_logs` tables. `/api/chat` reads a user's facts before calling the LLM (injected into the system prompt) and, after the reply streams back, fires a background non-streaming Ollama call that extracts any new facts from the latest exchange and saves them. Chat itself now requires a signed-in Clerk session, since memory needs an identity to attach facts to. A new `/api/memories` endpoint pair and a `MemoryScreen` let the user view and delete what's been remembered.

**Tech Stack:** Express + better-sqlite3 (backend), Next.js App Router + `@clerk/nextjs` (frontend), Ollama (LLM), no test framework in this repo — verification is `tsc --noEmit`, `curl`, and manual browser checks, matching the existing project convention.

## Global Constraints

- Memory is scoped per Clerk `userId` — one fact list per account (spec §Key decisions 1).
- Chat history itself stays ephemeral — do NOT add conversation/message persistence. Only extracted facts are durable (spec §Scope).
- Extraction is background/fire-and-forget — must never delay or break the user-visible chat reply (spec §Key decisions 2).
- `/api/v1/*` routes (API-key-scoped, programmatic) are untouched — they keep their own `apiKeyAuth` and never read or write memory (spec §Error handling table).
- `/api/chat` and `/api/execute_tool` now require Clerk auth — this is an intentional behavior change from "usable while signed out" (spec §Key decisions 4).
- Delete operations must be scoped by `user_id` in the SQL `WHERE` clause — never trust a bare ID (spec §Data model).

---

### Task 1: Shared `requireAuth` middleware

**Files:**
- Create: `backend/src/middleware/requireAuth.ts`
- Modify: `backend/src/api/keys.route.ts`

**Interfaces:**
- Produces: `requireAuth(req: Request, res: Response, next: NextFunction): void` — exported named function. 401s with `{ error: 'Sign in required' }` JSON if `getAuth(req).isAuthenticated` is falsy, otherwise calls `next()`.

- [ ] **Step 1: Create the middleware file**

```ts
// backend/src/middleware/requireAuth.ts
import { Request, Response, NextFunction } from 'express';
import { getAuth } from '@clerk/express';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const { isAuthenticated } = getAuth(req);
  if (!isAuthenticated) {
    res.status(401).json({ error: 'Sign in required' });
    return;
  }
  next();
}
```

- [ ] **Step 2: Update `keys.route.ts` to use the shared middleware instead of its inline copy**

Find this in `backend/src/api/keys.route.ts`:

```ts
import { Router, Request, Response, NextFunction } from 'express';
import { getAuth } from '@clerk/express';
import { createKey, listKeys, revokeKey, updateKeyTools, ToolsEnabled } from '../db/apiKeys.repo';
import { listLogs } from '../db/auditLog.repo';

const router = Router();

// Key management and audit logs are sensitive — only a signed-in Clerk user may touch them.
function requireAuth(req: Request, res: Response, next: NextFunction) {
  const { isAuthenticated } = getAuth(req);
  if (!isAuthenticated) {
    res.status(401).json({ error: 'Sign in required' });
    return;
  }
  next();
}

router.use(requireAuth);
```

Replace with:

```ts
import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { createKey, listKeys, revokeKey, updateKeyTools, ToolsEnabled } from '../db/apiKeys.repo';
import { listLogs } from '../db/auditLog.repo';

const router = Router();

// Key management and audit logs are sensitive — only a signed-in Clerk user may touch them.
router.use(requireAuth);
```

- [ ] **Step 3: Type-check**

Run: `cd backend && npx tsc --noEmit -p .`
Expected: no output (clean).

- [ ] **Step 4: Regression-check the existing gated route still 401s unauthenticated**

Run (with the backend dev server running — `npm run dev` in `backend/`):
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/keys
```
Expected: `401`

- [ ] **Step 5: Commit**

```bash
git add backend/src/middleware/requireAuth.ts backend/src/api/keys.route.ts
git commit -m "refactor: extract shared requireAuth middleware from keys.route.ts"
```

---

### Task 2: `memories` table and repo

**Files:**
- Modify: `backend/src/db/init.ts`
- Create: `backend/src/db/memories.repo.ts`

**Interfaces:**
- Produces: `MemoryRow { id: number; user_id: string; content: string; created_at: string }`, `createMemory(userId: string, content: string): MemoryRow`, `listMemories(userId: string): MemoryRow[]`, `deleteMemory(id: number, userId: string): void`

- [ ] **Step 1: Add the `memories` table to `init.ts`**

In `backend/src/db/init.ts`, the file currently ends with:

```ts
      FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
    );
  `);
}
```

Replace with:

```ts
      FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
    );

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

- [ ] **Step 2: Create the repo file**

```ts
// backend/src/db/memories.repo.ts
import { db } from './db';

export interface MemoryRow {
  id: number;
  user_id: string;
  content: string;
  created_at: string;
}

export function createMemory(userId: string, content: string): MemoryRow {
  const created_at = new Date().toISOString();
  const info = db
    .prepare(`INSERT INTO memories (user_id, content, created_at) VALUES (?, ?, ?)`)
    .run(userId, content, created_at);
  return { id: info.lastInsertRowid as number, user_id: userId, content, created_at };
}

export function listMemories(userId: string): MemoryRow[] {
  return db
    .prepare(`SELECT * FROM memories WHERE user_id = ? ORDER BY created_at DESC`)
    .all(userId) as MemoryRow[];
}

export function deleteMemory(id: number, userId: string): void {
  db.prepare(`DELETE FROM memories WHERE id = ? AND user_id = ?`).run(id, userId);
}
```

- [ ] **Step 3: Type-check**

Run: `cd backend && npx tsc --noEmit -p .`
Expected: no output (clean).

- [ ] **Step 4: Verify the table gets created**

`CREATE TABLE IF NOT EXISTS` is idempotent and additive — it will not touch the existing `api_keys`/`audit_logs` data already in `backend/data/orb.db`. Do NOT delete the database file. `initDb()` runs on every backend startup (`backend/src/index.ts`), so if `tsx watch` is already running it will pick up the change automatically on save; otherwise start it:

```bash
cd backend && npm run dev &
sleep 2
sqlite3 backend/data/orb.db ".schema memories"
```
Expected output includes:
```
CREATE TABLE memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/db/init.ts backend/src/db/memories.repo.ts
git commit -m "feat: add memories table and repo"
```

---

### Task 3: `/api/memories` endpoints

**Files:**
- Create: `backend/src/api/memories.route.ts`
- Modify: `backend/src/index.ts`

**Interfaces:**
- Consumes: `requireAuth` from `../middleware/requireAuth` (Task 1), `listMemories`, `deleteMemory` from `../db/memories.repo` (Task 2)
- Produces: `GET /api/memories` → `MemoryRow[]` JSON, `DELETE /api/memories/:id` → `204`

- [ ] **Step 1: Create the route file**

```ts
// backend/src/api/memories.route.ts
import { Router, Request, Response } from 'express';
import { getAuth } from '@clerk/express';
import { requireAuth } from '../middleware/requireAuth';
import { listMemories, deleteMemory } from '../db/memories.repo';

const router = Router();

router.use(requireAuth);

router.get('/memories', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  res.json(listMemories(userId as string));
});

router.delete('/memories/:id', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  deleteMemory(Number(req.params.id), userId as string);
  res.status(204).end();
});

export default router;
```

- [ ] **Step 2: Mount it in `index.ts`**

Find:
```ts
import keysRoutes from './api/keys.route';
import v1ModelsRoutes from './api/v1/models.route';
```

Replace with:
```ts
import keysRoutes from './api/keys.route';
import memoriesRoutes from './api/memories.route';
import v1ModelsRoutes from './api/v1/models.route';
```

Find:
```ts
app.use('/api', keysRoutes);
app.use('/api/v1', v1ModelsRoutes);
```

Replace with:
```ts
app.use('/api', keysRoutes);
app.use('/api', memoriesRoutes);
app.use('/api/v1', v1ModelsRoutes);
```

- [ ] **Step 3: Type-check**

Run: `cd backend && npx tsc --noEmit -p .`
Expected: no output (clean).

- [ ] **Step 4: Verify unauthenticated access is rejected**

With the backend dev server running (`tsx watch` auto-restarts on file changes — confirm via its logs, or restart manually):

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/memories
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE http://localhost:3001/api/memories/1
```
Expected: `401` for both.

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/memories.route.ts backend/src/index.ts
git commit -m "feat: add GET/DELETE /api/memories endpoints"
```

---

### Task 4: Gate chat behind sign-in (backend + frontend)

**Files:**
- Modify: `backend/src/api/chat.route.ts`
- Modify: `frontend/src/app/page.tsx`

**Interfaces:**
- Consumes: `requireAuth` from `../middleware/requireAuth` (Task 1); `useUser` from `@clerk/nextjs` (already imported in `page.tsx`)

- [ ] **Step 1: Gate `chat.route.ts` behind `requireAuth`**

Find in `backend/src/api/chat.route.ts`:
```ts
import { Router, Request, Response } from 'express';
import { Agent } from '../agent/Agent';
import { Ollama } from '../llm/Ollama';
import { registry, executor } from '../agent/sharedInstances';
import { resolvePerformanceMode } from '../llm/performanceModes';

const router = Router();

router.post('/chat', async (req: Request, res: Response) => {
```

Replace with:
```ts
import { Router, Request, Response } from 'express';
import { Agent } from '../agent/Agent';
import { Ollama } from '../llm/Ollama';
import { registry, executor } from '../agent/sharedInstances';
import { resolvePerformanceMode } from '../llm/performanceModes';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

router.use(requireAuth);

router.post('/chat', async (req: Request, res: Response) => {
```

(This also gates `/execute_tool` below it in the same file, since both are on this router.)

- [ ] **Step 2: Type-check the backend**

Run: `cd backend && npx tsc --noEmit -p .`
Expected: no output (clean).

- [ ] **Step 3: Confirm chat now 401s unauthenticated**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hi"}]}'
```
Expected: `401`

- [ ] **Step 4: Add `credentials: 'include'` to the frontend's chat fetch**

Find in `frontend/src/app/page.tsx`:
```ts
      const response = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: currentMessages.map(m => ({ role: m.role, content: m.content, tool_calls: m.tool_calls, name: m.name })),
          systemPrompt: systemPrompt,
          model: selectedModel,
          toolPolicies,
          performanceMode
        })
      });
```

Replace with:
```ts
      const response = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: currentMessages.map(m => ({ role: m.role, content: m.content, tool_calls: m.tool_calls, name: m.name })),
          systemPrompt: systemPrompt,
          model: selectedModel,
          toolPolicies,
          performanceMode
        })
      });
```

- [ ] **Step 5: Add `credentials: 'include'` to the frontend's execute_tool fetch**

Find:
```ts
      const res = await fetch('http://localhost:3001/api/execute_tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool_name: toolCall.function.name, arguments: toolCall.function.arguments })
      });
```

Replace with:
```ts
      const res = await fetch('http://localhost:3001/api/execute_tool', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool_name: toolCall.function.name, arguments: toolCall.function.arguments })
      });
```

- [ ] **Step 6: Add a sign-in gate to `AppScreen`**

Find the start of `AppScreen` in `frontend/src/app/page.tsx`:
```ts
const AppScreen = ({ handleNavigate, isDarkMode, setIsDarkMode }: any) => {
  const chatContainer = useRef<HTMLDivElement>(null);
```

Replace with:
```ts
const AppScreen = ({ handleNavigate, isDarkMode, setIsDarkMode }: any) => {
  const { isSignedIn, isLoaded } = useUser();
  const chatContainer = useRef<HTMLDivElement>(null);
```

Then find the component's main return statement:
```ts
  return (
    <motion.div
      className="dashboard-wrapper"
      initial={{ opacity: 0, scale: 1.02, filter: 'blur(15px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <AnimatePresence>
        {showInstallAlert && (
```

Insert a new early-return block immediately before it (so it appears right above `return (` — keep `return (` and everything after it unchanged):
```ts
  if (isLoaded && !isSignedIn) {
    return (
      <motion.div
        className="dashboard-wrapper"
        initial={{ opacity: 0, scale: 1.02, filter: 'blur(15px)' }}
        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
        exit={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <Appbar onLogoClick={() => handleNavigate('landing')} onApiClick={() => handleNavigate('api')} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
        <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', textAlign: 'center', padding: '2rem' }}>
          <Shield size={28} color="var(--text-muted)" />
          <div style={{ fontWeight: 600, fontSize: '1.125rem', color: 'var(--text-color)' }}>Sign in to chat</div>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', maxWidth: 360 }}>
            Orb remembers facts about you across conversations, so chatting requires a signed-in account.
          </div>
          <SignInButton mode="modal">
            <button className="btn-pill" style={{ marginTop: '0.5rem', padding: '0.75rem 1.5rem' }}>Sign In</button>
          </SignInButton>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="dashboard-wrapper"
      initial={{ opacity: 0, scale: 1.02, filter: 'blur(15px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <AnimatePresence>
        {showInstallAlert && (
```

- [ ] **Step 7: Type-check the frontend**

Run: `cd frontend && npx tsc --noEmit -p .`
Expected: no output (clean).

- [ ] **Step 8: Manual browser verification**

With both dev servers running:
1. Open the app, sign out if signed in (via `UserButton` menu).
2. Navigate to the main chat screen (`app` screen). Expected: "Sign in to chat" gate shown instead of the chat interface.
3. Sign in via the gate's Sign In button.
4. Expected: chat interface appears, sending a message works exactly as before (streams a reply, no 401 in browser DevTools Network tab).

- [ ] **Step 9: Commit**

```bash
git add backend/src/api/chat.route.ts frontend/src/app/page.tsx
git commit -m "feat: require sign-in to chat"
```

---

### Task 5: Memory injection and background extraction

**Files:**
- Modify: `backend/src/agent/Agent.ts`
- Create: `backend/src/agent/memoryExtractor.ts`
- Modify: `backend/src/api/chat.route.ts`

**Interfaces:**
- Consumes: `listMemories`, `createMemory` from `../db/memories.repo` (Task 2), `Ollama` from `../llm/Ollama`
- Produces: `Agent.run(...): Promise<{ finalReply: string | null }>` (changed from implicit `Promise<void>`), `extractAndSaveMemories(userId: string, model: string, existingFacts: string[], userMessage: string, assistantReply: string): Promise<void>`

- [ ] **Step 1: Make `Agent.run()` return the final assistant reply**

Find in `backend/src/agent/Agent.ts`:
```ts
  async run(
    messages: Message[],
    systemPrompt: string,
    streamCallback: (chunk: any) => void,
    getPolicyStatus: (toolName: string) => string,
    performanceMode: PerformanceMode = 'high'
  ) {
```

Replace with:
```ts
  async run(
    messages: Message[],
    systemPrompt: string,
    streamCallback: (chunk: any) => void,
    getPolicyStatus: (toolName: string) => string,
    performanceMode: PerformanceMode = 'high'
  ): Promise<{ finalReply: string | null }> {
```

Find:
```ts
          } else if (policy === 'Requires Approval') {
            // Pause loop and yield back to client
            streamCallback({ type: 'requires_approval', toolCall });
            // End the current run. The client must resume.
            return;
          } else {
```

Replace with:
```ts
          } else if (policy === 'Requires Approval') {
            // Pause loop and yield back to client
            streamCallback({ type: 'requires_approval', toolCall });
            // End the current run. The client must resume.
            return { finalReply: null };
          } else {
```

Find:
```ts
      // No tool calls, meaning the LLM has given its final answer
      streamCallback({ type: 'done', contextTokens });
      break;
    }
  }
}
```

Replace with:
```ts
      // No tool calls, meaning the LLM has given its final answer
      streamCallback({ type: 'done', contextTokens });
      return { finalReply: fullContent || null };
    }
  }
}
```

- [ ] **Step 2: Type-check**

Run: `cd backend && npx tsc --noEmit -p .`
Expected: no output (clean). (This confirms the `while (true)` loop's only exit paths now both return a value, satisfying the new return type.)

- [ ] **Step 3: Create the extraction module**

```ts
// backend/src/agent/memoryExtractor.ts
import { Ollama } from '../llm/Ollama';
import { createMemory } from '../db/memories.repo';

export async function extractAndSaveMemories(
  userId: string,
  model: string,
  existingFacts: string[],
  userMessage: string,
  assistantReply: string
): Promise<void> {
  if (!userMessage || !assistantReply) return;

  const prompt = `You extract durable personal facts about a user from a conversation exchange.

Facts already known about this user:
${existingFacts.length ? existingFacts.map(f => `- ${f}`).join('\n') : '(none yet)'}

Latest exchange:
User: ${userMessage}
Assistant: ${assistantReply}

Output ONLY genuinely new, durable facts about the user that are not already known — things like their name, stated preferences, ongoing projects, or recurring context. Do NOT include one-off questions, requests, or facts already listed above.

Respond with a JSON array of strings and nothing else. If there are no new facts, respond with [].`;

  try {
    const llm = new Ollama(model, 'low');
    const response = await llm.chat([{ role: 'user', content: prompt }]);
    const text = (response.text || '').trim();

    const jsonStart = text.indexOf('[');
    const jsonEnd = text.lastIndexOf(']');
    if (jsonStart === -1 || jsonEnd === -1) return;

    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    if (!Array.isArray(parsed)) return;

    for (const fact of parsed) {
      if (typeof fact === 'string' && fact.trim()) {
        createMemory(userId, fact.trim());
      }
    }
  } catch (error) {
    console.error('Memory extraction failed:', error);
  }
}
```

- [ ] **Step 4: Type-check**

Run: `cd backend && npx tsc --noEmit -p .`
Expected: no output (clean).

- [ ] **Step 5: Wire memory injection and extraction into `chat.route.ts`**

Find:
```ts
import { Router, Request, Response } from 'express';
import { Agent } from '../agent/Agent';
import { Ollama } from '../llm/Ollama';
import { registry, executor } from '../agent/sharedInstances';
import { resolvePerformanceMode } from '../llm/performanceModes';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

router.use(requireAuth);

router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { messages, model = 'llama3.1', systemPrompt, toolPolicies, performanceMode } = req.body;

    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: 'Messages array is required' });
      return;
    }

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

    await agent.run(messages, systemPrompt, streamCallback, getPolicyStatus, mode);
    
    res.end();
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
import { extractAndSaveMemories } from '../agent/memoryExtractor';

const router = Router();

router.use(requireAuth);

router.post('/chat', async (req: Request, res: Response) => {
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

- [ ] **Step 6: Type-check**

Run: `cd backend && npx tsc --noEmit -p .`
Expected: no output (clean).

- [ ] **Step 7: Manual end-to-end verification**

With both dev servers running and signed in via the browser:
1. Send: "hey i am praneeth, i like sci-fi movies"
2. Wait for the reply to finish streaming, then wait ~5–10 seconds for the background extraction call to complete.
3. In the same signed-in browser tab, open a new tab to `http://localhost:3001/api/memories` (cookies are shared across tabs on the same origin, so the session carries over). Expected: a JSON array containing facts like `"name: Praneeth"` and `"likes: sci-fi movies"`. (Once Task 6 ships, the Memory screen is the normal way to check this instead.)
4. Start a new conversation (reload the page) and ask: "what do you know about me?"
   Expected: the reply references the previously extracted facts.

- [ ] **Step 8: Commit**

```bash
git add backend/src/agent/Agent.ts backend/src/agent/memoryExtractor.ts backend/src/api/chat.route.ts
git commit -m "feat: inject memory into chat and extract new facts in the background"
```

---

### Task 6: Memory management UI

**Files:**
- Modify: `frontend/src/app/page.tsx`

**Interfaces:**
- Consumes: `GET /api/memories`, `DELETE /api/memories/:id` (Task 3)

- [ ] **Step 1: Add the `Brain` icon to the lucide-react import**

Find:
```ts
import {
  ChevronLeft, ChevronRight, TriangleAlert, ShieldAlert, Shield, Zap,
  Cpu, Terminal, Search, Send, Plus, X, Globe, FileText, Sun, Moon,
  MessageSquare, Sparkles, Code, Clock
} from 'lucide-react';
```

Replace with:
```ts
import {
  ChevronLeft, ChevronRight, TriangleAlert, ShieldAlert, Shield, Zap,
  Cpu, Terminal, Search, Send, Plus, X, Globe, FileText, Sun, Moon,
  MessageSquare, Sparkles, Code, Clock, Brain
} from 'lucide-react';
```

- [ ] **Step 2: Add `'memory'` to the screen-state type unions**

Find:
```ts
  const [screen, setScreen] = useState<'landing' | 'app' | 'sessions' | 'api' | 'transition'>('landing');
  const [nextScreen, setNextScreen] = useState<'landing' | 'app' | 'sessions' | 'api'>('app');
```

Replace with:
```ts
  const [screen, setScreen] = useState<'landing' | 'app' | 'sessions' | 'api' | 'memory' | 'transition'>('landing');
  const [nextScreen, setNextScreen] = useState<'landing' | 'app' | 'sessions' | 'api' | 'memory'>('app');
```

Find:
```ts
  const handleNavigate = (target: 'landing' | 'app' | 'sessions' | 'api') => {
```

Replace with:
```ts
  const handleNavigate = (target: 'landing' | 'app' | 'sessions' | 'api' | 'memory') => {
```

- [ ] **Step 3: Render `MemoryScreen` in the top-level `AnimatePresence`**

Find:
```ts
      {screen === 'api' && <ApiScreen key="api" handleNavigate={handleNavigate} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />}
      {screen === 'transition' && <TransitionScreen key="transition" />}
```

Replace with:
```ts
      {screen === 'api' && <ApiScreen key="api" handleNavigate={handleNavigate} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />}
      {screen === 'memory' && <MemoryScreen key="memory" handleNavigate={handleNavigate} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />}
      {screen === 'transition' && <TransitionScreen key="transition" />}
```

- [ ] **Step 4: Add the Memory nav button to `Appbar`**

Find:
```ts
const Appbar = ({ onLogoClick, onApiClick, isDarkMode, setIsDarkMode }: any) => (
```

Replace with:
```ts
const Appbar = ({ onLogoClick, onApiClick, onMemoryClick, isDarkMode, setIsDarkMode }: any) => (
```

Find:
```ts
      <button
        onClick={onApiClick}
        title="API Access"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-color)', display: 'flex' }}
      >
        <Code size={20} />
      </button>
```

Replace with:
```ts
      <button
        onClick={onApiClick}
        title="API Access"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-color)', display: 'flex' }}
      >
        <Code size={20} />
      </button>
      <button
        onClick={onMemoryClick}
        title="Memory"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-color)', display: 'flex' }}
      >
        <Brain size={20} />
      </button>
```

- [ ] **Step 5: Wire `onMemoryClick` into every `Appbar` usage**

Every call site currently reads exactly:
```ts
<Appbar onLogoClick={() => handleNavigate('landing')} onApiClick={() => handleNavigate('api')} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
```
There are 5 identical occurrences after Task 4 (the 4 original screens plus the sign-in-gate block added in `AppScreen`). Replace **all** occurrences with:
```ts
<Appbar onLogoClick={() => handleNavigate('landing')} onApiClick={() => handleNavigate('api')} onMemoryClick={() => handleNavigate('memory')} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
```

- [ ] **Step 6: Add the `MemoryScreen` component**

Insert this new component immediately after the closing `};` of `ApiScreen` (i.e. right before `const TransitionScreen = () => (`):

```ts
const MemoryScreen = ({ handleNavigate, isDarkMode, setIsDarkMode }: any) => {
  const { isSignedIn, isLoaded } = useUser();
  const [memories, setMemories] = useState<any[]>([]);

  const fetchMemories = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/memories', { credentials: 'include' });
      if (!res.ok) { setMemories([]); return; }
      const data = await res.json();
      setMemories(data);
    } catch (error) {
      console.error(error);
      setMemories([]);
    }
  };

  useEffect(() => {
    if (isSignedIn) fetchMemories();
    else setMemories([]);
  }, [isSignedIn]);

  const handleDelete = async (id: number) => {
    await fetch(`http://localhost:3001/api/memories/${id}`, { method: 'DELETE', credentials: 'include' });
    fetchMemories();
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

      <div style={{ maxWidth: '1000px', margin: '0 auto', width: '100%', padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div className="dash-title" style={{ paddingBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="icon-btn" onClick={() => handleNavigate('app')}><ChevronLeft size={20} /></button>
            <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-color)' }}>Memory</h1>
          </div>
        </div>

        {!isLoaded ? null : !isSignedIn ? (
          <div className="glass-panel" style={{ padding: '2.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
            <Brain size={28} color="var(--text-muted)" />
            <div style={{ fontWeight: 600, color: 'var(--text-color)' }}>Sign in to view your memory</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', maxWidth: 360 }}>
              Facts Orb remembers about you across conversations are only visible to a signed-in account.
            </div>
            <SignInButton mode="modal">
              <button className="btn-pill" style={{ marginTop: '0.5rem', padding: '0.75rem 1.5rem' }}>Sign In</button>
            </SignInButton>
          </div>
        ) : (
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <div className="dash-title-small" style={{ marginBottom: '1rem' }}>What Orb remembers</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {memories.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Nothing remembered yet.</div>}
              {memories.map((m: any) => (
                <div key={m.id} className="rule-row">
                  <div>
                    <div className="rule-row-title">{m.content}</div>
                    <div className="rule-row-desc">{new Date(m.created_at).toLocaleString()}</div>
                  </div>
                  <button className="icon-btn" onClick={() => handleDelete(m.id)}><X size={16} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};
```

- [ ] **Step 7: Type-check**

Run: `cd frontend && npx tsc --noEmit -p .`
Expected: no output (clean).

- [ ] **Step 8: Manual browser verification**

With both dev servers running and signed in:
1. Click the new Memory (brain) icon in the nav bar.
2. Expected: the Memory screen loads, showing any facts extracted in Task 5's verification step (e.g. "name: Praneeth", "likes: sci-fi movies").
3. Click delete (X) on one fact. Expected: it disappears from the list immediately.
4. Send a new chat message and ask "what do you know about me?" — the deleted fact should no longer be mentioned.
5. Sign out, navigate to the Memory screen again. Expected: "Sign in to view your memory" gate, not a broken/empty list.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: add Memory screen to view and delete remembered facts"
```
