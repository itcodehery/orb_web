# User Memory — Design Spec

Date: 2026-07-23
Status: Approved, pending implementation

## Problem

Chat history is entirely ephemeral — it's a React state array in the browser tab, sent in full on every request, and gone on refresh. There's no way for the assistant to recall anything ("I'm Praneeth", "I like sci-fi movies") across separate conversations, unlike Claude's own persistent memory feature.

## Scope

**In scope:** a durable "memory" layer — short, standalone facts about a user, automatically extracted from conversation, persisted, and injected into every future chat's system prompt. A UI to view and delete stored facts.

**Out of scope (explicitly deferred):** persisting full chat transcripts/conversation history. Chat history remains ephemeral exactly as it is today; only extracted facts are durable. Revisit as a separate spec if needed later.

## Key decisions

1. **Memory scope: per Clerk user.** Each signed-in account gets its own fact list, keyed by Clerk `userId`. This follows the same pattern as the API-key/audit-log auth wired up previously.
2. **Extraction: automatic, background.** After each assistant reply, a background (non-blocking) LLM call scans the latest exchange for durable facts and saves any new ones. No user effort required, matches Claude's memory model. Runs after the stream ends — never delays the user-visible reply.
3. **Storage: flat fact list, not embeddings or a fixed schema.** Each fact is a short freeform text row (e.g. `"name: Praneeth"`, `"likes: sci-fi movies"`), injected wholesale into the system prompt. Considered and rejected:
   - Embedding-based semantic memory (RAG-style retrieval) — real infra (embedding model, vector index, similarity search) that only pays off at hundreds/thousands of facts. One person's fact list stays in the dozens.
   - Structured profile schema (fixed fields like `name`, `preferences{}`) — forces extraction into rigid slots, brittle for facts that don't fit a predefined field.
4. **Chat now requires sign-in.** `/api/chat` and `/api/execute_tool` move behind Clerk auth (previously only `/api/keys` and `/api/audit-logs` were gated). This is a real behavior change — the app was usable signed-out before, and after this change it isn't. Memory needs a user identity to attach facts to, and the user explicitly chose "require sign-in to chat at all" over "chat works, no memory" when signed out.
5. **Memory management UI: view + delete.** A new screen lists stored facts with a delete button per fact — transparency and control, and the safety valve for any bad/duplicate extractions.

## Architecture / data flow

```
User sends chat message
        │
        ▼
POST /api/chat (requires Clerk session — 401 if signed out)
        │
        ▼
Agent.run() streams reply as today
        │
        ├─► before calling the LLM: fetch memories for this user_id,
        │   append as a block to the existing systemPrompt
        │
        └─► after the reply finishes streaming (fire-and-forget,
            does not block the response):
                 extractAndSaveMemories(userId, existingFacts, userMessage, assistantReply)
                     → one non-streaming Ollama call ('low' performance
                       profile — fast, small-context, this is just
                       classification), JSON-array-only output
                     → parse, save any genuinely new facts to SQLite
```

Memory *read* (for injection) is synchronous — it has to be, the facts need to be in the prompt before the LLM call. Memory *write* (extraction) is async and decoupled from the response; a failed or slow extraction never affects the user's actual conversation.

## Data model

New table, following the same pattern as `api_keys` / `audit_logs` in `backend/src/db/init.ts`:

```sql
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,      -- Clerk userId
  content TEXT NOT NULL,      -- e.g. "name: Praneeth", "likes: sci-fi movies"
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id);
```

New repo `backend/src/db/memories.repo.ts`, mirroring `apiKeys.repo.ts`:
- `createMemory(userId: string, content: string)`
- `listMemories(userId: string)`
- `deleteMemory(id: number, userId: string)` — delete is scoped by `user_id` in the `WHERE` clause, so a guessed ID belonging to another user silently no-ops rather than leaking existence or allowing cross-user deletion.

## Backend components

**Shared auth guard.** Extract the `requireAuth` middleware currently inline in `keys.route.ts` into `backend/src/middleware/requireAuth.ts` (uses `getAuth(req)` from `@clerk/express`, 401s if `!isAuthenticated`). Reuse it in:
- `keys.route.ts` (already gated — no behavior change, just relocated)
- `chat.route.ts`, on both `/chat` and `/execute_tool`

Route handlers read `const { userId } = getAuth(req)` to scope memory reads/writes.

**Memory injection**, in `chat.route.ts` before calling `agent.run()`:

```ts
const memories = listMemories(userId);
const combinedSystemPrompt = memories.length
  ? `${systemPrompt}\n\n## What you know about this user (from past conversations):\n${memories.map(m => `- ${m.content}`).join('\n')}`
  : systemPrompt;
```

**Background extraction**, new file `backend/src/agent/memoryExtractor.ts`:

```ts
async function extractAndSaveMemories(userId: string, existingFacts: string[], userMessage: string, assistantReply: string): Promise<void>
```

Builds a prompt along the lines of: *"Here are facts you already know about this user: [...]. Here's the latest exchange: [user message] / [assistant reply]. Output ONLY genuinely new, durable facts (name, preferences, ongoing projects, recurring context — not one-off questions like 'what's the weather') as a JSON array of strings. Empty array if nothing new. Respond with JSON only, no prose."*

Calls it via the existing `Ollama` class's non-streaming `chat()` method with the `'low'` performance profile (small context, fast — this is a classification task, not long-form generation). Parses the JSON response defensively (try/catch, validate it's an array of strings); on any failure, log and skip — never throws into the request path since this runs after the response has already been sent.

For each new fact returned, call `createMemory(userId, fact)`.

Invoked from `chat.route.ts` after `res.end()`, not awaited by the response — fire-and-forget.

## New API endpoints

New file `backend/src/api/memories.route.ts`, mounted at `/api`, both routes behind `requireAuth`:
- `GET /api/memories` → `listMemories(userId)`
- `DELETE /api/memories/:id` → `deleteMemory(id, userId)`, `204` on success

## Frontend changes

**Chat sign-in gate.** `AppScreen` (the main chat interface) needs the same "sign in required" pattern already built for `ApiScreen`: check `useUser()`'s `isSignedIn`/`isLoaded`, and when not signed in, render a sign-in prompt in place of the chat interface rather than letting `/api/chat` calls silently 401.

**Memory screen.** New `MemoryScreen` component, visually consistent with the existing `ApiScreen`: a `glass-panel` card listing facts as `rule-row` items (fact text + delete `X` button), same signed-out gate treatment, empty state "Nothing remembered yet." Fetches `GET /api/memories` with `credentials: 'include'`; delete calls `DELETE /api/memories/:id` then refetches.

**Navigation.** New icon button in `Appbar` (alongside the existing API Access `Code` icon) opens the Memory screen — a new `screen` state value (`'memory'`), following the exact pattern `'api'` already uses (`handleNavigate('memory')`, conditional render in the top-level `AnimatePresence`).

## Error handling & edge cases

| Case | Behavior |
|---|---|
| Signed-out chat request | `requireAuth` 401s; frontend shows sign-in gate instead of chat interface |
| Extraction LLM call throws or returns malformed/non-JSON output | Caught, logged, skipped — no facts saved this turn, next turn tries again |
| Extraction returns a fact that's a near-duplicate of an existing one | Best-effort avoided by including existing facts in the extraction prompt; not guaranteed — manual delete UI is the safety valve |
| Delete request for a memory ID belonging to another user | `WHERE user_id = ?` scoping means it silently no-ops, no error leaking whether the ID exists |
| `/api/models`, `/api/system-info` | Untouched — stay public, not identity-relevant |
| `/api/v1/chat` (API-key-scoped, programmatic) | Untouched — keeps its own API-key auth, does not read or write memory. Memory is a browser/Clerk-session feature only |

## Testing plan

- `tsc --noEmit` clean on both `frontend` and `backend`
- Manual: sign in → "hey i am praneeth, i like sci-fi movies" → confirm `GET /api/memories` shows extracted facts shortly after the reply completes
- Start a new conversation (reload page) → ask "what do you know about me?" → confirm the previously extracted facts show up in the response
- Sign out → confirm `/api/chat` returns 401 and the UI shows the sign-in gate, not a broken/hanging chat
- Delete a fact from the Memory screen → confirm it disappears from the list and is no longer injected into the next message's system prompt
- Attempt to delete another user's memory ID (if testing with two accounts) → confirm no-op, no leakage
