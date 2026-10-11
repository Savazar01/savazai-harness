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

---

## 10. FORMAL DEVPLANS WORKFLOW, KNOWLEDGE GRAPH SYNCHRONIZATION & ZERO-HARDCODING POLICY

### A. DevPlans Workflow Rule
Every feature, fix, refactor, or architectural upgrade must maintain active tracking files under `/devplans`:
- `/devplans/PROMPT_<TASK>.md`: The incoming problem statement, error traces, and user objectives.
- `/devplans/PLAN_<TASK>.md`: The architectural specification, schema adjustments, file change breakdown, and testing strategy.
- `/devplans/WALKTHROUGH_<TASK>.md`: The post-execution documentation of changes, test logs, and end-to-end verification proofs.

### B. Knowledge Graph Synchronization
Every task completion requires running the codebase knowledge graph update command before declaring completion or committing code:
```bash
graphify update .
```

### C. Zero-Hardcoding Policy
- **Extensible Tool Categories**: Never restrict tool categories to static enumerations (`["native", "mcp"]`). Tool schemas must support open string categories (`"custom"`, `"open"`, `"builtin"`, `"api"`, `"database"`, `"social_media"`, external MCPs) with safe fallbacks.
- **Dynamic Model Configs**: Never mark LLM configurations as unconditionally required on structural or container nodes (such as Agent Teams). Always provide permissive schemas with safe fallback defaults (`{ provider: 'openai', model: 'gpt-4o-mini', temperature: 0.2 }`).
- **Dynamic Endpoints & Providers**: API endpoints, MCP transports, and model providers must be discovered and resolved dynamically via the Command Center settings, database configurations, or environment variables—never hardcoded in engine runtime modules.

### D. Selective MCP Workspace Exposure & Parameter Sanitization
- **`workspaceEnabled` Flag**: Every MCP server in `system_configurations.design_tokens.mcpServers` supports an explicit `workspaceEnabled: boolean` attribute (configurable via the Command Center switch).
  - Internal specialist tools (such as `wedplanai-prod`) set `workspaceEnabled: false` so they are exclusive to Capability Studio flows.
  - End-user chat tools (such as `nse-bhavcopy`, `cm-market`) set `workspaceEnabled: true` and appear in Agent Workspace (`/dashboard`).
- **Direct MCP vs Published Agentflows Isolation**:
  - In Direct MCP mode, `workflowId` / `agentflowId` lookups are skipped entirely to prevent SQL crashes.
  - In Published Agentflows mode, parameter sanitization ensures strings like `"inherit"`, `"default"`, or non-UUID inputs never trigger raw SQL parameter errors against PostgreSQL. All agentflow IDs must validate as valid UUID strings before querying.

---

## 11. UNIFIED EXECUTION ENGINE & AUTOMATED TECHNICAL CONTEXT RESOLUTION

### A. Unified LangGraph / Orchestrator Engine Across Studios & Workspace
- Agent Workspace (`/dashboard`) and Capability Studio (`/studio`) share the unified execution engine pipeline (`/api/orchestrator/test/route.ts`).
- When a published agentflow is executed from Agent Workspace, `/api/chat` routes execution directly through the unified orchestrator engine rather than routing to a disconnected stub.
- Internal node transitions, supervisor scratchpads, and MCP receipts are streamed strictly to the **System Trace** sidebar. Only clean, synthesized markdown is streamed to the user's chat message bubble.

### B. Automated Context Resolution & Technical ID Guardrails
- **Zero Technical IDs in HITL Forms**: Human-in-the-Loop parameter cards generated via `buildClarificationFromSchema` must never prompt end users for internal primary keys or technical UUIDs (e.g., `weddingId`, `tenantId`, `workspaceId`).
- **Dynamic Single-Object & Array Getter Resolution**:
  - In `autoResolveMissingSystemIds`, missing system identifiers (`<entity>Id`) are automatically resolved at runtime before tool invocation.
  - The engine checks assigned getter tools (such as `get_<entity>` or `list_<entity>`).
  - For single-object responses (e.g. `get_wedding`), the root record `id` is dynamically extracted and injected into the tool arguments.
  - For array responses (e.g. `list_ceremonies`), target labels are matched fuzzy-semantically to map human names (e.g., "Mehendi") to their corresponding UUIDs without end-user manual technical intervention.

### C. Client-Side HITL Plan-First Approval Card & Resumption Protocol
- In Agent Workspace (`/dashboard`), the stream client intercepts `PAUSED_AWAITING_HUMAN_APPROVAL` responses and emits `type: "interrupt"` with `plan`, `planSummary`, and `clarificationPrompt`.
- The chat thread renders the interactive **Plan-First Approval Card** inline with full step breakdown, implementation summary, parameters pre-populated from clarification prompts, and 4 action buttons (`Approve & Execute Plan`, `Submit Details & Execute`, `Adjust & Re-Plan`, `Reject & Re-Plan`).
- Resumption payloads dispatch directly back to `/api/chat` with `{ resume: { approved: boolean, plan, feedback } }`, cleanly continuing graph execution through worker tool invocation and synthesis.

---

## 12. STRICT DECOUPLING OF DIRECT MCP CHAT AND PUBLISHED AGENTFLOWS

### A. Strict Mode Separation
1. **Mode 1: Published Agentflows (`mode === "published-flow"` / UUID `workflowId`)**:
   - Executes the compiled LangGraph multi-agent pipeline: Supervisor -> Specialist Workers -> Synthesizer.
   - Enforces Human-in-the-Loop Plan-First approval gates (`plan_first` mode), displaying the step breakdown and clarification cards.
   - Resumes with human parameter adjustments or approvals directly into the downstream worker graph.

2. **Mode 2: Direct MCP Chat (`mode === "direct-mcp"` / no `workflowId`)**:
   - **ZERO Supervisor Node**: Never compiles or invokes the supervisor graph, never generates execution plans, never emits supervisor pause interrupts.
   - **ZERO Approval Cards**: Human-in-the-Loop plan approval cards are strictly prevented from appearing.
   - **ZERO Domain Leakage**: Prompts, schemas, and placeholders from unrelated workflows (e.g., weddings, catering) are strictly excluded.
   - **Server-Scoped Function Calling**:
     - Dynamically binds only the tools from explicitly selected MCP servers (`selectedMcpServers` / `activeTools`).
     - Executes tool calling loops directly using LLM native function declarations.
     - Dispatches JSON-RPC 2.0 calls directly to remote servers (e.g., `nse-bhavcopy` at `https://mcp.nseindia.in/bhavcopy/cm/mcp`).
     - Streams real-time tool traces to the System Trace sidebar and cleanly formatted Markdown answers directly into the chat bubble.