# Session Persistence, Real Hallucination Risk, Avg Latency — Design Spec

Date: 2026-07-23
Status: Approved, pending implementation

## Problem

Chat sessions are entirely ephemeral — messages, policies, and settings all live in React state and vanish on reload. The Sessions screen shows a hardcoded array of 4 fake sessions that were never real. Hallucination Risk in the left pane is a hardcoded `14.5` with zero computation behind it. There's no Avg Latency metric despite already collecting per-message timing data (`firstTokenMs`/`totalMs`, from the earlier context-usage work).

## Scope

**In scope:** persist chat sessions (transcript, policies, settings) per Clerk user; make the Sessions screen list and resume real sessions; compute a real hallucination-risk score per reply via a background LLM self-critique call; add an Avg Latency stat to the left pane; fix the `"Hello Hari"` hardcoded greeting to use the real signed-in user's name; remove the fake `"42.1k Tokens Saved"` counter.

**Explicitly out of scope (left as-is, by explicit choice):** the `"1,204 Actions Blocked"` counter stays fake/unfixed; the `+ Add Tool` button's `alert("Modal to add tool")` stub is untouched — a real tool-integration concept is a separate future feature. Memory (facts) persistence, added in the prior spec, is unaffected — it stays global per user, independent of sessions.

## Key decisions

1. **Hallucination Risk = self-critique LLM call, combined with the existing memory-extraction background call.** After each reply, one background call now returns both new memory facts and a 0–100 hallucination-risk score in a single JSON object, instead of running two separate slow background calls per turn. `memoryExtractor.ts` is renamed `postChatAnalysis.ts` to reflect the broadened responsibility.
2. **Left pane's Hallucination Risk and new Avg Latency tiles show a running average across the current session**, not just the latest reply — consistent with how both metrics are meant to characterize overall session trustworthiness/performance, not one snapshot.
3. **Session boundary is explicit**, via a "New Chat" button. There's no time/reload-based session ending. The live chat is always "the current session" — autosaved as changes happen — until New Chat finalizes it and starts a fresh one.
4. **Clicking a past session resumes it** (loads transcript/policies/settings back into the live chat, becomes the current session again), not a read-only view. At most one session per user is `'active'` at a time; resuming demotes whatever was previously active to `'completed'`.
5. **Session persistence is folded into the existing `/api/chat` flow**, not a separate autosave-on-every-keystroke endpoint for messages. The backend already receives the full messages array on every chat request and is already the place a new assistant reply gets finalized — it's the natural, race-free place to persist the transcript and to know exactly which session+message-index a delayed background analysis result belongs to. Policies/settings/tool toggles, which can change independent of sending a message, get their own lightweight debounced `PATCH` endpoint.
6. **Race-safe risk-score patching.** The background analysis call can take 40–75s (per the prior spec's finding with reasoning models). By the time it completes, the user may have sent another message or resumed a different session. It patches the risk score onto an explicit `(sessionId, messageIndex)` captured at request time, never "whatever is currently active" — so a late result always lands on the correct message regardless of what's happened since.
7. **Dummy UI cleanup is scoped, not blanket.** Only `"Hello Hari"` and `"Tokens Saved"` get fixed in this pass, by explicit user choice — `"Actions Blocked"` and the Add Tool button are intentionally left alone.

## Architecture / data flow

```
AppScreen mounts (signed in)
  │
  ├─► GET /api/sessions/active
  │     found → hydrate messages/policies/settings/tools into local state
  │     none  → start blank with app defaults (no session row created yet)
  │
User sends a chat message
  │
  ├─► POST /api/chat (as today) — but the backend now ALSO:
  │     1. looks up (or lazily creates) this user's active session row,
  │        computing messageIndex = messages.length (where the new
  │        assistant reply will land)
  │     2. after the reply streams back, saves the full updated message
  │        array onto that session row (+ derives a title from the first
  │        user message, if not already set)
  │     3. kicks off the background analysis call (fire-and-forget,
  │        unaffected timing-wise by anything after) — on completion,
  │        patches the risk score onto that exact (sessionId, messageIndex)
  │
Policies / settings / tool toggles change (independent of sending a message)
  │
  └─► PATCH /api/sessions/active (debounced ~800ms) — updates just those
        fields on the active session row, creating it if this is the very
        first thing touched before ever sending a message

"New Chat" button
  │
  └─► POST /api/sessions/active/complete — marks current active session
        'completed', then local state resets to blank defaults. No new
        row until the next message/setting change.

Sessions screen
  │
  ├─► GET /api/sessions — list with real computed summaries (message
  │     count, avg latency, avg risk) instead of the hardcoded array
  │
  └─► clicking a session → POST /api/sessions/:id/resume (demotes
        whatever was active, promotes this one) → navigate to 'app',
        hydrate from GET /api/sessions/:id
```

## Data model

New `sessions` table, following the existing `audit_logs`-style convention of JSON blobs in `TEXT` columns:

```sql
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
```

- `messages`: JSON array, same shape as the frontend's message objects (`role`, `content`, `tool_calls`, `name`, `firstTokenMs`, `totalMs`, and now optionally `riskScore`).
- `settings`: JSON object — `{ systemPrompt, selectedModel, chatMode, performanceMode, inputLimitIdx, outputLimitIdx, tools }`.
- `status`: `'active' | 'completed'`. Invariant (enforced in code, not a DB constraint — matching the codebase's existing style of no foreign-key enforcement): **at most one `'active'` session per user.**

New repo `backend/src/db/sessions.repo.ts`:
- `getActiveSession(userId: string): SessionRow | null`
- `createActiveSession(userId: string): SessionRow` — lazily creates a blank active row
- `upsertActiveMessages(userId: string, messages: unknown[]): SessionRow` — creates if none exists; also sets `title` from the first user message if `title` is still the default
- `patchSettings(userId: string, data: { policies?: unknown[]; settings?: unknown }): void`
- `patchMessageRiskScore(sessionId: number, userId: string, messageIndex: number, riskScore: number): void` — no-ops if the session/index no longer exists or is out of bounds
- `completeActiveSession(userId: string): void`
- `listSessions(userId: string): SessionSummary[]` — parses each row's `messages` JSON to compute `messageCount`, `avgLatencyMs`, `avgRiskScore`
- `getSession(id: number, userId: string): SessionRow | null`
- `resumeSession(id: number, userId: string): SessionRow | null` — demotes any currently-active session for this user, promotes the target to `'active'`

## Backend components

**`postChatAnalysis.ts`** (renamed from `memoryExtractor.ts`):

```ts
async function analyzeChat(
  userId: string,
  model: string,
  sessionId: number,
  messageIndex: number,
  existingFacts: string[],
  userMessage: string,
  assistantReply: string
): Promise<void>
```

Single prompt, single JSON object response: `{ "newFacts": string[], "hallucinationRisk": number }` — `hallucinationRisk` is a 0–100 self-assessment of how likely the reply contains ungrounded or fabricated claims. Parses defensively exactly like the existing fact-extraction parsing (bracket-scan + `JSON.parse` in a try/catch, log-and-skip on any failure — the object braces are found the same way the array brackets are today, just swap `[`/`]` for `{`/`}`). Saves new facts via the existing `createMemory` (unchanged), then calls `patchMessageRiskScore(sessionId, userId, messageIndex, hallucinationRisk)`.

**`chat.route.ts` changes**: at request start, `getActiveSession(userId)` (falling back to `createActiveSession(userId)` if none exists) to obtain `sessionId`, and compute `messageIndex = messages.length` (the index the new assistant reply will occupy once appended). After `agent.run()` resolves and the response has ended, call `upsertActiveMessages(userId, [...messages, assistantReplyMessage])`, then fire `analyzeChat(userId, model, sessionId, messageIndex, existingFacts, lastUserMessage, finalReply)` in the background exactly as today's memory extraction does (fire-and-forget, `.catch()`-guarded, never affects the response already sent).

**`sessions.route.ts`** (new file), all routes gated with `requireAuth` applied per-route (matching the fix from the previous auth-scoping bug — never `router.use(requireAuth)` unpathed on a router sharing the `/api` mount prefix):
- `GET /api/sessions/active`
- `PATCH /api/sessions/active` — body `{ policies?, settings? }`
- `POST /api/sessions/active/complete`
- `GET /api/sessions` — list with summaries
- `GET /api/sessions/:id`
- `POST /api/sessions/:id/resume`

## Frontend changes

**`AppScreen` hydration**: on mount, if signed in, `GET /api/sessions/active` (`credentials: 'include'`). If found, hydrate `messages`, `policies`, `systemPrompt`, `selectedModel`, `chatMode`, `performanceMode`, `inputLimitIdx`, `outputLimitIdx`, and `tools` from the response; store the returned session `id` in a ref (`activeSessionIdRef`) for later PATCH calls. If not found, keep the current blank defaults — no session row exists until the first message or setting change.

**Debounced settings/policies autosave**: a `useEffect` watching `[policies, systemPrompt, selectedModel, chatMode, performanceMode, inputLimitIdx, outputLimitIdx, tools]`, debounced ~800ms via `setTimeout`/`clearTimeout`, calling `PATCH /api/sessions/active` with `{ policies, settings: { systemPrompt, selectedModel, chatMode, performanceMode, inputLimitIdx, outputLimitIdx, tools } }`. Guarded to skip firing on the very first render (right after hydration) so hydrating doesn't immediately re-save what was just loaded.

**"New Chat" button**: new button in the center panel header, next to the model `<select>`. On click: if `activeSessionIdRef.current` is set, `POST /api/sessions/active/complete`; then reset `messages`, `policies` (back to the three default rows), `tools` (back to all-active defaults), `systemPrompt` (back to the default string), and clear `activeSessionIdRef.current`.

**Sessions screen**: replace the hardcoded 4-item array with `GET /api/sessions`. Render real `title`, a human-readable relative/absolute `updated_at`, the computed avg-latency and avg-risk-score in place of the old fake "tokens"/"risk" chips, and real `status` (`'active'` shown as green "Active", `'completed'` shown as the existing green "Completed" treatment — dropping the fake "Blocked Actions" status entirely since it was never backed by anything). Clicking a card: `POST /api/sessions/:id/resume`, then `handleNavigate('app')` — `AppScreen`'s mount-time hydration effect (`GET /api/sessions/active`) then naturally picks up the now-active resumed session.

**Left pane**: new "Avg Latency" stat tile, same visual style as the existing Hallucination Risk `stat-item` card, computed as the average of `totalMs` across all messages in local `messages` state that have one. The existing Hallucination Risk tile's value becomes the average of `riskScore` across messages that have one (instead of the hardcoded `14.5`). Both tiles get a small "Refresh" icon-button (matching the Memory screen's pattern) that re-fetches `GET /api/sessions/active` and merges in any risk scores the background analysis has since patched onto messages — since those arrive asynchronously up to a minute or two after the reply, with no live push mechanism, matching the same latency-tolerant pattern already shipped for Memory.

**Dummy cleanup**:
- `"Hello Hari"` → `` `Hello ${user?.firstName || 'there'}` `` using Clerk's `useUser()` (`AppScreen` already calls `useUser()` for the sign-in gate — reuse `user` from it).
- `"42.1k Tokens Saved"` telemetry chip: removed entirely from the center panel header.
- `"1,204 Actions Blocked"` chip and the `+ Add Tool` button: untouched.

## Error handling & edge cases

| Case | Behavior |
|---|---|
| Settings/policies changed before any message ever sent | `PATCH /api/sessions/active` upserts — creates the row lazily via the same path `createActiveSession` uses |
| Background analysis completes after the session was completed or resumed away from | Patches by the explicit `(sessionId, messageIndex)` captured at request time, never "whichever session is active now" — always lands correctly regardless of what's happened since |
| `messageIndex` out of bounds when patching (e.g. row state changed unexpectedly) | No-op, logged via `console.error`, never throws — background task failure must never surface as a user-visible error |
| Title derivation with no user message present (shouldn't normally happen given `/chat` requires a `messages` array) | Falls back to the column default `'New Chat'` |
| `riskScore` not yet computed for a message | Field simply absent on that message object; averages only include messages that have one (matches how `firstTokenMs`/`totalMs` already work — assistant messages, not user/tool messages, and only once available) |
| `/api/v1/chat` (API-key-scoped, programmatic) | Untouched — no session persistence there, same reasoning as the memory spec: sessions are a browser/Clerk-session feature only |
| Resuming a session that is already the active one | `resumeSession` is idempotent — demoting-then-promoting the same row is a no-op status-wise |

## Testing plan

- `tsc --noEmit` clean on both `frontend` and `backend`
- Sign in, send a couple of chat messages → `GET /api/sessions/active` shows the growing transcript with a derived title (first user message, truncated)
- Reload the page → hydration restores the same messages/policies/settings from the active session
- Toggle performance mode or add a custom policy rule without sending any chat message → confirm (via `GET /api/sessions/active`) it landed on the session row after the debounce window, without needing a chat send to trigger it
- Click "New Chat" → old session flips to `'completed'` (visible in `GET /api/sessions`), local state resets to blank defaults, a fresh session is created lazily on the next message/setting change
- Sessions screen shows real titles/timestamps/avg-latency/avg-risk instead of the old hardcoded array; clicking a past session resumes it and repopulates the live chat exactly as it was left
- Send a message, wait for the background analysis call to complete (up to ~1–2 minutes per the prior spec's timing finding), hit the new Refresh affordance on the left pane → hallucination risk score appears and both stat tiles update to reflect it
- Confirm `"Hello Hari"` shows the real signed-in user's first name, and the "Tokens Saved" chip is gone from the header
