# Data Flow Diagrams

## Context Diagram (Level 0)

External entities, the system as a single process, and the data store it owns.

![Context Diagram](./images/context-dfd.png)

<details>
<summary>Mermaid source</summary>

```mermaid
flowchart LR
    User(["User<br/>(browser)"])
    Clerk[["Clerk<br/>(identity provider)"]]
    Ollama[["Local Ollama<br/>(localhost:11434)"]]
    CloudLLM[["Cloud LLM Providers<br/>Anthropic / OpenAI / Groq / Mistral"]]
    Tavily[["Tavily<br/>(web search API)"]]
    ThirdParty(["Third-party client<br/>(programmatic)"])

    subgraph ORB["Orb System"]
        direction TB
        P0(("0.0<br/>Orb Platform"))
    end

    DB[(SQLite<br/>orb.db)]

    User <-->|chat, session, key, memory, connector requests / streamed responses| P0
    ThirdParty <-->|Bearer-token chat & model requests / NDJSON stream| P0
    P0 <-->|session cookie verification| Clerk
    P0 <-->|chat completions, tool calls| Ollama
    P0 <-->|chat completions| CloudLLM
    P0 -->|search queries| Tavily
    P0 <-->|read/write sessions, memories, connectors, api_keys, audit_logs| DB
```

</details>

## Level 1 — Process Decomposition

Breaks the single Orb process into its major functional processes and the data stores each one touches.

![Level 1 DFD](./images/level1-dfd.png)

<details>
<summary>Mermaid source</summary>

```mermaid
flowchart TB
    User(["User<br/>(browser, Clerk session)"])
    ThirdParty(["Third-party client<br/>(orb_sk_... API key)"])
    Clerk[["Clerk"]]
    Ollama[["Local Ollama"]]
    CloudLLM[["Cloud Providers"]]
    Tavily[["Tavily Web Search"]]

    P1("1.0 Authenticate<br/>(requireAuth / apiKeyAuth)")
    P2("2.0 Manage Sessions<br/>(sessions.route)")
    P3("3.0 Run Agent Loop<br/>(chat.route + Agent.ts)")
    P4("4.0 Execute Tools<br/>(ToolExecutor + registry)")
    P5("5.0 Resolve Connector Keys<br/>(connectors.repo)")
    P6("6.0 Extract Memory & Risk Score<br/>(postChatAnalysis.ts, async)")
    P7("7.0 Manage API Keys & Audit<br/>(keys.route, auditLog.repo)")
    P8("8.0 Manage Connectors<br/>(connectors.route)")
    P9("9.0 Manage Memories<br/>(memories.route)")

    DSsessions[(sessions)]
    DSmemories[(memories)]
    DSconnectors[(connectors)]
    DSapikeys[(api_keys)]
    DSaudit[(audit_logs)]

    User --> P1
    ThirdParty --> P1
    P1 -->|Clerk cookie| Clerk
    P1 -->|hashed key lookup| DSapikeys

    User --> P2
    P2 <--> DSsessions

    User --> P3
    ThirdParty --> P3
    P3 <-->|load/save messages| DSsessions
    P3 -->|read facts, inject into system prompt| DSmemories
    P3 -->|resolve provider key| P5
    P3 -->|local model calls| Ollama
    P3 -->|cloud model calls| CloudLLM
    P3 -->|dispatch allowed tool calls| P4
    P3 -->|fire-and-forget after reply| P6
    P3 -->|"log every call (v1 only)"| P7

    P4 -->|fs / bash / write / list| P4
    P4 -->|web_search| Tavily

    P5 <--> DSconnectors

    P6 -->|new facts| DSmemories
    P6 -->|patch riskScore| DSsessions

    P7 <--> DSapikeys
    P7 --> DSaudit
    User --> P7

    User --> P8
    P8 <--> DSconnectors

    User --> P9
    P9 <--> DSmemories
```

</details>

### Process notes

| # | Process | Trigger | Reads | Writes |
|---|---|---|---|---|
| 1.0 | Authenticate | every request | Clerk session cookie, or `api_keys.key_hash` | — |
| 2.0 | Manage Sessions | session screen actions | `sessions` | `sessions` |
| 3.0 | Run Agent Loop | `POST /api/chat`, `POST /api/v1/chat` | `sessions`, `memories`, connector keys | `sessions.messages` |
| 4.0 | Execute Tools | tool call in agent loop, policy = Allowed | local fs/shell, Tavily API | local fs (write_file) |
| 5.0 | Resolve Connector Keys | any cloud LLM instantiation | `connectors` table, then `process.env` fallback | — |
| 6.0 | Extract Memory & Risk Score | async, after each chat reply | chat exchange (in memory) | `memories`, `sessions.messages[i].riskScore` |
| 7.0 | Manage API Keys & Audit | key CRUD, every `/api/v1/chat` call, analytics view | `api_keys`, `audit_logs` | `api_keys`, `audit_logs` |
| 8.0 | Manage Connectors | Connectors screen | `connectors` | `connectors` |
| 9.0 | Manage Memories | Memory screen | `memories` | `memories` |
