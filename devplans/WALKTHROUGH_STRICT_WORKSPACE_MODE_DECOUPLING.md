# WALKTHROUGH: Strict Decoupling of "Direct MCP Chat" and "Published Agentflow" Modes in Agent Workspace

## 1. Problem Overview & Regression Root Cause
In the Agent Workspace (`/dashboard`), when a user selected **Direct MCP Chat** (`DIRECT MCP` badge displayed) and asked for stock market data:
> *"Get the top 10 most actively traded NSE stocks on October 9th 2026, sorted descending. Sort by 'volume' (traded quantity)"*

The system incorrectly treated the request as an agentflow execution:
1. It invoked the default LangGraph orchestrator (`supervisorNode`) via `${BACKEND_URL}/api/graph/invoke/stream`.
2. The supervisor node evaluated `getDefaultExecutionMode()` (which defaulted to `"plan_first"`).
3. It paused on an `interrupt` requiring human plan approval.
4. The UI rendered the `EXECUTION PLAN APPROVAL REQUIRED` card with hardcoded wedding catering placeholders (`Vendor Name: Catering Co, Category: Catering`), leaking domain state into an unrelated financial query.

## 2. Key Architecture Fixes Implemented

### A. Next.js Chat API Route (`savazai-console/src/app/api/chat/route.ts`)
- **Strict Route Branching**:
  - **Mode 1 (`Published Agentflows`)**: When `workflowId` is a valid 36-char UUID, execution continues through `orchestratorTestPOST`, compiling the flow's canvas nodes and edges, honoring Plan-First HITL approval cards and resumption payloads.
  - **Mode 2 (`Direct MCP Chat`)**: When `mode === "direct-mcp"` or `!workflowId`:
    - **NO Supervisor Node**: Never compiled or invoked.
    - **NO Plan-First HITL Approval Card**: Never pauses with `PAUSED_AWAITING_HUMAN_APPROVAL`.
    - **NO Domain Leaks**: Zero wedding prompts or stubs.
    - **Selected Server Isolation**: Dynamically filters tools from `McpAggregator.getInstance().listAllTools(pool)` to only those belonging to the explicitly selected servers (`activeTools` / `selectedMcpServers`).
    - **Zero Server Guard**: If no MCP server is selected in the dropdown, streams a friendly guidance message: `⚠️ No MCP Server Selected. Please select an active MCP server from the dropdown above to execute queries and retrieve data.`
    - **Function Calling Loop**: Uses `queryLLMWithHistory` with native tool declarations, parses tool calls with `parseToolCalls`, invokes `McpAggregator.getInstance().executeTool(...)` directly on the target server, and synthesizes the result into formatted Markdown streamed to the client.

### B. Workspace Frontend (`savazai-console/src/components/chat-workspace.tsx`)
- **Explicit Mode Passing**:
  - `streamFromBackend` now receives `mode: executionTarget === "mcp" ? "direct-mcp" : "published-flow"` and `selectedMcpServers: Array.from(activeTools)`.
- **System Trace Decoupling**:
  - When in `executionTarget === "mcp"`, initial traces log `Direct MCP Mode: Routing tool queries to active servers: [serverNames]` instead of `Supervisor Node: Routing message through agent graph`.
  - Added real-time tool execution trace logging when `event.type === "tool"` or `event.type === "trace"`.
- **HITL Card Guard**:
  - Guarded the card render condition: `{pendingInterrupt && executionTarget === "agentflow" && (` ensuring the approval card NEVER appears in Direct MCP mode.
- **Domain-Agnostic Placeholders**:
  - Replaced the catering placeholder with a universal example: `Type execution parameters or instructions here (e.g. date: 2026-10-09, symbol: INFY)...`.
- **Active Servers Status Pill**:
  - Bottom pill shows: `1 MCP Server Active: <name>` when 1 server is selected, or `<count> MCP Servers Active`.

### C. Stream Client (`savazai-console/src/lib/stream-client.ts`)
- Updated `streamFromBackend` signature to accept optional `mode?: string` and `selectedMcpServers?: string[]`, including them in the JSON payload sent to `/api/chat`.

## 3. End-to-End Verification Proofs

### Test 1: Direct MCP Chat with `nse-bhavcopy` (Stock Market Query)
```powershell
$b = @{
  message = 'Get the top 10 most actively traded NSE stocks on October 9th 2026, sorted descending. Sort by volume';
  mode = 'direct-mcp';
  activeTools = @('nse-bhavcopy');
  selectedMcpServers = @('nse-bhavcopy');
} | ConvertTo-Json -Compress;
Invoke-RestMethod -Uri 'http://localhost:3056/api/chat' -Method Post -Body $b -ContentType 'application/json'
```
**Live Output Log**:
```text
data: {"type":"trace","content":"[Direct MCP] Provider: openai (gpt-4o-mini) | Servers: [nse-bhavcopy]"}
data: {"type":"trace","content":"[Direct MCP] Bound 21 tool(s) from [nse-bhavcopy]"}
data: {"type":"trace","content":"[Direct MCP] Evaluating query with model gpt-4o-mini..."}
data: {"type":"tool","node":"Tool: get_top_by_volume","content":"Invoking get_top_by_volume on server \"nse-bhavcopy\" with parameters: {\"date\":\"2026-10-09\",\"n\":10,\"sortBy\":\"volume\"}"}
data: {"type":"trace","content":"[Direct MCP] Tool get_top_by_volume returned 1262 chars of output"}
data: {"type":"trace","content":"[Direct MCP] Synthesizing final answer from tool output..."}
data: {"type":"content","content":"Here are the top 10 most actively traded NSE stocks on October 9, 2026, sorted by volume in descending order:\n\n| Rank | Symbol | Volume | Traded Value | Close Price | Percentage Change | Series |\n|---|---|---|---|---|---|---|\n| 1 | PCJEWELLER | 895,898,449 | ₹13,091,050,519 | ₹14.81 | 6.55% | EQ |\n| 2 | MONEYVIEW | 450,972,326 | ₹27,312,292,006 | ₹62.39 | 7.77% | EQ |\n| 3 | IDEA | 253,450,627 | ₹3,290,828,401 | ₹13.00 | 1.56% | EQ |..."}
data: [DONE]
```
✅ **Result**: No supervisor node, no HITL plan approval card, no wedding parameters. Direct function call to `get_top_by_volume` and clean Markdown table returned directly.

### Test 2: Direct MCP Chat with No Server Selected
```powershell
$b = @{
  message = 'Hello';
  mode = 'direct-mcp';
  activeTools = @();
  selectedMcpServers = @();
} | ConvertTo-Json -Compress;
Invoke-RestMethod -Uri 'http://localhost:3056/api/chat' -Method Post -Body $b -ContentType 'application/json'
```
**Live Output Log**:
```text
data: {"type":"content","content":"⚠️ **No MCP Server Selected**\n\nPlease select an active MCP server from the dropdown above to execute queries and retrieve data."}
data: [DONE]
```
✅ **Result**: Informative user guidance streamed immediately without errors.

### Test 3: Published Agentflow Mode with Plan-First HITL Approval
```powershell
$b = @{
  message = 'Provide list of guests for my wedding and the RSVP Status';
  workflowId = 'c845b1ae-1352-4a4e-95e6-3d2f41de2948';
  executionMode = 'plan_first';
} | ConvertTo-Json -Compress;
Invoke-RestMethod -Uri 'http://localhost:3056/api/chat' -Method Post -Body $b -ContentType 'application/json'
```
**Live Output Log**:
```json
{
  "status": "PAUSED_AWAITING_HUMAN_APPROVAL",
  "executionPlan": [
    {
      "nodeId": "node-worker-ab232f7a-f158-4b17-9d02-75cb1b01e700",
      "targetNode": "Wedding Guest Worker",
      "actionVerb": "LIST",
      "allowedVerbs": ["LIST"],
      "targetEntity": "Guests"
    }
  ],
  "planSummary": "### Proposed Execution Plan\n\n**Step 1: Wedding Guest Worker**\n• **Action**: Fetch and analyze Guests records...",
  "message": "Execution paused for human approval at Supervisor Agent."
}
```
✅ **Result**: Published agentflow maintains full multi-agent compilation, supervisor planning, and Plan-First HITL card approval behavior.

## 4. Code Quality & Invariants Compliance
- **Root Workspace Typecheck**: `npx tsc --noEmit` exited `0` (clean).
- **Console Workspace Typecheck**: `npx tsc --noEmit` exited `0` (clean).
- **Production Build**: `npm run build` in `savazai-console` exited `0` (clean).
- **Knowledge Graph Synchronization**: `graphify update .` completed with `Rebuilt: 5330 nodes, 6878 edges, 454 communities`.
- **Zero Domain Hardcoding**: All MCP endpoints, tool names, schemas, and provider keys resolved dynamically at runtime.
