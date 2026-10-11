# DEVPLAN ARCHITECTURE SPECIFICATION: Fix Agentflow ID Query Resolution, Selective MCP Workspace Exposure, and Agent Workspace Routing

## 1. Architectural Strategy

### A. Fix `streamFromBackend` Parameter Signature & Call Site
- **Issue**: `savazai-console/src/components/chat-workspace.tsx` calls `streamFromBackend` omitting `activeModel`, causing parameter positional shift:
  ```typescript
  streamFromBackend(
    text,
    "WedPlanAI-Local",
    onEvent,
    signal,
    activeProvider,
    // activeModel MISSING
    filesToSend, // shifts into model
    activeTools, // shifts into files
    threadId,    // shifts into activeTools
    selectedFlowId, // shifts into threadId
    executionModeOverride, // shifts into workflowId -> "inherit"!!
    resumePayload // shifts into executionMode
  )
  ```
- **Fix**:
  1. Restore `activeModel` as parameter 6.
  2. In `executionTarget === "mcp"` mode, guarantee `workflowId` is strictly `undefined` or not passed.
  3. In `executionTarget === "agentflow"` mode, guarantee `selectedFlowId` is a valid UUID or ID string.

### B. Backend Robustness Guard in `resolveGraphForAgentflow` (`src/index.ts`)
- In `resolveGraphForAgentflow(agentflowId)`:
  - Add validation: If `agentflowId` is falsy, `"inherit"`, `"default"`, or does not match a valid identifier/UUID format, immediately return `compiledGraph` and do NOT query PostgreSQL `agentflows` table.
  - Wrap the DB query in a try-catch to ensure graceful fallback rather than 500 error / stream failure.

### C. Configurable `workspaceEnabled` in Command Center & MCP Aggregator
1. **Schema & Types**:
   - In `savazai-console/src/lib/mcp/client-aggregator.ts`:
     - Add `workspaceEnabled?: boolean` to `McpServerConfigEntry`.
     - In `listAllTools()`, return `{ serverId, tools, workspaceEnabled: cfg.workspaceEnabled !== false }`.
2. **Command Center UI (`savazai-console/src/components/settings-dashboard.tsx`)**:
   - Add state: `mcpServerWorkspaceEnabledInput` (boolean, default true).
   - In MCP Server Add/Edit modal, add a Switch: "Expose in Agent Workspace (Direct Chat)".
   - In the Server card listing, display a badge: `[Workspace: Enabled]` or `[Workspace: Studio Only]`.
   - Update preset payloads to set `workspaceEnabled: false` for `wedplanai-prod`, and `true` for `nse-bhavcopy` / `cm-market`.
3. **Database Configuration Update**:
   - Update existing `mcpServers` in database `system_configurations` so `wedplanai-prod` has `workspaceEnabled: false` and financial MCPs have `workspaceEnabled: true`.

### D. Agent Workspace Selective MCP Chat Experience (`savazai-console/src/components/chat-workspace.tsx`)
1. **Selective Exposure**:
   - In Direct MCP Chat mode, only display MCP servers where `workspaceEnabled !== false`.
   - On load, do NOT activate all servers by default. Let user pick the server(s) they wish to query.
   - Show available tool counts per server.
2. **Natural Language Tool Enumeration**:
   - When a user asks "Provide list of tools for <server>" or "List available tools", ensure the chat route accurately provides the list of registered tools from that server.
3. **Published Agentflow Execution**:
   - When user selects "Wedding Planning with Local Search" and asks "Provide list of Guests and RSVP Status", the backend executes the published agentflow graph without SQL crashes.

## 2. Affected Files
1. `savazai-console/src/components/chat-workspace.tsx`
2. `savazai-console/src/lib/mcp/client-aggregator.ts`
3. `savazai-console/src/app/api/mcp/route.ts`
4. `savazai-console/src/components/settings-dashboard.tsx`
5. `src/index.ts`
6. Database configuration (`system_configurations.design_tokens.mcpServers`)

## 3. Verification Plan
1. `npx tsc --noEmit`
2. `cd savazai-console && npm run build && cd ..`
3. Verify Command Center MCP configuration includes "Expose in Agent Workspace".
4. Test Direct MCP Chat with `nse-bhavcopy` querying tool list.
5. Test Published Agentflow with "Wedding Planning with Local Search" querying guest list.
6. `graphify update .`
