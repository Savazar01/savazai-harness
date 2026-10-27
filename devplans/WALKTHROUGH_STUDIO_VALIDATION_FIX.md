# WALKTHROUGH: Fix Capability Studio Zod Validation Schema, Eliminate Hardcoding, and Formalize DevPlans / Graphify Rules in AGENTS.md

## 1. Executive Summary
Successfully fixed the Capability Studio Zod validation failures, eliminated tool category and model configuration hardcoding, implemented pre-save canvas sanitization pipelines, and formalized the DevPlans & Graphify engineering rules in `AGENTS.md` and `README.md`.

---

## 2. Changes Implemented

### A. Backend Core Validation Schemas (`src/core/schemas.ts`)
* **Extensible Tool Categories**: Replaced rigid `z.enum(["native", "mcp"])` with `ToolCategorySchema = z.string().default("mcp")`. All tool categories (`"custom"`, `"open"`, `"builtin"`, `"api"`, `"database"`, `"social_media"`, external MCP namespaces) validate without schema errors.
* **Permissive & Resilient `ModelConfigSchema`**: Made `modelConfig` optional with a safe default fallback (`{ provider: 'openai', model: 'gpt-4o-mini', temperature: 0.2 }`). Preprocessing cleanly handles `undefined` or `null` values.
* **Container & Team Node Support (`AgentNodeSchema`)**: Added support for container and team nodes (`roleTemplate: "team"`), layout coordinates, and visual properties (`parentId`, `collapsed`, `customColor`, `width`, `height`, `x`, `y`, `data`). Added `.passthrough()` to avoid stripping visual and routing metadata.
* **Resilient `CanvasDefinitionSchema` & `CanvasEdgeSchema`**: Added `.passthrough()` and default values (`edges: []`, `name: "Untitled Agentflow"`).

### B. LangGraph Compiler & Handler Extensions (`src/core/compiler.ts`)
* **Agent Team Node Handler**: Added `createTeamHandler` to handle `roleTemplate: "team"` as an active group router in the LangGraph topology.
* **Hierarchical Bus Wiring & Reachability**: Added parent-child edge auto-resolution so child workers parented under a team container are cleanly wired from the team node to the team's downstream targets (e.g. Synthesizer), ensuring 100% reachability in LangGraph without orphaned node errors.
* **HITL Policy Evaluation**: Enhanced `createWorkerHandler` to evaluate `hitlPolicy` (`"always"`, `"on_delete"`, `"on_mutate"`), auto-approving read actions while freezing sensitive deletions at `PENDING_APPROVAL`.

### C. Console Canonical Validation Schema (`savazai-console/src/lib/validations/canvas.ts`)
* Created a dedicated Zod validation module for the console matching the open backend specification:
  * `toolCategorySchema`: `z.string().default("mcp")`
  * `modelConfigSchema`: Resilient fallback to `{ provider: "openai", model: "gpt-4o-mini", temperature: 0.2 }`
  * `agentNodeSchema`: Supports both worker and team nodes with visual metadata
  * `canvasDefinitionSchema`: Open, passthrough canvas validator

### D. Canvas Serialization & Sanitizer (`savazai-console/src/lib/agentflow-utils.ts`)
* Implemented `sanitizeCanvasDefinition(def: CanvasDefinition): CanvasDefinition`:
  * Guarantees safe `modelConfig` fallback for all agent nodes (or leaves clean for container team nodes).
  * Normalizes tool categories to non-empty strings (defaulting to `"mcp"`).
  * Preserves all node positions, edges, and parent-child hierarchy.

### E. Capability Studio UI & Routing
* **`savazai-console/src/components/studio/canvas-editor.tsx`**:
  * Updated `ToolReference` interface to permit open category strings (`"native" | "mcp" | "custom" | "open" | string`).
  * Updated `handleSaveDraft` and `handlePublish` to pipe canvas data through `sanitizeCanvasDefinition`.
  * Added clean, human-readable error formatting for publish failure toasts to avoid raw JSON dumps.
* **`savazai-console/src/components/studio/agent-drawer.tsx`**:
  * Updated `Skill` and `RegisteredTool` interfaces to accept open category strings.
* **`savazai-console/src/app/studio/page.tsx`**:
  * Integrated `sanitizeCanvasDefinition` into `handleSaveDraft` and `handlePublish`.
* **`savazai-console/src/app/api/orchestrator/compile/route.ts`**:
  * Enhanced compiler proxy error extraction to return clean JSON and details.

### F. Governance & Architecture Rules (`AGENTS.md` & `README.md`)
* Added **Section 10** to `AGENTS.md`:
  1. **DevPlans Workflow Rule**: Mandatory tracking files (`/devplans/PROMPT_<TASK>.md`, `PLAN_<TASK>.md`, `WALKTHROUGH_<TASK>.md`).
  2. **Knowledge Graph Synchronization**: Mandatory `graphify update .` execution.
  3. **Zero-Hardcoding Policy**: Dynamic, schema-driven tool discovery, model configuration, and extensible categories.
* Updated `README.md` documenting Capability Studio resilience, external MCP integration, and DevPlans contribution standard.

---

## 3. Test & Verification Results

### Quality Gate 1: Unit Test Suite
* Executed `npx tsx src/core/__tests__/compiler.test.ts`:
  * **26 tests across 4 suites passed (0 failures)**.
  * Verified schema validation of dynamic tool categories (`"custom"`, `"open"`, `"database"`).
  * Verified `AgentNode` with missing `modelConfig` safely defaults to `{ provider: 'openai', model: 'gpt-4o-mini', temperature: 0.2 }`.
  * Verified `TeamNode` with omitted `modelConfig` parses without error.
  * Verified HITL deletion freeze and non-deletion auto-approval.

### Quality Gate 2: TypeScript & Production Build
* `npx tsc --noEmit`: 0 errors.
* `cd savazai-console && npm run build`: Compiled 28 routes cleanly in Turbopack Next.js 16.

### Quality Gate 3: Codebase Knowledge Graph
* Executed `graphify update .`:
  * Rebuilt: 5,220 nodes, 6,770 edges, 436 communities.
  * `graph.json` and `GRAPH_REPORT.md` updated.

### Quality Gate 4: Docker Container Stack
* Restarted stack via `docker compose down; docker compose up --build -d`:
  * `savazai-db`: Healthy on port 5622
  * `savazai-backend`: Healthy on port 3055
  * `savazai-console`: Healthy on port 3056

### Quality Gate 5: End-to-End Compile & Draft Save Probe
* Executed probe matching the screenshot scenario (9 nodes, including tools with categories `"custom"`, `"open"`, and team node 8 with omitted `modelConfig`):
  * `POST /api/orchestrator/compile`: **HTTP 200 OK** (`{"success": true, "message": "Canvas compiled to LangGraph successfully", "nodeCount": 9, "edgeCount": 2, "workflowType": "interactive"}`)
  * `PUT /api/agentflows/:id` (Save Draft): **HTTP 200 OK**
