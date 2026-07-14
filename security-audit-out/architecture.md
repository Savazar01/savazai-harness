# Architecture Review: SavazAI Harness

## 1. System Components
- **Console Frontend (Next.js)**: Runs on host port `3056` (Internal container maps to standard port). Connects to backend endpoints and DB via environment variable configurations.
- **Orchestration Backend (Express / LangGraph)**: Runs on host port `3055`. Routes incoming prompts through the LangGraph supervisor node to loaded skills and MCP servers.
- **Database (PostgreSQL 17 with pgvector)**: Runs on host port `5622`. Holds system configuration values, session states, and vector embeddings of skills.

## 2. Trust Boundaries
- **External boundaries**: The Next.js frontend console serves client requests. Calls to external LLM providers (OpenAI/Anthropic compatible) are routed from the backend.
- **Internal boundaries**: Express backend calls pg database and registered MCP servers.
- **PII masking boundary**: The `PrivacyGateway` utility sanitizes user prompt inputs prior to dispatching them to external third-party LLM providers, and rehydrates response streams using token maps.
