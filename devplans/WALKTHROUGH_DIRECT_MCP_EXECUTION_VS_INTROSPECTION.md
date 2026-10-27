# DEVPLAN WALKTHROUGH: Direct MCP Execution vs Metadata Introspection in Agent Workspace

## 1. Overview of Resolved Issues

### Issue A: Metadata Introspection Inappropriately Triggers Planning & Approval Cards
- **Symptom**: Asking `"Provide list of tools available in the nse-bhavcopy mcp"` previously caused `supervisorNode` to treat the prompt as an operational task to be executed. The Supervisor generated a 4-step execution plan requiring user approval rather than outputting tool definitions.
- **Resolution**: Implemented an informational fast-path via `isToolIntrospectionQuery()` in `src/orchestrator/graph.ts`. Introspection queries immediately inspect registered and active tools from the requested or active MCP servers, construct a formatted Markdown table, and route directly to `respondNode` with zero execution interrupts.

### Issue B: Genuine Data Queries Failing to Call MCP Tools & Echoing Static Definitions
- **Symptom**: Asking `"Get the top 10 most actively traded NSE stock as of Oct 10th 2026 sorted by value"` failed to invoke `get_top_by_volume`. The assistant merely echoed back the static markdown table describing tools from conversation history.
- **Root Causes Fixed**:
  1. **Domain-Specific Hardcoding Removed**: Replaced wedding-specific prompts in `dataFetchAgentNode` and `mutationAgentNode` with generic, universal schema-driven instructions.
  2. **Selective Tool Ingestion**: `runSubAgentLoop` now filters active servers and tools using `state.activeTools`, eliminating clutter and context contamination from unselected servers.
  3. **Approved Plan Execution Enforcement**: In `runSubAgentLoop`, the approved supervisor plan steps and active tool definitions are injected into the agent instructions. If the planner hesitates on iteration 1, the approved tool calls are deterministically dispatched.
  4. **Universal Schema Adaptation in `executeToolByName`**: Dynamic argument adaptation normalizes camelCase/snake_case variations (`sort_by` -> `sortBy`, `top_n`/`limit`/`count` -> `n`), coerces integer types, standardizes ISO dates, strips invalid keys when `additionalProperties: false`, and eliminates blind `weddingId` injection on read tools.

---

## 2. File Diffs Summary

### `src/orchestrator/graph.ts`
- **`getDynamicToolDefinitions`**:
  - Expanded return type to include `inputSchema?: any` so parameter structures are preserved for planning and execution.
- **`isToolIntrospectionQuery` & `formatToolIntrospectionResponse`**:
  - Added fast-path classifier for queries requesting tools, capabilities, or skills.
  - Generates structured Markdown tables grouped by MCP server or category without touching LangGraph sub-agent loops.
- **`supervisorNode`**:
  - Intercepts introspection queries at the start of a turn, formats the catalog table, sets `routingDecision: "respond"`, and bypasses `interrupt()`.
- **`generateExecutionPlanFromTools`**:
  - Injected `Parameters Schema` into tool descriptions so the planner extracts the exact parameter names matching the target tool's schema (e.g. `n`, `sortBy`, `date`).
- **`executeToolByName`**:
  - Implemented universal argument mapping (`n`, `sortBy`, case-insensitive property matching, integer coercion).
  - Enforced schema restriction cleanup (`additionalProperties === false`).
- **`runSubAgentLoop`**:
  - Filtered server scans and tool lists by `state.activeTools`.
  - Injected available tools and approved supervisor plan directives into the sub-agent prompt.
  - Enforced approved plan step dispatching on iteration 1.
  - Removed domain-specific `weddingId` parameter hardcoding.
- **`dataFetchAgentNode` & `mutationAgentNode`**:
  - Replaced wedding domain prompts with schema-driven, domain-agnostic agent prompts.

---

## 3. End-to-End Verification Proofs

### Proof 1: Metadata Introspection Query (Instant Catalog, Zero Approval Modal)
**Request**:
```json
{
  "message": "Provide list of tools available in the nse-bhavcopy mcp",
  "activeTools": ["nse-bhavcopy"]
}
```
**Response Stream**:
```json
{
  "type": "content",
  "content": "### Available Tools in `nse-bhavcopy` MCP\n\n| Tool Name | Description |\n| :--- | :--- |\n| `get_top_by_volume` | Get the top N most actively traded NSE stocks on a specific date, sorted descending. Sort by 'volume' (traded quantity) or 'value' (turnover in ₹). |\n| `get_top_movers` | Get the top gaining or losing NSE stocks on a specific date. |\n| `nse_lookup_symbol` | Search for NSE equity symbols by security/company name or symbol prefix. |\n| `get_market_mood` | Get market mood/breadth summary for a given trading date (advances, declines, unchanged). |\n..."
}
```
- **Outcome**: Returned immediately, 0 plan modal, 0 tool executions.

---

### Proof 2: Direct Execution Mode (Live Stock Data Retrival)
**Request**:
```json
{
  "message": "Get the top 10 most actively traded NSE stock as of Oct 10th 2026 sorted by value",
  "activeTools": ["nse-bhavcopy"],
  "executionMode": "direct"
}
```
**Synthesized Output from Live MCP**:
```markdown
**As of October 9, 2026, the top 10 most actively traded NSE stocks sorted by value are as follows:**

| Stock Symbol | Close Price (₹) | Traded Value (₹) | Volume        | % Change |
|--------------|------------------|-------------------|---------------|----------|
| MONEYVIEW    | 62.39            | 27,312,292,006    | 450,972,326   | +7.77%   |
| TCS          | 2,156.00         | 25,357,200,516    | 11,692,314    | +3.85%   |
| ADANIPORTS   | 1,761.00         | 17,333,249,893    | 9,906,351     | +3.10%   |
| HEXT         | 538.50           | 16,730,677,515    | 30,418,657    | +5.30%   |
| INFY         | 1,023.40         | 14,404,647,937    | 14,094,234    | +2.65%   |
| RELIANCE     | 1,170.30         | 14,146,863,856    | 12,086,708    | -0.65%   |
| KOTAKBANK    | 441.00           | 13,973,822,072    | 31,536,992    | +1.38%   |
| PCJEWELLER   | 14.81            | 13,091,050,519    | 895,898,449   | +6.55%   |
| HDFCBANK     | 707.25           | 12,964,034,612    | 18,397,972    | +2.17%   |
| CUPID        | 366.10           | 12,186,755,444    | 33,720,165    | +2.65%   |
```

---

### Proof 3: Plan-First Mode (Interrupt Plan Approval -> Approved Execution)
**Turn 1: Interrupt Generated**:
```json
{
  "type": "interrupt",
  "node": "supervisorNode",
  "interrupt": {
    "plan": [
      {
        "nodeId": "get_top_by_volume",
        "targetNode": "Get Top NSE Stocks by Volume",
        "allowedVerbs": ["LIST", "READ"],
        "actionVerb": "LIST",
        "targetEntity": "Stock",
        "parameters": {
          "date": "2026-10-10",
          "n": 5,
          "sortBy": "value"
        },
        "requiresClarification": false,
        "warning": ""
      }
    ],
    "status": "WAITING_USER_APPROVAL"
  }
}
```
**Turn 2: Resume with `{ approved: true }`**:
```markdown
**Top 5 Most Actively Traded NSE Stocks by Value as of October 9th, 2026**

| Symbol      | Close Price (₹) | Traded Value (₹ million) | Volume       | % Change |
|-------------|------------------|--------------------------|--------------|----------|
| MONEYVIEW   | 62.39            | 27,312.29                | 450,972,326  | 7.77%    |
| TCS         | 2,156.00         | 25,357.20                | 11,692,314   | 3.85%    |
| ADANIPORTS  | 1,761.00         | 17,333.25                | 9,906,351    | 3.10%    |
| HEXT        | 538.50           | 16,730.68                | 30,418,657   | 5.30%    |
| INFY        | 1,023.40         | 14,404.65                | 14,094,234   | 2.65%    |
```

---

## 4. Quality Gates Verification Status
- [x] Backend TypeScript Typecheck: `npx tsc --noEmit` passed with 0 errors.
- [x] Frontend Production Build: `npm run build` in `savazai-console` passed with 0 errors.
- [x] Docker Container Health: All containers rebuilt, restarted, and running healthy.
- [x] Codebase Knowledge Graph Synchronized: `graphify update .` completed successfully (5,280 nodes, 6,824 edges).
