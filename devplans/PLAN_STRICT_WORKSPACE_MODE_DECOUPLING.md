# PLAN: Strict Decoupling of "Direct MCP Chat" and "Published Agentflow" Modes in Agent Workspace

## 1. Objectives & Behavioral Boundaries
- **Published Agentflow Mode (`executionTarget === "agentflow"` / `mode === "published-flow"` / valid `workflowId`)**:
  - Unconditionally preserves the multi-agent compilation pipeline: Supervisor planning, Teams, Specialist Workers, Plan-First HITL approval card, resume handling, and synthesized reports.
- **Direct MCP Chat Mode (`executionTarget === "mcp"` / `mode === "direct-mcp"` / no `workflowId`)**:
  - **NO Supervisor Node**: Never invoke the LangGraph supervisor node, never generate an execution plan, never emit `Supervisor Node` traces.
  - **NO Plan-First HITL Approval Card**: Never interrupt with `WAITING_USER_APPROVAL` or render the plan approval card.
  - **NO Domain Leaks**: Never inject wedding system prompts, catering placeholders, or unrelated tools.
  - **Dynamic Server-Scoped Tool Calling**:
    - Discovers and binds tools exclusively from the **explicitly selected** MCP servers from the dropdown (`activeTools` / `selectedMcpServers`).
    - If no MCP server is selected, streams an informative prompt: `Please select an active MCP server from the dropdown above to execute tools.`
    - Executes an LLM function calling loop with the configured provider (OpenAI / Gemini / Anthropic) against `McpAggregator.getInstance().executeTool()`.
    - Dispatches JSON-RPC calls directly to the external MCP server (e.g. `nse-bhavcopy` at `https://mcp.nseindia.in/bhavcopy/cm/mcp`).
    - Streams tool invocation traces and the final synthesized Markdown answer directly to the chat bubble.

## 2. Architecture & File Breakdown

### A. Next.js Chat API Route (`savazai-console/src/app/api/chat/route.ts`)
- Parse `mode`, `selectedMcpServers`, and `executionTarget` from request body.
- When `mode === "direct-mcp"` or `(!workflowId && executionTarget === "mcp")`:
  - Bypass both `orchestratorTestPOST` and backend `${BACKEND_URL}/api/graph/invoke/stream`.
  - Handle Direct MCP execution directly in Next.js SSE stream:
    1. Read provider config (OpenAI / Anthropic / Gemini) from `system_configurations.design_tokens.llmProviders`.
    2. Inspect selected servers (`selectedMcpServers` or `activeTools`).
    3. If none selected, stream an immediate SSE event with markdown instructions and close stream cleanly.
    4. Fetch tool definitions from `McpAggregator.getInstance().listAllTools(pool)` filtered strictly by selected servers.
    5. Construct dynamic system prompt: general conversational assistant equipped with the selected MCP tools.
    6. Execute LLM with tool calling:
       - Send LLM request with function tools.
       - Parse tool calls.
       - If tool calls present: emit SSE tool trace event (`type: "tool"`, `toolName`, `arguments`), call `McpAggregator.getInstance().executeTool(serverId, toolName, args, pool)`, format tool output.
       - Call LLM with tool output to get final formatted markdown.
    7. Stream content chunks (`type: "content"`) to client and complete with `[DONE]`.

### B. Workspace Frontend (`savazai-console/src/components/chat-workspace.tsx`)
- Pass `mode: executionTarget === "mcp" ? "direct-mcp" : "published-flow"` and `selectedMcpServers: Array.from(activeTools)` in `streamFromBackend`.
- In `executeStream`:
  - If `executionTarget === "mcp"`:
    - Do NOT emit `Supervisor Node: Routing message through agent graph`.
    - Emit `Direct MCP Mode: Querying [activeTools]`.
    - If `activeTools.size === 0`, do NOT crash; inform the user.
- In `pendingInterrupt` rendering:
  - Guard: `{pendingInterrupt && executionTarget === "agentflow" && (` so the Plan Approval Card NEVER renders in Direct MCP mode.
- In the Plan Approval Card feedback textarea:
  - Replace the wedding-specific placeholder with a generic, domain-agnostic placeholder: `"Type execution parameters or adjustments here (e.g. date: 2026-10-09, symbol: INFY)..."`.
- In the bottom status pill:
  - For Direct MCP mode: display `activeTools.size === 0 ? "0 MCP Servers Active" : activeTools.size === 1 ? `1 MCP Server Active: ${Array.from(activeTools)[0]}` : `${activeTools.size} MCP Servers Active``.

### C. Stream Client (`savazai-console/src/lib/stream-client.ts`)
- Include `mode?: string` and `selectedMcpServers?: string[]` in the request body sent to `/api/chat`.
- Support `tool` event type in `StreamEvent` so tool call progress is displayed cleanly.

## 3. Verification & Quality Gates
1. `npx tsc --noEmit` across backend and console.
2. `npm run build` in `savazai-console`.
3. Test Direct MCP chat with `nse-bhavcopy`:
   - Query: `"Get the top 10 most actively traded NSE stocks on October 9th 2026, sorted descending. Sort by 'volume' (traded quantity)"`
   - Verify: No supervisor trace, no approval card, direct function call to `get_top_by_volume`, markdown table returned.
4. Test Published Agentflow mode with `"Wedding Planning with Local Search"`:
   - Verify: Still works with Supervisor, Plan Approval Card, and Resume execution.
5. Update knowledge graph (`graphify update .`).
6. Document in `/devplans/WALKTHROUGH_STRICT_WORKSPACE_MODE_DECOUPLING.md`.
