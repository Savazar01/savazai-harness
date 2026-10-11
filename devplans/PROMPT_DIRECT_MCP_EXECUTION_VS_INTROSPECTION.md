# DEVPLAN PROMPT: Fix Direct MCP Execution vs Metadata Introspection in Agent Workspace

## 1. Problem Statement & Visual Evidence

### Symptom A (Screenshot 1: `media_1791715524618_bcd7dea0.png`):
- User submitted: `"Provide list of tools available in the nse-bhavcopy mcp"`.
- Instead of returning tool metadata immediately, the system routed the query into the Supervisor LangGraph planning loop.
- The Supervisor generated an `EXECUTION PLAN APPROVAL REQUIRED` card proposing to execute `get_top_by_volume`, `get_top_movers`, `nse_lookup_symbol`, and `get_market_mood`.
- The system misinterpreted a request *to list tools* as an intent *to run all of them*.

### Symptom B (Screenshot 2: `media_1791715723098_a176b73d.png`):
- User submitted: `"Get the top 10 most actively traded NSE stock as of Oct 10th 2026 sorted by value"`.
- After plan approval, instead of calling `get_top_by_volume` with `date`, `top_n`, and `sort_by`, the assistant merely rendered a static markdown table of tool descriptions:
  ```
  The NSE-Bhavcopy MCP offers a variety of tools...
  TOOL NAME | DESCRIPTION
  get_top_by_volume | Retrieves the top N most actively traded NSE stocks...
  ```
- No real MCP tool was called, and no stock data was fetched.

## 2. Root Cause Analysis
1. **Conflation of Metadata Introspection and Task Execution**:
   - There is no fast-path for metadata queries (`"list tools"`, `"available tools"`, `"what tools do you have"`).
   - In Direct MCP mode, when an introspection query arrives, the Supervisor attempts to formulate a plan with all matching tools instead of returning tool definitions.
2. **Missing Direct MCP Tool Execution Loop**:
   - When the user asks a genuine data query in Direct MCP mode, the model needs to be provided with the selected MCP tools for function calling, or the router must recognize the tool call and execute it via the MCP client/transport, passing the resulting dataset to the model for final synthesis.
   - When the worker executes or fails to execute, the responder defaults to echoing tool definitions because `executedTools` contains no data receipts or the prompt instructed it to list tools.

## 3. Goals
1. Implement a **Metadata Introspection Fast-Path**: immediately format and stream a clean Markdown table of available tools for active MCP server(s). No plan approval, zero tool execution.
2. Implement **Active Direct Tool Calling**: when a data query is submitted, invoke the selected MCP tool (e.g. `get_top_by_volume`) over JSON-RPC 2.0 / streamable-http with extracted parameters, obtain live data from the MCP server, and render the stock data table.
3. Quality gates: Backend typecheck, frontend build, local stack restart, knowledge graph update.
