# API Access + Audit Logging (Spec 1 of 3)

## Context

Orb currently has no way to be used from outside its own dashboard, and no persistence layer
at all (everything lives in React state or is hardcoded). This spec adds the first of three
planned subsystems, in dependency order:

1. **This spec** — external API access (API keys + `/api/v1/*` endpoints) with full audit
   logging, backed by a new SQLite storage layer (all three are tightly coupled — keys need
   storage, logging needs an API to log against — so they ship as one deliverable).
2. **Analytics dashboard** (next) — Grafana-style view over the audit log data this spec writes,
   surfacing unusual activity.
3. **Smarter agent features** (last) — mostly independent, can be built anytime after this.

Goal of this spec: let external systems call into Orb's agent with a scoped API key, with every
call durably logged, and a dashboard screen to manage keys and see that logging is actually
happening.

## Architecture & data model

New SQLite database via `better-sqlite3` (new dependency; sync API, single local file, fits the
"local-first, nothing leaves your machine" positioning already in the README). File location:
`backend/data/orb.db` (directory created at boot if missing; `backend/data/` added to
`.gitignore`).

Migrations: a `backend/src/db/init.ts` module runs `CREATE TABLE IF NOT EXISTS` for both tables
once at server startup (called from `index.ts` before `app.listen`). No migration framework —
schema is small and stable enough that idempotent `CREATE TABLE IF NOT EXISTS` is sufficient for
v1.

### `api_keys` table
| column | type | notes |
|---|---|---|
| id | INTEGER PRIMARY KEY | autoincrement |
| name | TEXT | user-supplied label |
| key_hash | TEXT | sha256 hex digest of the plaintext key; plaintext is never stored |
| tools_enabled | TEXT | JSON object `{"fs":bool,"bash":bool,"web":bool}` |
| created_at | TEXT | ISO 8601 |
| revoked_at | TEXT NULL | ISO 8601, null while active |

### `audit_logs` table
| column | type | notes |
|---|---|---|
| id | INTEGER PRIMARY KEY | autoincrement |
| api_key_id | INTEGER | FK to `api_keys.id` |
| timestamp | TEXT | ISO 8601, start of request |
| endpoint | TEXT | e.g. `/api/v1/chat` |
| model | TEXT | model name used |
| request_messages | TEXT | JSON array of the incoming messages |
| response_content | TEXT | final assistant text for the exchange |
| tool_calls | TEXT | JSON array of tool calls made during the exchange |
| tool_results | TEXT | JSON array of tool results (or block reasons) |
| policy_decisions | TEXT | JSON — which tools were Allowed/Blocked for this call, per the key's `tools_enabled` at call time |
| latency_ms | INTEGER | wall-clock time for the full exchange |
| tokens_in | INTEGER | best-effort, from Ollama response if available, else null |
| tokens_out | INTEGER | best-effort, from Ollama response if available, else null |
| status_code | INTEGER | HTTP status returned to the caller |

Key format: `orb_sk_` + 32 hex chars from `crypto.randomBytes(16).toString('hex')` (Node builtin,
no new dependency). Hashing via `crypto.createHash('sha256')`. Plaintext key is generated,
returned once in the create-key API response, and never persisted or logged anywhere (including
`audit_logs` — key identity there is `api_key_id`, not the key value).

New repo modules (plain functions over a shared `better-sqlite3` `Database` instance, following
this codebase's existing lightweight-class style, e.g. `ToolRegistry`):
- `backend/src/db/db.ts` — opens/exports the `Database` instance.
- `backend/src/db/init.ts` — creates tables.
- `backend/src/db/apiKeys.repo.ts` — `createKey`, `listKeys`, `revokeKey`, `verifyKey(plaintext)`, `updateKeyTools`.
- `backend/src/db/auditLog.repo.ts` — `insertLog`, `listLogs(limit)`.

## API surface & auth flow

Internal dashboard endpoints (`/api/chat`, `/api/models`, `/api/execute_tool`) are **unchanged**
— still unauthenticated, trusted-localhost-only, exactly as today.

New internal CRUD for the dashboard to manage keys (also unauthenticated/local-only, same trust
model as the existing internal API):
- `POST /api/keys` — body `{ name, tools: {fs,bash,web} }` → creates key, returns
  `{ id, name, key, tools, created_at }` (plaintext `key` only in this one response).
- `GET /api/keys` — list keys, masked (`orb_sk_****<last4>`), no hash/plaintext exposed.
- `DELETE /api/keys/:id` — sets `revoked_at`.
- `PATCH /api/keys/:id/tools` — updates `tools_enabled`.
- `GET /api/audit-logs?limit=50` — recent log rows for the dashboard's log table.

New **external** namespace, `backend/src/api/v1/` mounted at `/api/v1`, gated by
`backend/src/middleware/apiKeyAuth.ts`:
- Reads `Authorization: Bearer <key>` header, hashes it, looks up an active (non-revoked) key via
  `apiKeys.repo.verifyKey`. Missing/invalid/revoked → `401 { error: 'Invalid or missing API key' }`.
  On success, attaches `req.apiKey` (the row) for downstream handlers.
- `POST /api/v1/chat` — same request shape as internal `/api/chat` (`messages`, `systemPrompt`,
  `model`, `performanceMode`) **minus** `toolPolicies` (that's derived from the key, not the
  caller). Reuses the existing `Agent.run` loop unchanged. The `getPolicyStatus` closure passed
  to `Agent.run` here is built from `req.apiKey.tools_enabled`: enabled tool → `'Allowed'`,
  disabled → `'Blocked'`. **Never `'Requires Approval'`** — there's no human on the other end of
  an API call, so per-key tool enablement *is* the consent (confirmed with user). Same NDJSON
  streaming response shape as the internal endpoint.
- `GET /api/v1/models` — same as internal `/api/models`, key-gated.
- Both routes wrap execution to capture start time, accumulate the full exchange (messages, tool
  calls/results, final content, token counts if Ollama reports them) while streaming to the
  caller, and write **one row to `audit_logs` after the exchange completes** — on success,
  policy-block, or error alike (logged in a `finally`-equivalent so failures are never silently
  unlogged).

Explicit non-goals for this spec (deferred, not silently dropped):
- No per-key rate limiting/quotas (v1 scope was explicitly "tool access only").
- No per-key policy override (Allow/Block/Require-Approval nuance) — only the on/off tool
  allowlist decided earlier.
- No key expiry/rotation UI beyond manual revoke.
- No streaming-vs-buffered choice for callers — `/api/v1/chat` always streams NDJSON, matching
  the internal endpoint; callers that want a single buffered response must consume the stream and
  concatenate client-side.

## Frontend UI

- `Appbar` (already rendered on every screen) gets a new icon button reusing the already-imported
  `Code` icon (`page.tsx` import list already includes `Code` from `lucide-react` — confirmed
  unused elsewhere, so this is a genuine reuse, not a naming collision), placed next to the
  dark-mode toggle. Click → `handleNavigate('api')`.
- `Home`'s `screen` union type extended: `'landing' | 'app' | 'sessions' | 'api' | 'transition'`.
- New `ApiScreen` component, following the same structural pattern as `SessionsScreen` (back
  chevron + title header, `glass-panel` cards, `max-width: 1000px` centered column):
  - **Base URL card**: displays `http://localhost:3001/api/v1` with a copy-to-clipboard button
    (reuse the existing `navigator.clipboard.writeText` pattern already used for the
    `ollama run llama3.1` snippet in `AppScreen`'s install-alert modal).
  - **Create key form**: name text input + three checkboxes (Local FS / Bash Exec / Web Search,
    mirroring the labels already used in `AppScreen`'s "Active Integrations" list) + Create
    button → `POST /api/keys`. On success, shows the plaintext key **once** in a dismissable
    panel (amber/warning-styled, reusing `--warning-color`) with a copy button and the text
    "This key won't be shown again — store it securely."
  - **Keys list**: one row per key — name, masked key, created date, enabled-tool badges, Revoke
    button (confirm via native `window.confirm` before calling `DELETE /api/keys/:id`, consistent
    with this codebase's current lack of custom confirm-modal components).
  - **Audit log table**: last 50 rows from `GET /api/audit-logs`, columns: timestamp (relative,
    e.g. "2m ago"), key name, endpoint, tools used (comma list from `tool_calls`), status
    (success/blocked/error, color-coded via the existing `status-dot` classes), latency. No
    charts/graphs here — that's Spec 2's job; this table exists only to prove end-to-end that
    logging works.

## Error handling

- Invalid/missing/revoked API key → `401`, logged nowhere (no key to attribute the log row to —
  logging starts only after a key is successfully resolved).
- Tool call attempted against a disabled-for-this-key tool → handled identically to today's
  `'Blocked'` policy path in `Agent.ts` (no code change needed there — it already branches on
  `getPolicyStatus` returning `'Blocked'`), logged with `policy_decisions` reflecting the block.
- Ollama/backend errors mid-stream → existing `{ type: 'error' }` NDJSON chunk behavior preserved;
  audit log row still written with `status_code: 500` and whatever partial content/tool activity
  had occurred before the failure.
- DB write failure while logging → logged to server console via `console.error`, does **not**
  fail or roll back the API response itself (logging is best-effort observability, not a
  transactional requirement of the API call succeeding).

## Testing / verification (no test suite exists in this repo — manual, matching prior work)

1. `npm install` in `backend` (new `better-sqlite3` dependency), confirm server boots and
   `backend/data/orb.db` is created with both tables (`sqlite3 backend/data/orb.db ".tables"`).
2. Dashboard → API screen → create a key with only `web` enabled → confirm plaintext shown once,
   confirm it's masked on reload/re-list.
3. `curl -N -X POST http://localhost:3001/api/v1/chat -H "Authorization: Bearer <key>" -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"search the web for ..."}]}'` —
   confirm it streams and actually invokes web search; repeat asking it to run a bash command —
   confirm it's blocked (tool disabled for that key) instead of executing.
4. Revoke the key, repeat the curl — confirm `401`.
5. Reload the API screen — confirm the audit log table shows all of the above calls with correct
   status/latency/tools.
6. Confirm internal dashboard chat (`/api/chat`) still works exactly as before — no regression
   from the shared `Agent.run` path.
