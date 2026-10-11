# DEVPLAN PROMPT: Fix Agentflow ID Query Resolution, Selective MCP Workspace Exposure, and Agent Workspace Routing

## 1. Context & Problem Statement
During Agent Workspace (`/dashboard`) execution, two critical issues were identified:

1. **Fatal Database Query Crash on Agentflow Resolution**:
   Execution crashes with the following error trace:
   ```text
   An internal exception was encountered during stream execution: Failed query:
   select "id", "name", "description", "workspace_mode", "status", "canvas_definition", "created_at", "updated_at" 
   from "agentflows" where "agentflows"."id" = $1 limit $2 params: inherit,1
   ```
   - In `savazai-console/src/components/chat-workspace.tsx`, `streamFromBackend` was called with misaligned parameters because `activeModel` was omitted. This caused `executionModeOverride` (default value `"inherit"`) to be passed into the `workflowId` parameter.
   - When forwarded to `/api/chat` and backend `POST /api/graph/invoke/stream`, `resolveGraphForAgentflow("inherit")` executed a query against PostgreSQL with `$1 = "inherit"`, crashing because `"inherit"` is not a valid UUID.
   - Furthermore, in Direct MCP Chat mode (`executionTarget === "mcp"`), no agentflow lookup should ever occur.

2. **Uncontrolled MCP Exposure in Agent Workspace**:
   - Entering Direct MCP Chat automatically activates all configured MCP servers (`wedplanai-prod`, `nse-bhavcopy`, `cm-market`), cluttering the context window.
   - There was no configuration attribute (e.g. `workspaceEnabled: boolean`) to distinguish internal/studio-only specialist servers (like `wedplanai-prod`) from workspace chat servers (like `nse-bhavcopy` and `cm-market`).
   - Command Center lacked an "Expose in Agent Workspace" toggle per configured MCP server.
   - The workspace did not allow users to selectively choose which server to query, and lacked responsive handling for tool enumeration queries (e.g., `"Provide list of tools for nse-bhavcopy"`).

3. **Published Agentflow Execution Failure**:
   - In Published Agentflow mode (`"Wedding Planning with Local Search"`), queries like `"Provide list of Guests and RSVP Status"` must execute properly via the compiled LangGraph pipeline without parameter misalignment or DB crashes.

## 2. Invariants & Scope Boundaries
- **Capability Studio Isolation**: Capability Studio (`/studio`) MCP tool introspection and canvas editor MUST NOT be touched or regressed.
- **Zero Hardcoding**: All MCP server definitions, URLs, and exposure toggles must be dynamically read from and written to the database configuration (`system_configurations.design_tokens.mcpServers`).
