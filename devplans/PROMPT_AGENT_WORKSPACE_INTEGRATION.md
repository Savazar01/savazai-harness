# PROMPT: Agent Workspace Modernization, Published Agentflow Execution, Dynamic MCP Dropdown & Multi-Transport Dispatching

## 1. Problem Statement & User Objectives
In Agent Workspace (`/dashboard`):
1. **Tool Execution Disconnection**:
   Clicking MCP buttons (`nse-bhavcopy`, `wedplanai-prod`, `cm-market`) displays them as selected, but queries return:
   `"No search results were retrieved from the tools"` or generic filler text.
   - The chat request passes server names in `activeTools`, but backend `runSubAgentLoop` and `getDynamicToolDefinitions` relied on direct raw HTTP POST to remote servers, which fails for endpoints requiring browser/custom headers or transport handling (e.g. NSE returns HTTP 400 when called without headers or Streamable HTTP transport).
   - In contrast, the `savazai-console` `/api/mcp` service already houses the full `McpAggregator` that supports `StreamableHTTPClientTransport`, `SSEClientTransport`, and `StdioClientTransport`.
2. **Missing Published Agentflow Execution**:
   Agent Workspace is completely disconnected from published workflows. Users should be able to run compiled Agentflows (e.g., *"Wedding Planning with Local Search (Published)"*) directly in the workspace chat with full Supervisor $\rightarrow$ Specialist $\rightarrow$ Synthesizer execution and traces.
3. **UI/UX Control Overhaul**:
   Replace static bottom pills with a clean selection bar:
   - **Mode Selector**: `[ Published Agentflows | Direct MCP Chat ]`
   - In **Published Agentflows** mode: dropdown dynamically querying `/api/agentflows?status=published`. Selecting an Agentflow binds the chat directly to that flow (`agentflowId`).
   - In **Direct MCP Chat** mode: dynamic multi-select dropdown listing all servers configured in Command Center (`/api/mcp`), with active indicator dots and tool count badges.
4. **Zero-Hardcoding Mandate**:
   - No server URLs, server IDs, or tool names hardcoded anywhere.
   - All server entries, headers, transports, and Agentflow lists resolve dynamically from database/Command Center settings.
   - Capability Studio (`/studio`) tool inspection is untouched and intact.
