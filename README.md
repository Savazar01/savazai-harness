# SavazAI: Sovereign Multi-Agent Operating System & Orchestration Engine

SavazAI is a sovereign, privacy-first multi-agent orchestration framework and control plane. It enables enterprise teams to build, test, and deploy stateful agentflows across Frontier models (Google Gemini, OpenAI), Open-Source LLMs, and local gateway endpoints with zero data leakage and human-in-the-loop governance.

---

## 🏗️ Architecture Overview

SavazAI strictly separates execution concerns across physical monorepo boundaries:

```
                          ┌──────────────────────────────────────────┐
                          │   SavazAI Console UI (Next.js 16 App)    │
                          │   Port 3056 (http://localhost:3056)      │
                          └────────────────────┬─────────────────────┘
                                               │ JSON-RPC 2.0 / REST
                                               ▼
                          ┌──────────────────────────────────────────┐
                          │   SavazAI Backend Engine (LangGraph)     │
                          │   Port 3055 (http://savazai-backend:3055)│
                          └──────────┬───────────────────┬───────────┘
                                     │                   │
                        ┌────────────▼──────┐     ┌──────▼────────────┐
                        │ PostgreSQL (5622) │     │ Remote MCP Server │
                        │  (pgvector / ORM) │     │ (JSON-RPC 2.0)    │
                        └───────────────────┘     └───────────────────┘
```

* **Frontend Console (`./savazai-console`)**: Built with **Next.js 16 App Router**, **React 19**, **Better-Auth**, **Tailwind CSS v4**, and **Shadcn UI**. Runs on port **`3056`**.
* **Backend Engine (`./`)**: Built with **Node.js**, **LangGraph (`@langchain/langgraph`)**, **Express/Fastify**, **Drizzle ORM**, and **pgvector**. Runs on port **`3055`**.
* **Database (`pgvector`)**: Runs **PostgreSQL 17** with vector search on host port **`5622`** (container internal port `5432`).

---

## 🌟 Capability Breakdown

### 1. Capability Studio (`/studio`)
* **Visual Agentflow Builder**: Drag-and-drop canvas for designing role-based multi-agent graphs.
* **Role-Based Node Topology**:
  * **Supervisor Node**: High-level plan formulation, parameter verification, and worker routing.
  * **Specialist / Worker Nodes**: Tool-bound nodes that execute target MCP operations.
  * **Synthesizer Node**: Aggregates ground-truth execution receipts into formatted reports.
  * **Scheduled Cron Nodes**: Recurring cron jobs and automated background monitors.
* **Dual Execution Modes**:
  * **Plan First (HITL Approval)**: Generates human-in-the-loop plan cards with **Reject & Re-Plan**, **Adjust & Re-Plan**, and **Approve & Execute** controls.
  * **Direct Execution**: Fast-path autonomous execution for trusted workflows.
* **Test Playground**: Step-by-step trace viewer with interactive parameter forms and streaming execution receipts.

### 2. Business Policy & Governance Center (`/policy`)
* **Universal Skills Registry**: Ingest, edit, and export modular `SKILL.md` markdown files with YAML frontmatter.
* **OKF (Operational Knowledge Framework) Concepts**: Enforce corporate business rules and domain SOPs without system prompt inflation.
* **Data Masking Gateway**: Automatically sanitizes PII/SPI fields with unique hashed reference tokens before dispatching prompts to non-local external LLMs.

### 3. Command Center (`/command`)
* **LLM Switchboard**: Switch dynamically between Google Gemini, OpenAI, Groq, xAI, and local OmniRoute gateways.
* **MCP & Database Hub**: 1-click preset MCP server injection (SAP, JIRA, Salesforce, ServiceNow) and multi-alias database connectors (PostgreSQL, MySQL, MongoDB, SQLite).
* **Appearance & Branding**: Persist hex CSS variables, custom typography, and dynamic application banners.
* **Social Media & Webhook Connectors**: Integrations for YouTube, Instagram, LinkedIn, TikTok, X (Twitter), and REST webhooks.

---

## 🚀 Quickstart & Deployment

### Prerequisites
* Docker & Docker Compose
* Node.js 20+ & npm

### Local Development Setup

1. **Clone and Install Dependencies**:
   ```bash
   # Install root engine dependencies
   npm install

   # Install frontend console dependencies
   cd savazai-console && npm install && cd ..
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` to `.env` in the root workspace and inside `./savazai-console/.env`:

   *Root Backend Environment (`./.env`)*:
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

   *Frontend Console Environment (`./savazai-console/.env`)*:
   ```ini
   NEXT_PUBLIC_HARNESS_API_URL=http://savazai-backend:3055
   NEXT_PUBLIC_APP_URL=http://localhost:3056
   DATABASE_URL=postgresql://sz_harness_admin:sz_secure_vault_pass_99@localhost:5622/savazai_harness
   BETTER_AUTH_SECRET=generate_a_secure_better_auth_secret_key
   BETTER_AUTH_URL=http://localhost:3056
   ```

3. **Database Migrations**:
   ```bash
   npm run db:generate
   npm run db:migrate
   ```

4. **Launch Application Containers**:
   ```bash
   docker compose up --build -d
   ```

5. **Access the Console**:
   Open **`http://localhost:3056`** in your browser.

---

## 🛠️ Configuration & MCP Guide

### Model Context Protocol (MCP) Integration
SavazAI communicates over standard **JSON-RPC 2.0 MCP endpoints**. Dynamic tools are discovered dynamically at runtime via `GET /api/tools/registered` or by polling connected MCP servers.

To register a custom MCP server:
1. Navigate to **Command Center $\rightarrow$ MCP & Database Hub**.
2. Add your server endpoint URL (e.g. `https://your-domain.com/api/mcp`) and authorization headers.
3. The engine automatically ingests available tool signatures (`list_*`, `create_*`, `update_*`, `delete_*`) and binds them to your specialist worker nodes in Capability Studio.

---

## 🛡️ Security & Privacy Guardrails

* **Zero Domain-Specific Hardcoding**: The engine core remains 100% graph-agnostic and schema-driven (AGENTS.md Rule 1 compliant).
* **Human-in-the-Loop Interceptors**: Destructive mutating operations (`delete_*`) trigger human approval interrupts before graph state resolution.
* **Cryptographic Vault (`MASTER_VAULT_SECRET`)**: All third-party secrets and OAuth tokens are encrypted at rest using AES-256-CBC encryption.

---

## 📄 License

Copyright &copy; 2026 SavazAI. All rights reserved. Sovereign Orchestration Infrastructure.
