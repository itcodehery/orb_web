# Sequence Diagrams

## 1. Interactive chat (frontend, Clerk session cookie)

![Interactive chat sequence](./images/seq-interactive-chat.png)

<details>
<summary>Mermaid source</summary>

```mermaid
sequenceDiagram
    actor U as User (browser)
    participant FE as Frontend (AppScreen)
    participant MW as requireAuth
    participant API as chat.route
    participant DB as SQLite (sessions, memories)
    participant AG as Agent loop
    participant CF as llm/factory
    participant LLM as Ollama / Cloud provider
    participant TE as ToolExecutor
    participant PA as postChatAnalysis (async)

    U->>FE: type message, hit send
    FE->>API: POST /api/chat (credentials: include)
    API->>MW: verify Clerk session cookie
    MW-->>API: authenticated (userId)
    API->>DB: load/create active session
    API->>DB: read memory facts for user
    API->>API: build system prompt (facts + TOOL_USE_DIRECTIVE)
    API->>CF: createLLM(model, perfMode, limit)
    CF->>DB: getConnectorKey(provider) [cloud models only]
    CF-->>API: LLM instance
    API->>AG: run(messages, llm, policyResolver)

    loop until final text reply
        AG->>LLM: chatStream()
        LLM-->>AG: NDJSON chunks (content / tool_call)
        AG-->>FE: stream content_chunk
        opt tool call requested
            AG->>AG: getPolicyStatus (Auto/Policy/Manual)
            alt Allowed
                AG->>TE: execute(tool, args)
                TE-->>AG: tool_result
                AG-->>FE: stream tool_call_intent + tool_result
            else Requires Approval
                AG-->>FE: stream requires_approval (loop pauses)
            end
        end
    end

    AG-->>FE: stream done
    API->>DB: upsertActiveMessages (persist reply + totalMs)
    API-->>PA: analyzeChat(exchange) [fire-and-forget]
    PA->>LLM: Ollama call (think:false, num_predict:-1)
    LLM-->>PA: {newFacts, hallucinationRisk}
    PA->>DB: createMemory(newFacts)
    PA->>DB: patchMessageRiskScore
    FE->>API: (later) refresh active session
    API-->>FE: updated riskScore
```

</details>

## 2. Programmatic chat (`/api/v1/chat`, Bearer API key)

![API-key chat sequence](./images/seq-api-chat.png)

<details>
<summary>Mermaid source</summary>

```mermaid
sequenceDiagram
    actor C as Third-party client
    participant MW as apiKeyAuth
    participant DB as SQLite (api_keys, audit_logs)
    participant API as v1/chat.route
    participant AG as Agent loop
    participant LLM as Ollama / Cloud provider
    participant TE as ToolExecutor

    C->>MW: POST /api/v1/chat (Authorization: Bearer orb_sk_...)
    MW->>DB: hash token, look up api_keys.key_hash
    DB-->>MW: key row (tools_enabled, revoked_at)
    MW-->>API: req.apiKey attached
    API->>API: build allowed tool list from tools_enabled
    API->>AG: run(messages, llm, policyResolver)
    AG->>LLM: chatStream()
    LLM-->>AG: NDJSON chunks
    opt tool call within allowed set
        AG->>TE: execute(tool, args)
        TE-->>AG: tool_result
    end
    AG-->>C: stream NDJSON (content/tool_call/tool_result/done)
    API->>DB: insertLog(audit_logs) — messages, tool calls/results,
    Note right of DB: policy_decisions, latency_ms, tokens, status_code
```

</details>

## 3. Connector API-key resolution (cross-cutting)

![Connector key resolution sequence](./images/seq-connector-resolution.png)

<details>
<summary>Mermaid source</summary>

```mermaid
sequenceDiagram
    participant F as llm/factory.createLLM
    participant R as connectors.repo.getConnectorKey
    participant DB as SQLite (connectors)
    participant ENV as process.env

    F->>R: getConnectorKey(provider)
    R->>DB: SELECT api_key FROM connectors WHERE provider = ?
    alt row exists
        DB-->>R: api_key
        R-->>F: DB-stored key (source: "database")
    else no row
        R->>ENV: read <PROVIDER>_API_KEY
        ENV-->>R: env value or undefined
        R-->>F: env key (source: "environment") or none
    end
```

</details>
