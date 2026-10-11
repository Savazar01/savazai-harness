# PLAN: Agent Workspace Modernization, Published Agentflow Execution, Dynamic MCP Dropdown & Multi-Transport Dispatching

## 1. Architectural Strategy

### A. Universal MCP Dispatching Architecture
Instead of having `src/orchestrator/graph.ts` duplicate MCP transport mechanics with brittle raw `fetch`, we delegate MCP tool enumeration and dispatch to the universal multi-transport aggregator (`McpAggregator` at `http://savazai-console:3056/api/mcp`):
1. **Tool Discovery in Graph**:
   When discovering dynamic MCP tools, `fetchMcpTools` queries `http://savazai-console:3056/api/mcp` (or localhost when outside Docker) using standard JSON-RPC `tools/list` or calls the aggregator endpoint.
   This guarantees that any transport (`streamable-http`, `sse`, `stdio`), authentication headers, or browser user-agent tokens defined in Command Center work identically everywhere.
2. **Tool Execution in Graph**:
   In `executeToolByName`, remote MCP tool executions route via `POST /api/mcp` (`tools/call`), providing `name`, `arguments`, and `serverId`.
   The aggregator executes using the exact configured transport and returns the structured payload.

### B. Agent Workspace UI Modernization (`chat-workspace.tsx`)
1. **Execution Target Selector in Header Control Bar**:
   - Mode Toggle: `Published Agentflows` vs `Direct MCP Chat`.
   - When in **Published Agentflows** mode:
     - Fetch published agentflows dynamically via `GET /api/agentflows?status=published`.
     - Render a clean dropdown listing published flows with status badge (e.g. `Wedding Planning with Local Search (Published)`).
     - Bind `workflowId` / `agentflowId` in `streamFromBackend` so the backend executes the compiled graph for that flow.
   - When in **Direct MCP Chat** mode:
     - Fetch active servers dynamically via `GET /api/mcp`.
     - Render a clean multi-select dropdown / popover showing configured servers with tool count badges and active status indicators.
     - Toggle active servers in `activeTools`.
2. **Bottom Input Toolbar Clean-Up**:
   - Remove the old static bottom pills row.
   - Display a compact status pill above the textarea indicating the active target:
     - e.g. `⚡ Flow: Wedding Planning with Local Search` or `🔌 MCP: nse-bhavcopy (21 tools), cm-market (15 tools)`.
   - Keep attachment, capability profile, provider/model, and execution mode dropdowns.

### C. Capability Studio Untouched Policy
- `savazai-console/src/components/studio/agent-drawer.tsx` and all Capability Studio files remain 100% untouched.

### D. Quality Gates & Verification
1. `npx tsc --noEmit`
2. `cd savazai-console && npm run build && cd ..`
3. `graphify update .`
4. Docker stack restart (`docker compose down; docker compose up --build -d`)
5. End-to-end verification of Published Agentflows and Direct MCP chat.
