# DEVPLAN: Direct MCP Execution vs Metadata Introspection in Agent Workspace

## 1. Architectural Overview & Context
This devplan resolves the conflation between tool metadata introspection queries (e.g. "Provide list of tools available in the nse-bhavcopy mcp") and actual task execution queries (e.g. "Get the top 10 most actively traded NSE stock as of Oct 10th 2026 sorted by value") in the Agent Workspace (`/dashboard`).

### Key Invariants (AGENTS.md Compliance):
- **Zero Hardcoding**: No wedding, NSE, or ceremony domain keywords in engine dispatch logic.
- **Dynamic Introspection**: Metadata queries return tool names and descriptions without invoking planner interrupts.
- **Schema-Driven Tool Execution**: Remote MCP tool parameters must be validated, adapted, and cleaned against the tool's published `inputSchema` before dispatch.
- **Decoupled Architecture**: Capability Studio (`/studio`) tool inspection is unaffected.

---

## 2. Root Cause Breakdown

### Issue A: Introspection Triggering Execution Plans
- In `src/orchestrator/graph.ts` (`supervisorNode`), any read-only query is passed to `generateExecutionPlanFromTools`.
- Because queries like `"Provide list of tools available in the nse-bhavcopy mcp"` contain read-only words ("list", "provide"), the Supervisor treats this as an operational task to execute all tools in the server.
- The Supervisor generates an approval card with 4 execution steps instead of rendering tool metadata.

### Issue B: Sub-Agent Wedding Hardcoding & Failed Tool Invocation
- In `dataFetchAgentNode` and `mutationAgentNode`, the system prompts explicitly hardcode: `(e.g., get_wedding, list_guests, list_tasks, list_ceremonies, list_vendors)`.
- In `runSubAgentLoop`, tools from all servers (including internal `wedplanai-prod`) are fetched without filtering by `state.activeTools`.
- In `runSubAgentLoop`, the approved supervisor plan is ignored, and the agent asks the model to re-plan from scratch with wedding-biased prompts.
- In `executeToolByName` and `runSubAgentLoop`, `weddingId` is injected into any tool starting with `get_`, `list_`, `create_`, `update_`, `delete_`. For MCP tools with `additionalProperties: false` (such as `get_top_by_volume`), this causes failures.
- Parameter naming differences (e.g., `sortBy` vs `sort_by`, `n` vs `top_n`) are not adapted to the tool's published `inputSchema`.
- Consequently, tool execution fails or is skipped, and the synthesizer falls back to repeating previous tool descriptions from conversation history.

---

## 3. Targeted Technical Changes

### File 1: `src/orchestrator/graph.ts`
1. **Metadata Introspection Fast-Path**:
   - Implement `isToolIntrospectionQuery(text: string): boolean`.
   - In `supervisorNode`, before plan generation / interrupt check:
     - If `isToolIntrospectionQuery(latestUserMsgContent)`:
       - Query dynamic tool definitions via `getDynamicToolDefinitions(state.activeTools)`.
       - If user query references a specific server, filter to that server.
       - Construct a structured Markdown table of tools (`Tool Name` | `Description`).
       - Set `synthesisOutput: table`, `routingDecision: "respond"`, bypassing `interrupt()` and transitioning directly to `respondNode`.
2. **Schema-Aware Plan Generation**:
   - Update `getDynamicToolDefinitions` to return `inputSchema` alongside `name`, `description`, `category`.
   - Update `generateExecutionPlanFromTools` prompt to include the tool parameter schemas so the planner extracts the exact parameter names (`date`, `n`, `sortBy`).
3. **Domain-Agnostic Sub-Agent Prompts**:
   - Replace wedding-specific hardcoding in `dataFetchAgentNode` and `mutationAgentNode` system prompts with universal schema-driven role instructions.
   - Inject the list of active tools and descriptions into the `runSubAgentLoop` prompt.
   - Pass the approved `supervisorPlan` steps into `runSubAgentLoop` so approved actions are deterministically executed.
4. **Universal Parameter Adaptation & Cleanup in `executeToolByName`**:
   - Dynamically adapt argument aliases based on the tool's `inputSchema.properties`:
     - Match case-insensitive and snake_case/camelCase variants (e.g. `sort_by` -> `sortBy`, `top_n`/`limit`/`count` -> `n`).
     - Standardize dates to ISO format.
     - Enforce type coercion (e.g., ensure integer for `n`).
     - If `inputSchema.additionalProperties === false`, strip any args not in `inputSchema.properties`.
   - Remove hardcoded `weddingId` injection on all `get_`/`list_` tools; ambient parameters are only injected if explicitly declared in `toolObj.inputSchema.properties`.

---

## 4. Quality Gates Sequence
1. Typecheck: `npx tsc --noEmit`
2. Frontend build: `cd savazai-console && npm run build && cd ..`
3. Stack restart: `docker compose restart savazai-backend savazai-console`
4. Knowledge Graph: `graphify update .`
5. Verification:
   - Query 1: `"Provide list of tools available in the nse-bhavcopy mcp"` -> Returns Markdown table immediately, zero plan card.
   - Query 2: `"Get the top 10 most actively traded NSE stock as of Oct 10th 2026 sorted by value"` -> Calls `get_top_by_volume`, renders live stock data table.
6. Walkthrough: Write `/devplans/WALKTHROUGH_DIRECT_MCP_EXECUTION_VS_INTROSPECTION.md`.
