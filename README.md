# SavazAI Multi-Agent Operating System & Control Plane

An enterprise-grade, application-agnostic agentic orchestration engine driven by stateful LangGraph loops, deterministic data privacy gateways, and real-time streaming NDJSON infrastructure.

## 🛠️ Project Architecture

We operate under a strict separation of concerns at the folder level:
- **Root Directory (`./`)**: The SavazAI Engine Backend (Node.js, Express, LangGraph, Drizzle ORM, pgvector) listening on host port `3055` (Internal container DNS: `http://savazai-backend:3055`).
- **Sub-Folder Workspace (`./savazai-console`)**: The SavazAI Console Frontend (Next.js 16.2 App Router, React 19.2+, Better-Auth, Tailwind CSS, Shadcn UI) listening on host port `3056`.
- **Database (pgvector)**: Host Port `5622` / Internal Container Port `5432`.

---

## ⚡ Key Core Features Deployed

### 1. Proactive MCP Schema Ingestion on Session Boot
- **Automatic Integration Ingestion**: On session initialization, the backend pre-loads all registered MCP servers (e.g., `wedplanai-prod`) directly from the system configurations database table into the graph's `activeTools` payload. This guarantees the supervisor planner has complete tool awareness on the **very first turn** without requiring prompt hints.
- **Dynamic Tool Schema Injections**: The presentation layer (`respondNode`) dynamically ingests tool registry arrays to maintain full active capability awareness.

### 2. Conversational Short-Circuit Interceptors
- **Intent Safeguard**: If the planner LLM returns a conversational text block (`routingDecision: "respond"`) on a turn requesting mutations (like `update`, `create`, or `delete`) before the matching tool has run, the supervisor node intercepts it.
- **Deterministic Tool Mapping**: Discards the short-circuit response, maps the user intent to the correct mutation tool (e.g., `update_wedding`), parses arguments (e.g., dates) directly from the prompt using regex, and executes the mutation.

### 3. Crucial Post-Mutation Sequential Loops
- **Data Flow Guarantee**: Ensures that after any mutation is executed (like `update_wedding` or `create_task`), the graph loops back and forces data gathering tools (like `get_wedding` or `list_tasks`) to run *before* generating a response.
- **Flow**: `[Update Entity] -> [Gather Entities] -> [Synthesize Response]`.

### 4. ISO Date Standardization
- **Validation Guard**: Cleans ordinal day suffixes (like `st`, `nd`, `rd`, `th`) from input date parameters to prevent JavaScript `Date` parser failures, standardizing strings to ISO compliance before dispatching to the MCP client.
- **Field Key Mapping**: Re-keys incoming `date` argument parameters to `weddingDate` to match the exact schema expected by wedding mutation tools, preventing `"No valid fields provided for update"` errors.

### 5. Stream Token Bracket Purging
- **NDJSON Stream Sanitization**: A regex tokenizer sanitizer in the SSE event loop strips out trailing braces (`}`, `}}`) or leaking JSON routing symbols from streaming chunks, delivering a clean text stream to the UI.

### 6. Premium Markdown Layouts (Tables, Lists, & Images)
- **GFM Render Engines**: Employs `react-markdown` and `remark-gfm` in the console UI.
- **Layout Styling**: Maps pipe tables to clean, styled HTML tables with padding and borders, lists to `list-outside pl-5` alignments, and media wrappers (`![Visual Asset](url)`) to responsive `<img>` cards.

### 7. Background Dynamic Communication Subsystem & Persistent Cryptographic Vault
- **Dynamic Worker Node**: Registers a background `CommunicationAgent` node in the LangGraph loop, enabling it to asynchronously dispatch summaries and notifications.
- **Loop Termination Guard**: Clears enqueued communication envelopes immediately after dispatch, preventing infinite dispatch loops.
- **Ambient Token Rotation**: Automatically intercepts API calls, verifies credentials, and rotates expired OAuth access tokens, persisting fresh tokens back to the database.
- **Cryptographic Encryption-at-Rest**: Encrypts sensitive OAuth credentials (`gmailClientId`, `gmailClientSecret`, `gmailRefreshToken`) in `system_configurations` using AES-256-CBC and `process.env.MASTER_VAULT_SECRET`. Decrypts them transparently on database load (frontend) and prior to API dispatches (backend).
- **MIME Subject & HTML Body Refactor**: Compiles text summaries into beautiful, responsive HTML email layouts and encodes subjects using MIME encoded-words (`=?utf-8?B?...?=`) to preserve Unicode characters and formatting.
- **Static Token Paste Paradigm**: Deprecates Authorized Redirect URIs in the settings layout in favor of a secure, direct REFRESH_TOKEN entry box.

---

## 🔐 Production Environment Variables Guide

### Backend (`.env` / Coolify Environment Variables)
- `DATABASE_URL=postgresql://sz_harness_admin:<password>@savazai-db:5432/savazai_harness`
- `PORT=3055`
- `LLM_MODEL_NAME=gpt-4o-mini`

### Frontend (`savazai-console/.env.local` / Coolify Build Secrets)
- `NEXT_PUBLIC_APP_URL=http://localhost:3056`
- `NEXT_PUBLIC_HARNESS_API_URL=http://savazai-backend:3055` (Adjusted to internal compose DNS or public domain)
- `BETTER_AUTH_SECRET=<generate_secure_random_key>`
- `BETTER_AUTH_URL=http://localhost:3056`

---

## 🚀 VPS Docker Deployment Validation

Ensure all code changes pass compile validations before pushing:
```bash
# Backend Quality Test
npx tsc --noEmit
npm run lint

# Frontend Console Quality Test
cd savazai-console
npm run lint
next build --experimental-turbopack
```

### Docker Run Commands
```bash
# Spin up stack locally/production
docker compose up --build -d

# Stop stack safely
docker compose down
```
