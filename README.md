# SavazAI: Enterprise Multi-Agent Operating System & Control Plane

An elite, application-agnostic agentic orchestration engine driven by stateful LangGraph loops, deterministic data privacy gateways, dynamic MCP client registries, and a persistent cryptographic credential vault.

---

## 🛠️ System Architecture & Ports

The project enforces a strict physical separation of concerns:
- **Root Directory (`./`)**: The SavazAI Engine Backend (Node.js, Express, LangGraph, Drizzle ORM, pgvector) listening on primary host port **`3055`** (Internal Docker DNS: `http://savazai-backend:3055`).
- **Console Frontend Workspace (`./savazai-console`)**: The SavazAI Console User Interface (Next.js App Router, Better-Auth, Tailwind CSS, Shadcn UI) listening on primary host port **`3056`**.
- **Database (pgvector)**: Runs PostgreSQL 17 with vector search capabilities on host port **`5622`** (internal container port `5432`).

---

## 📦 Dynamic Tech Stack Profile

Based on our active codebase audit, the architecture compiles under the following stack parameters:

### Core Engine (Backend)
- **State Orchestration**: `@langchain/langgraph` `v0.2.0` (with `@langchain/langgraph-checkpoint-postgres` `v0.0.1` for persistent graph thread checkpoints)
- **Database Access & Schemas**: `drizzle-orm` `v0.45.2` (utilizing `drizzle-kit` `v0.30.0` for migration structures)
- **API Server & Routing**: `express` `v4.21.0` (with `postgres` `v3.4.5` client bindings)
- **Compilation & Linting**: `typescript` `v5.7.0` (governed by `eslint` `v10.6.0` & `typescript-eslint` `v8.63.0`)

### Control Plane (Frontend Console)
- **Application Framework**: `next` `v16.2.10` (featuring Turbopack build pipelines)
- **Rendering Library**: `react` `v19.2.4` and `react-dom` `v19.2.4`
- **Identity & Authentication**: `better-auth` `v1.6.23`
- **Utility CSS Engine**: `tailwindcss` `v4.0.0` (compiled with `@tailwindcss/postcss` `v4.0.0`)

---

## 🔐 Configuration & Security Schema

### The Cryptographic Vault (`MASTER_VAULT_SECRET`)
To protect PII and external access tokens, the platform embeds a zero-trust cryptographic layer. The `MASTER_VAULT_SECRET` is a **mandatory** environment variable.
- **Algorithm**: `aes-256-cbc` symmetric block cipher encryption.
- **Function**: Automatically encrypts sensitive API credentials and OAuth payload keys (such as `gmailClientId`, `gmailClientSecret`, and `gmailRefreshToken`) within the `system_configurations` database entity before writing them to disk.
- **Hydration**: Dynamically decrypts secret keys only within runtime memory structures during session loops (e.g., token rotation workers or email dispatcher triggers).

### Environment Configuration Files

Ensure the following local variables are configured before spinning up the environment:

#### Engine Backend (`./.env`)
```ini
DATABASE_URL=postgresql://sz_harness_admin:sz_secure_vault_pass_99@localhost:5622/savazai_harness
POSTGRES_USER=sz_harness_admin
POSTGRES_PASSWORD=sz_secure_vault_pass_99
POSTGRES_DB=savazai_harness
MASTER_VAULT_SECRET=change_this_to_a_random_32_character_secret
LLM_PROVIDER_TYPE=openai-compatible
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL_NAME=gpt-4o-mini
LLM_API_KEY=your_llm_provider_key
```

#### Console Frontend (`./savazai-console/.env`)
```ini
NEXT_PUBLIC_HARNESS_API_URL=http://savazai-backend:3055
NEXT_PUBLIC_APP_URL=http://localhost:3056
DATABASE_URL=postgresql://sz_harness_admin:sz_secure_vault_pass_99@localhost:5622/savazai_harness
BETTER_AUTH_SECRET=generate_a_secure_better_auth_secret_key
BETTER_AUTH_URL=http://localhost:3056
```

---

## 🚀 Installation & Local-First Startup

The application stack utilizes standard, optimized production multi-stage **Dockerfiles** rather than Nixpacks blueprints to compile, cache, and launch services.

### 1. Pre-requisites & Local Installation
Clone the workspace and restore development modules:
```bash
# Clean dependency installation
npm install
cd savazai-console && npm install && cd ..
```

### 2. Database Migrations
Apply schemas to the target database instance:
```bash
# Generate and run ORM migrations
npm run db:generate
npm run db:migrate
```

### 3. Running Container Orchestration
Spin up the database container, backend runtime, and frontend server locally:
```bash
# Spin up Docker containers
docker compose up --build -d

# Verify container status and health checks
docker compose ps
```

### 4. Verification Checkpoints
To confirm the integrity of the build before deploying:
```bash
# Run backend checks
npx tsc --noEmit
npm run lint

# Run frontend checks
cd savazai-console
npm run lint
npm run build
```

---

## ⚡ Key Core Features Deployed

1. **Proactive MCP Schema Ingestion on Session Boot**: Pre-loads tool schemas (e.g. `wedplanai-prod`) directly from the configs on boot, ensuring the LLM planner has complete capability awareness.
2. **Conversational Short-Circuit Interceptors**: Discards pre-execution conversational text nodes if mutation commands are detected, automatically resolving parameters and invoking the correct database mutations first.
3. **Crucial Post-Mutation Sequential Loops**: Restructures LangGraph flows to enforce post-mutation read loops (`[Update Entity] -> [Gather Entities] -> [Synthesize Response]`), preventing stale UI states.
4. **ISO Date Standardization**: Clears day-ordinal formatting and maps field parameters to target specifications prior to tool dispatches.
5. **Stream Token Sanitizer**: Strips trailing braces and structural JSON artifacts out of NDJSON response buffers in real time.
6. **MIME & OAuth Credentials Daemon**: Ambiently rotates OAuth credentials, encrypts them at rest, and formats outbound notifications as standard MIME-encoded formats.
