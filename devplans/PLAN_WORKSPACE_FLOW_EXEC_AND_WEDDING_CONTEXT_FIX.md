# DEVPLAN ARCHITECTURAL PLAN: Fix Agent Workspace Flow Execution and Auto-Resolve Technical Context

## 1. Architectural Overview & Solution Strategy

### Component 1: Unify Agent Workspace Flow Execution with Capability Studio Pipeline
- **Target File**: `savazai-console/src/app/api/chat/route.ts` & `savazai-console/src/app/api/orchestrator/test/route.ts`
- **Design**:
  1. In `savazai-console/src/app/api/chat/route.ts`:
     - When `workflowId` (or `agentflowId`) is provided (Published Agentflows mode):
     - Query the `agentflows` database table for `canvas_definition`.
     - Extract `nodes` and `edges` from `canvas_definition`.
     - Transform `resume` payload if present (`approvedPlan: resume.plan || true` or re-plan feedback).
     - Directly delegate execution to `POST` in `/api/orchestrator/test/route.ts` (the robust LangGraph/MCP pipeline).
     - When `workflowId` is NOT provided (Direct MCP mode):
     - Continue routing to the direct MCP handler or backend.
  2. In `savazai-console/src/app/api/orchestrator/test/route.ts`:
     - Allow optional `workflowId` / `agentflowId` in the body payload if `nodes` is not directly provided, resolving `nodes` and `edges` from the database.

### Component 2: Sanitize Chat Workspace Event Stream
- **Target File**: `savazai-console/src/components/chat-workspace.tsx` & `savazai-console/src/lib/stream-client.ts`
- **Design**:
  1. When handling stream events:
     - Differentiate `event.type === "trace"` from conversational `event.content`.
     - Route all `trace`, `audit`, `node`, `tool`, and `state` events strictly into `addTrace(...)` for the System Trace sidebar.
     - Only append conversational completion chunks (or clean markdown from Synthesizer / Supervisor direct replies) into the assistant chat message.
     - Add interrupt handler for `event.type === "interrupt"` or `status === "PAUSED_AWAITING_HUMAN_APPROVAL"`.

### Component 3: Generic Auto-Resolution of System & Root Context IDs
- **Target File**: `savazai-console/src/app/api/orchestrator/test/route.ts`
- **Design**:
  1. **Generic Root Context & System ID Filtering in HITL Card (`buildClarificationFromSchema`)**:
     - Update `isPrimaryScopeSystemId(k)`:
       - Check if `k === "id"` or `k === "_id"`.
       - Check if `lower.endsWith("id")`:
         - If `lower` matches system/root scope patterns (`tenant`, `workspace`, `organization`, `scope`, `app`, `project`, `wedding`, `event`, `account`, `org`).
         - Or if a root getter tool (`get_<entity>` or `get_${refEntity}`) is present among the assigned tools.
       - These keys must NEVER be shown as blank editable prompts to the human user.
  2. **Generic Auto-Resolution before Tool Invocation (`autoResolveMissingSystemIds`)**:
     - When any mutating tool is executed, inspect tool arguments and schema properties.
     - For any property ending with `Id` or `_id`:
       - Derive `refEntity = key.replace(/Id$|_id$/i, "").toLowerCase()`.
       - Find an assigned getter tool (`get_<refEntity>`, `list_<refEntity>`, `fetch_<refEntity>`, etc.).
       - Call the getter tool via `McpAggregator.getInstance().executeTool(serverId, matchingTool, {}, pool)`.
       - Handle both response types:
         - **Single Object** (e.g. `get_wedding` returning `{ id: "uuid", ... }`): Automatically assign `newArgs[key] = String(result.id)`.
         - **Array of Records** (e.g. `list_ceremonies` returning `[{ id: "uuid", name: "Mehendi" }]`): Match user-provided target string against record names/titles to resolve the UUID.
     - Wire `autoResolveMissingSystemIds` into the worker execution loop immediately before calling `runMcpToolWithResilience`.
  3. **Instruction-Based Generic Guidance**:
     - In the worker system prompt, include generic instructions:
       - Before executing create or update operations requiring root context IDs, invoke assigned context getter tools (such as `get_<entity>`) to resolve the active entity identifier.

### Component 4: Backend Compiler Fallback Sanitization
- **Target File**: `src/core/compiler.ts`
- **Design**:
  - Remove hardcoded debug dump string templates from `createSynthesizerHandler` so it generates clean output if invoked as a fallback.

---

## 2. File Change Breakdown

| File | Changes |
| :--- | :--- |
| `savazai-console/src/app/api/chat/route.ts` | Load published agentflow canvas from DB when `workflowId` is present and execute via `orchestratorTestPOST`. |
| `savazai-console/src/app/api/orchestrator/test/route.ts` | Add DB lookup fallback for `workflowId`/`agentflowId`; update `isPrimaryScopeSystemId`; upgrade `autoResolveMissingSystemIds` to handle single-object getters and wire into tool execution loop; add generic prompt instructions. |
| `savazai-console/src/components/chat-workspace.tsx` | Sanitize stream events so `trace` events go to System Trace and only final content goes to chat messages. |
| `savazai-console/src/lib/stream-client.ts` | Support `PAUSED_AWAITING_HUMAN_APPROVAL` interrupt event mapping. |
| `src/core/compiler.ts` | Clean up fallback synthesizer handler and tool resolution messages. |
| `AGENTS.md` & `README.md` | Document the auto-resolution pattern and unified execution engine. |

---

## 3. Verification & Quality Gates

1. **Typecheck Workspace**:
   ```bash
   npx tsc --noEmit
   ```
2. **Next.js Console Build**:
   ```bash
   cd savazai-console && npm run build
   cd ..
   ```
3. **Knowledge Graph Synchronization**:
   ```bash
   graphify update .
   ```
4. **Local Stack Restart**:
   ```bash
   docker compose down && docker compose up --build -d
   docker compose ps
   ```
5. **Functional Verification**:
   - Capability Studio Test Playground: create guest "Rosemary" -> verify HITL card omits blank `Wedding:` field; approve -> verify `create_guest` receives resolved `weddingId`.
   - Agent Workspace: run prompt with "Wedding Planning with Local Search" -> verify clean markdown table output and no `NOT_FOUND` dumps.
