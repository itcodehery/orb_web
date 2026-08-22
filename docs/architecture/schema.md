# Database Schema

SQLite (`better-sqlite3`, WAL mode), file `backend/data/orb.db`. Schema created in `backend/src/db/init.ts` via `CREATE TABLE IF NOT EXISTS`. No local `users` table — Clerk is the external identity source of truth; `user_id` columns are logical (unenforced) references to Clerk user IDs.

## Entity-Relationship Diagram

![Entity-Relationship Diagram](./images/erd.png)

<details>
<summary>Mermaid source</summary>

```mermaid
erDiagram
    api_keys ||--o{ audit_logs : "generates"

    api_keys {
        INTEGER id PK
        TEXT name
        TEXT key_hash UK "SHA-256 of orb_sk_... key"
        TEXT key_last4
        TEXT tools_enabled "JSON: fs, bash, web"
        TEXT created_at
        TEXT revoked_at "nullable"
    }

    audit_logs {
        INTEGER id PK
        INTEGER api_key_id FK
        TEXT timestamp
        TEXT endpoint
        TEXT model "nullable"
        TEXT request_messages "JSON array"
        TEXT response_content
        TEXT tool_calls "JSON array"
        TEXT tool_results "JSON array"
        TEXT policy_decisions "JSON map: tool -> status"
        INTEGER latency_ms
        INTEGER tokens_in "nullable"
        INTEGER tokens_out "nullable"
        INTEGER status_code
    }

    sessions {
        INTEGER id PK
        TEXT user_id "Clerk user id (logical)"
        TEXT title "default 'New Chat'"
        TEXT messages "JSON array: Message + totalMs, firstTokenMs, riskScore"
        TEXT policies "JSON array: tool policy rules"
        TEXT settings "JSON: systemPrompt, model, chatMode, perfMode, limits, tools"
        TEXT status "active | completed"
        TEXT created_at
        TEXT updated_at
    }

    memories {
        INTEGER id PK
        TEXT user_id "Clerk user id (logical)"
        TEXT content "extracted fact"
        TEXT created_at
    }

    connectors {
        TEXT provider PK "anthropic | openai | groq | mistral | google"
        TEXT api_key "plaintext, masked on read"
        TEXT updated_at
    }
```

</details>

## Notes

- **Only one enforced foreign key** in the whole schema: `audit_logs.api_key_id → api_keys(id)`.
- `sessions.user_id` and `memories.user_id` are **logical** references to Clerk's external user ID — there is no local `users` table, so referential integrity for those is not database-enforced.
- Indexes: `idx_memories_user (user_id)`, `idx_sessions_user (user_id)`, `idx_sessions_user_status (user_id, status)`.
- `connectors` is keyed by `provider` (not an autoincrement id) — one row per known provider, upserted on save. `KNOWN_PROVIDERS` (in `connectors.repo.ts`) lists 5 entries: `anthropic`, `openai`, `groq`, `mistral` (all `chatSupported: true`), and `google` (`chatSupported: false` — key storage only, no chat integration yet).
- Several JSON columns (`messages`, `settings`, `policies`, `tools_enabled`, `request_messages`, `tool_calls`, `tool_results`, `policy_decisions`) store structured data as serialized JSON text rather than normalized rows/tables — a deliberate denormalization for a single-writer, low-concurrency local app.
