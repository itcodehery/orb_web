# Orb — Architecture Documentation

Diagrams for academic/CIA-2 documentation purposes. Each diagram is a PNG in [`images/`](./images/) (drop straight into slides/reports); the Mermaid source is kept in a collapsible section under each image for future edits.

- [`dfd.md`](./dfd.md) — Data Flow Diagrams (Context / Level 0 and Level 1)
- [`schema.md`](./schema.md) — Database schema / ER diagram
- [`sequence-flows.md`](./sequence-flows.md) — Sequence diagrams for the two chat request paths and connector key resolution
- [`api-reference.md`](./api-reference.md) — Full REST API route inventory, grouped by resource

## System summary

Orb is a governance console for local and cloud LLMs. A Next.js frontend talks to an Express/TypeScript backend, which routes chat requests to either a local Ollama model or a cloud provider (Anthropic, OpenAI, Groq, Mistral), enforces per-tool execution policy (Auto / Policy / Manual approval), persists sessions/audit logs/extracted memory facts to SQLite, and exposes both a cookie-authenticated interactive API (Clerk sessions) and a Bearer-token programmatic API (`/api/v1/*`) with full request/response audit logging.
