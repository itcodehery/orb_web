# API Route Inventory

Base URL: `http://localhost:3001`. Two auth models:

- **Cookie session** (`requireAuth`, Clerk) — all `/api/*` routes except `/api/models` and `/api/system-info`.
- **API key** (`apiKeyAuth`, `Authorization: Bearer orb_sk_...`) — all `/api/v1/*` routes.

## Chat / Agent

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/chat` | cookie | Streams NDJSON agent run; persists to active session; triggers async memory/risk analysis |
| POST | `/api/execute_tool` | cookie | Executes a single tool call directly (resume after manual approval) |
| POST | `/api/v1/chat` | API key | Same agent loop, tool access gated by key's `tools_enabled`; every call logged to `audit_logs` |

## Models

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/models` | none | Proxies local Ollama `GET /api/tags` |
| GET | `/api/v1/models` | API key | Same, for external API consumers |

## System

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/system-info` | none | CPU/RAM detection; recommends `low`/`high` performance mode |

## Sessions

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/sessions/active` | cookie | Get current active session |
| PATCH | `/api/sessions/active` | cookie | Patch policies/settings of active session |
| POST | `/api/sessions/active/complete` | cookie | Mark active session completed ("New Chat") |
| GET | `/api/sessions` | cookie | List sessions (with computed avg latency/risk) |
| GET | `/api/sessions/:id` | cookie | Get one session |
| POST | `/api/sessions/:id/resume` | cookie | Reactivate a completed session as active |

## Memory

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/memories` | cookie | List extracted facts for current user |
| DELETE | `/api/memories/:id` | cookie | Delete a fact |

## API Keys, Audit & Analytics

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/keys` | cookie | Create a new `orb_sk_...` key with `{fs, bash, web}` tool flags |
| GET | `/api/keys` | cookie | List keys (masked) |
| DELETE | `/api/keys/:id` | cookie | Revoke a key |
| PATCH | `/api/keys/:id/tools` | cookie | Update a key's enabled tools |
| GET | `/api/audit-logs?limit=` | cookie | Recent audit log rows (joined with key name) |
| GET | `/api/analytics/summary?hours=` | cookie | Volume, blocked/error counts, latency, hourly buckets, top tools, anomalies |

## Connectors (provider API keys)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/connectors` | cookie | List all 5 known providers with `configured`/`source` (database/environment/none)/masked key |
| POST | `/api/connectors` | cookie | Save/overwrite a provider's API key (`{provider, apiKey}`) |
| DELETE | `/api/connectors/:provider` | cookie | Remove a stored key (reverts to env fallback if set) |
