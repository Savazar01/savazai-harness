# PROMPT: Strict Decoupling of "Direct MCP Chat" and "Published Agentflow" Modes in Agent Workspace

## 1. Problem Statement & User Bug Report
In the Agent Workspace (`/dashboard`), the user switched to **Direct MCP Chat** (`DIRECT MCP` badge displayed) and submitted the query:
> *"Get the top 10 most actively traded NSE stocks on October 9th 2026, sorted descending. Sort by 'volume' (traded quantity)"*

Instead of performing a direct LLM function call against the selected MCP server (`nse-bhavcopy`), the system exhibited severe architectural coupling:
1. **Unwanted LangGraph Orchestrator Execution**:
   - The query was routed through the default LangGraph multi-agent orchestrator (`supervisorNode`).
   - The System Trace sidebar displayed: `Supervisor Node: Routing message through agent graph` followed by `supervisorNode: Execution paused awaiting user approval`.
2. **Inappropriate HITL Approval Card & Leaked Domain State**:
   - The UI popped up the `EXECUTION PLAN APPROVAL REQUIRED` card.
   - The parameter input card contained wedding-specific placeholder examples: `(e.g. Vendor Name: Catering Co, Category: Catering)`.
   - Wedding domain prompts and tools leaked into an NSE stock market inquiry.
3. **MCP Scoping / Selection Bypassed**:
   - The pill indicated `0 MCP Servers Active` even though the user had intended to query `nse-bhavcopy`.
   - Direct tool dispatch was completely bypassed.

## 2. Architectural Root Cause Analysis
1. In `savazai-console/src/app/api/chat/route.ts`:
   - When no `workflowId` is present (Direct MCP mode), the route currently proxies to `${BACKEND_URL}/api/graph/invoke/stream?stream-mode=http`.
   - On the backend (`savazai-backend` at port 3055), `/api/graph/invoke/stream` invokes the default `compiledGraph` with `supervisorNode`.
   - `supervisorNode` defaults to `plan_first` mode if `executionMode` is unset or inherited.
   - This causes `generateExecutionPlanFromTools` to run and emit `interrupt({ plan, status: "WAITING_USER_APPROVAL" })`, dragging Direct MCP chats through the full Supervisor LangGraph pipeline.
2. In `savazai-console/src/components/chat-workspace.tsx`:
   - `streamFromBackend` was not passing an explicit `mode: "direct-mcp"`.
   - The UI trace logger unconditionally logged `Supervisor Node: Routing message through agent graph` regardless of `executionTarget`.
   - `pendingInterrupt` was rendered whenever set, without checking if the mode is `direct-mcp`.
   - The parameter box placeholder was hardcoded with wedding catering samples.

## 3. Scope of Fix
1. **Mode 1: Published Agentflows (`mode === "published-flow"` / `workflowId` present)**:
   - Preserved exactly as unified with `/api/orchestrator/test/route.ts`.
   - Uses Supervisor -> Specialist Workers -> Synthesizer -> Plan-First HITL Approval Card when required.
2. **Mode 2: Direct MCP Chat (`mode === "direct-mcp"` / `executionTarget === "mcp"`)**:
   - NO Supervisor Node.
   - NO Plan-First HITL Approval Card.
   - NO Wedding prompts or synthetic plan steps.
   - Direct LLM function calling loop with OpenAI / Gemini model.
   - Only binds tools from explicitly selected MCP server(s) (`activeTools` / `selectedMcpServers`).
   - Dispatches JSON-RPC 2.0 calls directly to the MCP server endpoint (e.g., `nse-bhavcopy` at `https://mcp.nseindia.in/bhavcopy/cm/mcp`).
   - Streams formatted Markdown responses directly to the user's chat window.
