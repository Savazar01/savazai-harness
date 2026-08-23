# CRITICAL RULES - SAVAZAI AGENT HARNESS ENGINEERING

## 0. SKILLS.SH ECOSYSTEM INTEGRATION

- This project is linked to the skills.sh ecosystem for domain-specific procedural knowledge.
- Four ecosystem skills are registered locally in `.agents/skills/`:
  - `playwright-cli` (microsoft/playwright-cli) — Browser automation, resilient selectors, auto-waiting, request mocking
  - `shadcn` (shadcn/ui) — Component parsing, registry authoring, Radix/Tailwind composition
  - `vercel-react-best-practices` (vercel-labs/agent-skills) — React/Next.js performance optimization, server/client boundaries
  - `better-auth-best-practices` (better-auth/skills) — Type-safe auth, session management, plugin architecture
- All agents (OpenCode, Antigravity) must load these skills from `.agents/skills/` before generating or reviewing code.
- Code generated for harness or frontend features must not conflict with these skill design parameters.

---

## 1. APPLICATION PURITY & DECOUPLING (CRITICAL)

- This repository is an **APPLICATION-AGNOSTIC** multi-agent orchestration service container ("SavazAI").
- **NEVER** hardcode domain-specific fields, layout variables, or tables (such as weddings, ceremonies, or corporate events) into this engine's packages or core modules.
- All target application context must be resolved dynamically at runtime by communicating over registered JSON-RPC 2.0 MCP endpoints using explicit tool schemas.

### 🛡️ CORE ORCHESTRATION & GRAPHIFY COMPLIANCE RULES

1. **ZERO DOMAIN-SPECIFIC HARDCODING IN ENGINE:**
   - Under NO circumstances should `/api/orchestrator/test/route.ts` or backend core files contain hardcoded tool names (e.g., `list_tasks`, `send-email`), hardcoded domain keywords (e.g., `wedding`, `ceremony`), or conditional branch trees (e.g., `isToolRequiredByIntent`).
   - The backend engine MUST remain 100% graph-agnostic and schema-driven so any arbitrary graph topology or domain works without engine code modifications.

2. **GENERIC SAFETY & EXECUTION GUARDS:**
   - Worker tool enforcement MUST rely on universal metadata evaluations (e.g., `node.tools.length > 0 && turn === 0`).
   - Nested reference mapping (e.g., resolving foreign IDs/UUIDs to display names) MUST be instructed via generic prompt schema directives, never domain-specific hardcoded string maps.

3. **INFRASTRUCTURE SEPARATION:**
   - Email HTML transformation, Markdown parsing, and MCP envelopes belong strictly in the tool handler / infrastructure layer, while tone, formatting depth, and domain requirements belong on the Studio Canvas node prompts.

---

## 2. STATE DYNAMICS & LANGGRAPH ARCHITECTURE (`graph.ts`)

Developer agents modifying graph orchestrations must adhere to the state annotations and execution boundaries defined in `graph.ts` and `route.ts`:

1. **LangGraph State Annotation (`AgentGraphState`)**:
   - `messages`: Accumulates chat history with streaming support.
   - `plan`: Stores the Supervisor's structured `SupervisorPlanSchema` JSON array.
   - `receipts`: Stores ground-truth execution receipts (`toolName`, `status`, `payload`, `timestamp`).
   - `executionMode`: Toggles between `"plan_first"` (HITL plan approval card) and `"direct"` (autonomous fast path).

2. **Supervisor Plan-and-Confirm Interrupts**:
   - In `"plan_first"` mode, when the Supervisor formulates an execution plan, execution pauses at the HITL boundary (`PENDING_APPROVAL`).
   - The UI surfaces 3 interactive control actions:
     - `Approve & Execute`: Resumes worker graph execution.
     - `Adjust & Re-Plan`: Dispatches custom user parameter adjustments back to Supervisor for a revised plan.
     - `Reject & Re-Plan`: Instructs Supervisor to formulate a fresh alternative strategy.

3. **Specialist Tool Bindings & Role Boundaries**:
   - **Supervisor Node**: Focuses exclusively on plan formulation, parameter validation, and routing. Does NOT execute MCP data tools directly.
   - **Specialist/Worker Nodes**: Bound to specific MCP tool signatures (`list_*`, `create_*`, `update_*`, `delete_*`). Execute operations and emit receipts.
   - **Synthesizer Node**: Evaluates ground-truth receipts from all specialist workers, formats currency/dates, hides raw system UUIDs, and generates executive reports with recommendations.

---

## 3. DYNAMIC TOOL REGISTRY DISCOVERY (`GET /api/tools/registered`)

- **Runtime Schema Inspection**: The orchestrator engine dynamically polls connected MCP servers and local skills to discover tool signatures via `GET /api/tools/registered`.
- **Dynamic Parameter Hydration**: Required fields (`inputSchema.required`) are extracted at runtime to generate parameter forms (`buildClarificationFromSchema`) without static code bindings.
- **Ambient System Parameter Injection**: Foreign system keys (`weddingId`, `tenantId`, `workspaceId`) are dynamically injected from active database state configurations into worker tool call payloads.

---

## 4. SEPARATION OF CONCERNS: OKF/SKILLS vs MCP SCHEMAS

Maintain clear boundaries between business governance and technical execution:

| Layer | Responsibility | Storage Location | Example |
| :--- | :--- | :--- | :--- |
| **Business Policy (OKF / Skills)** | High-level business SOPs, operational guidelines, PII masking rules | `src/skills/` (`SKILL.md`) & OKF Database | Vendor audit SOPs, HIPAA compliance guidelines |
| **Technical Protocol (MCP)** | Low-level JSON-RPC 2.0 schemas, function parameters, endpoint transport | Remote MCP Endpoints (`/api/mcp`) | `create_vendor({ name, email, budget })` |

---

## 5. DECOUPLED MONOREPO DIRECTORY PATHS

- `./` (Root Workspace): SavazAI Engine Backend (Node.js, Express, LangGraph, Drizzle ORM, pgvector) on port **`3055`**.
- `./savazai-console` (Sub-Folder Workspace): SavazAI Console Frontend (Next.js 16 App Router, React 19, Better-Auth, Tailwind CSS, Shadcn UI) on port **`3056`**.

---

## 6. CORE NETWORK PORT & DOCKER INTRA-COMMUNICATION

- Database (pgvector): Host Port **`5622`** / Internal Container Port `5432`
- Backend API Engine: Host Port **`3055`** / Internal DNS: `http://savazai-backend:3055`
- Frontend Console UI: Host Port **`3056`** / Next.js standalone boundary
- **ZERO-HARDCODING RULE**: ALWAYS dynamically ingest endpoints via Environment Variables:
  - Backend API: `process.env.NEXT_PUBLIC_HARNESS_API_URL`
  - Authentication host: `process.env.BETTER_AUTH_URL`
  - Database credentials: `process.env.DATABASE_URL`

---

## 7. SYSTEM PRIVACY & SECURITY GUARDRAILS

- Every incoming record payload must execute through the Data Masking Gateway. Replace sensitive PII, SPI, PHI, or identifier text rows with unique, hashed reference tokens prior to dispatching queries to non-local external LLMs.
- Re-hydrate strings to their original parameters only within protected internal boundaries when calling authenticated application database layers.

---

## 8. BUILD, RUN & LOCAL-FIRST TESTING COMMANDS

```bash
# Run Both Apps and DB Locally (Root Directory)
docker compose up --build -d

# Complete Code Quality Verification Loop
# Backend Verification (Root Workspace)
npx tsc --noEmit
npm run lint

# Frontend Verification (./savazai-console Workspace)
cd savazai-console
npm run lint
npm run build

# Generate and Apply Database Migrations
npm run db:generate
npm run db:migrate
```

---

## 9. SECURITY & SYSTEM INTEGRITY INVARIANTS

- **Zero Cryptomining / Unauthorized Binary Execution**: The execution, bundling, or invocation of any cryptocurrency mining software (e.g., XMRig), unverified third-party binaries, or covert background processes is strictly prohibited across all agents, tools, skills, and containers.
- **Strict Execution Isolation**: All tool executions and sandboxed scripts (Python/Node) must execute within defined memory and process bounds without privilege escalation.
- **Production Authorization Boundary**: In production environments (`NODE_ENV === 'production'`), administrative privileges are granted strictly via verified environment configuration (`ADMIN_EMAIL`/`ADMIN_PASSWORD`) and never via open registration self-promotion.