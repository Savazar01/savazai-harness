# SavazAI: Sovereign Multi-Agent Operating System & Orchestration Engine

SavazAI is a sovereign, privacy-first multi-agent orchestration framework, execution engine, and control plane. It enables enterprise teams to design, test, and deploy stateful agentflows across Frontier models (Google Gemini, OpenAI, Anthropic), Open-Source LLMs (Groq, Ollama, LM Studio), and remote Model Context Protocol (MCP) JSON-RPC 2.0 endpoints with zero domain hardcoding, zero data leakage, and total human-in-the-loop governance.

---

## 🏗️ Architecture Overview

SavazAI strictly separates orchestration execution, control plane UI, and state persistence across physical service boundaries:

```
                               ┌────────────────────────────────────────────────────────┐
                               │               SavazAI Console UI (Next.js 16)         │
                               │               Port 3056 (http://localhost:3056)        │
                               └───────────────────────────┬────────────────────────────┘
                                                           │
                                                           │ Internal HTTP / JSON-RPC 2.0
                                                           ▼
                               ┌────────────────────────────────────────────────────────┐
                               │           SavazAI Backend Orchestrator (Node.js)       │
                               │           Port 3055 (http://savazai-backend:3055)      │
                               └─────────────┬────────────────────────────┬─────────────┘
                                             │                            │
                     PostgreSQL Protocol     │                            │ JSON-RPC 2.0 / stdio
                     Port 5432 (Host 5622)   │                            │
                                             ▼                            ▼
                      ┌──────────────────────────────┐          ┌──────────────────────────────┐
                      │    PostgreSQL 17 + pgvector  │          │   Connected MCP Servers      │
                      │    (Vector Embeddings 1536)  │          │   (SAP, JIRA, CRMs, Custom)  │
                      └──────────────────────────────┘          └──────────────────────────────┘
                                                                          │
                                                                          ▼
                                                                ┌──────────────────────────────┐
                                                                │ Python Sub-Runner (.venv)    │
                                                                │ (python-runner.ts Sandboxes) │
                                                                └──────────────────────────────┘
```

### Core Monorepo Physical Boundaries

* **Frontend Console (`./savazai-console`)**:
  * Built with **Next.js 16 App Router**, **React 19**, **Better-Auth**, **Tailwind CSS v4**, and **Shadcn UI**.
  * Runs on container/host port **`3056`**.
  * Provides the unified workspace: Agent Workspace (`/dashboard`), Capability Studio (`/studio`), Business Center (`/business`), In-App Documentation (`/docs`), Command Center (`/admin/settings`), and User Admin (`/admin/users`).

* **Backend Engine (`./`)**:
  * Built with **Node.js**, **LangGraph (`@langchain/langgraph`)**, **Drizzle ORM**, and **pgvector**.
  * Runs on container/host port **`3055`**.
  * Handles dynamic tool discovery (`/api/tools/registered`), LangGraph compilation, PII masking gateways, telemetry cost accounting, and sandboxed Python runner invocations.

* **Vector Database (`savazai-db`)**:
  * Official **PostgreSQL 17** with `pgvector` extension enabled (`pgvector/pgvector:pg17`).
  * Runs on container internal port **`5432`** and host port **`5622`**.

---

## 🔐 Complete Environment Variable Reference

When configuring SavazAI for production (e.g. via Coolify or custom Docker VPS) or local development, use the following non-sensitive dummy template:

```env
# ==============================================================================
# DATABASE STORAGE (PostgreSQL 17 + pgvector)
# ==============================================================================
DB_USER=sz_admin
DB_PASSWORD=your_secure_db_password
DB_NAME=savazai_harness
DATABASE_URL=postgresql://sz_admin:your_secure_db_password@savazai-db:5432/savazai_harness

# ==============================================================================
# AUTHENTICATION & PRODUCTION ADMIN BOOTSTRAPPING (First Run Only)
# ==============================================================================
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your_initial_admin_password
ADMIN_NAME="Platform Administrator"
BETTER_AUTH_SECRET=your_random_32_character_secret_here
BETTER_AUTH_URL=https://your-domain.com

# ==============================================================================
# CORE BACKEND & ORCHESTRATOR API
# ==============================================================================
NEXT_PUBLIC_HARNESS_API_URL=http://savazai-backend:3055
MASTER_VAULT_SECRET=your_master_vault_encryption_key_here
NODE_ENV=production
```

### Environment Variable Glossary

| Variable | Scope | Purpose | Description |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | Global | DB Connection | Fully qualified PostgreSQL connection string targeting `savazai-db:5432`. |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | Database | Postgres Auth | Credentials used by `pgvector/pgvector:pg17` image. |
| `ADMIN_EMAIL` | Backend/Auth | Bootstrap Admin | Default root administrator email for initial zero-trust bootstrap. |
| `ADMIN_PASSWORD` | Backend/Auth | Bootstrap Admin | Default initial password for the admin account (min 6 characters). |
| `ADMIN_NAME` | Backend/Auth | Bootstrap Admin | Display name for the initial platform administrator. |
| `BETTER_AUTH_SECRET` | Console | Session Security | Cryptographic secret used by Better-Auth to sign cookies and JWT tokens. |
| `BETTER_AUTH_URL` | Console | Auth Domain | Public canonical URL of the SavazAI console (e.g. `https://console.example.com`). |
| `NEXT_PUBLIC_HARNESS_API_URL` | Console | API Routing | Internal DNS or public URL for backend orchestrator API (`http://savazai-backend:3055`). |
| `MASTER_VAULT_SECRET` | Backend/Console | Secret Encryption | 32+ char key used to encrypt LLM API keys and OAuth secrets with AES-256-GCM. |
| `NODE_ENV` | Global | Runtime Mode | `production` enables strict auth, disables self-promotion, and enforces lockouts. |

---

## 🚀 Deployment Walkthroughs

### Option A: Coolify Multi-Container VPS Deployment

SavazAI is built to deploy out-of-the-box on [Coolify](https://coolify.io) or any Docker Compose VPS manager.

1. **Create New Project in Coolify**:
   * Add a new Resource $\rightarrow$ **Docker Compose**.
   * Connect your private Git repository.

2. **Paste Environment Variables**:
   * Populate the environment variables listed in the reference table above.
   * Set `BETTER_AUTH_URL` to your assigned Coolify FQDN domain (e.g. `https://your-domain.com`).
   * Set `MASTER_VAULT_SECRET` to a generated 32-character string (`openssl rand -base64 32`).

3. **Verify Container Healthcheck Startup Windows**:
   * The `docker-compose.yml` specifies startup grace periods (`start_period: 30s`) to ensure PostgreSQL initializes its pgvector extension before the backend migrations run:
     ```yaml
     healthcheck:
       test: ["CMD-SHELL", "pg_isready -U $${DB_USER} -d $${DB_NAME}"]
       interval: 5s
       timeout: 5s
       retries: 5
     ```

4. **Deploy & First Login**:
   * Trigger **Deploy** in Coolify.
   * Navigate to `https://your-domain.com/signin`.
   * Log in with your `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

---

### Option B: Localhost Developer Setup

```bash
# 1. Clone the repository
git clone https://github.com/Savazar01/savazai-harness.git
cd savazai-harness

# 2. Configure Local Environment
cp .env.example .env

# 3. Launch Docker Stack
docker compose up --build -d

# 4. Inspect Container Status
docker compose ps

# 5. Access In-Browser
# Console UI:        http://localhost:3056
# Backend Engine:    http://localhost:3055
# Database Host:     localhost:5622
```

#### Local First-User Auto-Promotion & Test Seeding
* In local development (`NODE_ENV=development`), the first user to register via `/signup` is automatically granted the `admin` role if no administrator exists.
* To run test database seeds locally:
  ```bash
  npm run db:seed
  ```

---

## 🧭 Canonical Workspace Architecture

| Workspace Module | Route | Access Level | Description |
| :--- | :--- | :--- | :--- |
| **Agent Workspace** | `/dashboard` | Admin & User | Multi-turn streaming chat playground, session history, orchestrator execution timeline, context inspection, and live telemetry. |
| **Capability Studio** | `/studio` | Admin & User | Drag-and-drop Agentflow visual canvas builder, skills catalog, tool JSON schema editor, and sandboxed Python sub-runners (`python-runner.ts`). |
| **Business Center** | `/business` | Admin & User | Organizational Knowledge Framework (OKF) concepts, document ingestion (MD, PDF, TXT, JSON), pgvector embeddings, and compliance masking logs. |
| **Documentation Hub** | `/docs` | Admin & User | Comprehensive 7-chapter in-app documentation center with real-time keyword search, code snippet copying, and parameter reference tables. |
| **Command Center** | `/admin/settings` | Admin & User | AES-256-GCM encrypted LLM provider vault, dynamic model discovery (Gemini v1beta, OpenAI, Anthropic, Groq), appearance & typography controls (14px–20px sizing). |
| **User Admin** | `/admin/users` | **Admin Only** | Enterprise RBAC user provisioning, role promotions, secure password resets, cascading deletions, and self-demotion anti-lockout safeguards. |

---

## 🛡️ Security, Privacy & Integrity Invariants

1. **Zero Domain Hardcoding**: The backend engine remains 100% graph-agnostic and schema-driven. All target entity mappings and MCP schemas are discovered at runtime.
2. **AES-256-GCM Master Vault**: All provider API keys and OAuth tokens are encrypted at rest using AES-256-GCM derived via HKDF-SHA256 from `MASTER_VAULT_SECRET`.
3. **Data Masking Gateway**: Incoming payloads are sanitized against configurable PII/SPI regex rules before being sent to external LLMs; original entities rehydrate only within authenticated database boundaries.
4. **Sandboxed Python Execution**: Python sub-runners (`python-runner.ts`) execute strictly inside isolated virtual environments (`/opt/venv` or `.venv`) with bounded stdin/stdout JSON envelopes.
5. **Anti-Lockout Safeguards**: Active administrators cannot demote their own role or delete their own active account, preventing accidental platform lockouts.

---

## 🛠️ Complete Verification & Quality Loop

```bash
# Backend Verification (Root Workspace)
npx tsc --noEmit
npm run lint

# Frontend Console Verification (./savazai-console)
cd savazai-console
npm run lint
npm run build
cd ..

# Knowledge Graph Synchronization
graphify update .

# Database Migration Management
npm run db:generate
npm run db:migrate
```

---

## 📐 Capability Studio Resilience & Universal MCP Integration

* **Schema-Driven Resilience**: Capability Studio validates agentflow canvas topologies using permissive, extensible Zod schemas (`src/core/schemas.ts` and `savazai-console/src/lib/validations/canvas.ts`). Tool categories are not limited to fixed enums—`custom`, `open`, `native`, `mcp`, `database`, `social_media`, and external provider categories are fully supported.
* **Agent Team Architecture**: Visual container nodes (`roleTemplate: "team"`) do not require LLM configurations, and missing `modelConfig` attributes automatically resolve to safe platform defaults (`openai:gpt-4o-mini`).
* **Universal MCP Aggregation**: The console features a multi-transport aggregator (`McpAggregator`) supporting SSE, streamable HTTP/JSON-RPC, and stdio across heterogeneous MCP servers (e.g., WedPlanAI, NSE India Bhavcopy, CM Market). Tools are discovered dynamically at runtime via `GET /api/mcp` and `GET /api/tools/registered`.
* **Selective Workspace Exposure (`workspaceEnabled`)**: Each configured MCP server in Command Center can be toggled between "Workspace Chat Enabled" and "Studio Only". Internal studio-only servers (such as `wedplanai-prod`) are shielded from direct end-user chat, while exposed servers (such as `nse-bhavcopy` and `cm-market`) appear in the Agent Workspace dropdown for opt-in tool invocation.
* **Resilient Agentflow Routing & Unified Pipeline**: Agent Workspace and Capability Studio share the unified LangGraph execution pipeline (`/api/orchestrator/test/route.ts`). Direct MCP chat executes without database lookups, while Published Agentflow mode binds strictly to validated flow UUIDs with live MCP execution.
* **Automated Technical Context Resolution**: End users are never required to provide technical primary keys or UUIDs (e.g. `weddingId`, `tenantId`, `workspaceId`). The engine automatically resolves root context via assigned single-object and array getter tools (`get_<entity>`) behind the scenes before executing mutating actions, and shields technical foreign IDs from user-facing HITL parameter forms.
* **Unified Plan-First HITL Approval Card**: When running in Plan-First mode within Agent Workspace (`/dashboard`), execution pauses at the HITL boundary and renders an interactive approval card with full plan step details, implementation summary, parameters pre-populated from clarification prompts, and 4 action buttons (`Approve & Execute Plan`, `Submit Details & Execute`, `Adjust & Re-Plan`, `Reject & Re-Plan`). Resuming dispatches back to the unified orchestrator engine and live-streams results without freezing.
* **Strict Decoupling of Direct MCP Chat and Published Agentflows**: Agent Workspace strictly separates direct tool execution from multi-agent workflow compilation. Direct MCP mode runs pure, low-latency LLM tool calling scoped exclusively to selected servers without supervisor nodes, plan interrupts, or cross-domain leaks. Published Agentflows mode executes the full LangGraph topology with supervisor coordination, specialist teams, and Human-in-the-Loop plan approvals.

---

## 📋 DevPlans Contribution Framework

All features, bugfixes, and refactors must strictly maintain active tracking artifacts under `/devplans`:
* `/devplans/PROMPT_<TASK>.md`: Incoming user specifications, error traces, and targets.
* `/devplans/PLAN_<TASK>.md`: Technical design, affected modules, schema definitions, and verification strategy.
* `/devplans/WALKTHROUGH_<TASK>.md`: Executed changes, test results, and validation proofs.
* **Graphify Rule**: Run `graphify update .` upon completion of each task to maintain code graph freshness.

---

## 📄 License & Commercial Support
 
SavazAI is licensed under the [Fair-Code Sustainable Use License](LICENSE).  
Copyright &copy; 2026 Savazar. All rights reserved. Free for internal business and development use. Commercial multi-tenant SaaS resale requires prior written authorization.  
For enterprise deployments, custom MCP connectors, or SLA support, visit [savazar.com](https://savazar.com).
