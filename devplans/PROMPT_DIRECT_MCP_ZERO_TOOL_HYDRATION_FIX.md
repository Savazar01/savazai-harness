# PROMPT: Fix Agent Workspace Zero-Tool Hydration & Dynamic Tool Enumeration for Direct MCP Mode

## 1. Bug Analysis & User Evidence
From screenshot `media_1791727599623_7c97cc10.png`:
1. **Header & Dropdown**:
   - Header badge shows: `MCP: nse-bhavcopy (0 tools)`.
   - In dropdown popup:
     - `nse-bhavcopy` -> **`0 granular tools registered`**.
     - `cm-market` -> **`0 granular tools registered`**.
2. **System Trace**:
   - `[Direct MCP] Bound 0 tool(s) from [nse-bhavcopy]`.
3. **Chat Response**:
   - Query: *"I want you to list all the tools that are available for this MCP and their use"*.
   - Assistant outputs: `1. nse-bhavcopy: This tool is used to retrieve live stock market data...` (collapsing the whole server into 1 pseudo-tool because tool count is 0).

## 2. Root Cause Analysis
1. In `McpAggregator`:
   - Remote MCP servers (such as `nse-bhavcopy` and `cm-market`) point to external HTTPS endpoints (`https://mcp.nseindia.in/bhavcopy/cm/mcp`).
   - If network handshake times out or encounters transient network latency, `listAllTools` catches the error and returns `tools: []`.
   - It caches this empty array in `this.schemaCache = { tools: allTools, timestamp: now }` for 60 seconds (or more), locking the system into `0 granular tools registered`.
2. In `savazai-console/src/components/chat-workspace.tsx`:
   - It fetches `/api/mcp` on mount. If `tools.length === 0`, it displays `0 tools`.
   - When the user asks to list available tools, the system prompt doesn't instruct the model with the hydrated tool list if `tools.length === 0`.
3. In `savazai-console/src/app/api/chat/route.ts`:
   - If `boundTools.length === 0`, it does not re-attempt discovery or fall back to known registered/persisted tools; it passes 0 tools to the LLM, leaving the model guessing based on the server name alone.
   - We need:
     - Persistent tool registry in database / fallback tool store for configured servers so when external MCP servers are registered or indexed, their tool schemas persist across restarts.
     - Live on-demand refresh mechanism when tool count is 0.
     - Do not cache empty tool lists for active servers.
     - Never collapse servers into fake pseudo-tools.

## 3. Plan & Invariants
- DevPlans workflow: `PROMPT_*.md`, `PLAN_*.md`, `WALKTHROUGH_*.md`.
- Shared tool registry between Studio and Workspace.
- Re-run verification commands and `graphify update .`.
