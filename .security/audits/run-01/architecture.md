# Architecture & Attack Surface Map (Audit Run-01)

## 1. System Overview
SavazAI is a schema-driven, multi-agent orchestration engine and web console. It comprises two primary workspaces:
1. **SavazAI Backend (`src/`)**: Node.js, Express, LangGraph orchestration, Drizzle ORM, pgvector, and Python sandbox runner.
2. **SavazAI Console (`savazai-console/src/`)**: Next.js 16 App Router, React 19, Tailwind CSS, Better-Auth, and Tool Gateway.

## 2. Entrypoints & Surface Analysis
- **External Web & HTTP API Endpoints**:
  - `POST /api/orchestrator/test` - Studio test orchestration, dynamic tool execution, and LLM synthesis.
  - `POST /api/chat` & `POST /api/graph/invoke/stream` - SSE/HTTP chat streaming and LangGraph state execution.
  - `POST /api/agentflows`, `PUT /api/agentflows/:id`, `DELETE /api/agentflows/:id` - Agent workflow CRUD.
  - `GET /api/tools/registered` - Dynamic MCP and native tool capability discovery.
  - `GET /api/settings` - LLM providers configuration and API keys.
  - `GET/PUT /api/governance/compliance` - Data masking, PII tokenization, and compliance rulesets.
  - `GET /api/governance/logs` - Audit trail and telemetry logs.

## 3. Trust Boundaries
- **Client to Console API**: Next.js API route handlers protected by Better-Auth session tokens and cookies.
- **Console to Backend API**: HTTP JSON-RPC and REST requests over internal Docker network (`http://savazai-backend:3055`).
- **Engine to MCP Servers**: Remote JSON-RPC 2.0 endpoints over SSE and HTTP POST with Bearer tokens.
- **Tool Gateway to External Services**: Outbound REST calls to Google Places, Serper/Tavily, SendGrid, WABA, Nominatim, and custom webhooks.
- **Engine to Database / Sandbox**: PostgreSQL connection pool (`pg`/`postgres`) and child process runner (`python3`).

## 4. Identified Attack Vectors & Threat Models
1. **SQL Injection / Unrestricted Mutation**: Execution of mutating queries via `postgres_query_tool` when read-only access is expected.
2. **Server-Side Request Forgery (SSRF)**: Custom webhooks or tool URLs targeting cloud metadata or loopback services.
3. **Path Traversal in Python Runner**: Arbitrary script execution via relative path manipulation.
4. **Unauthenticated Governance Mutations**: Overwriting PII masking rules via unauthenticated PUT requests.
