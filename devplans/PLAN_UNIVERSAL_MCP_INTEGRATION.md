# IMPLEMENTATION PLAN: Universal MCP Aggregator Engine & Server Diagnostic Recovery

## 1. Objectives & Architectural Overview
Transform the SavazAI harness from hardcoded internal MCP tool definitions into an extensible, schema-driven Universal MCP Aggregator Engine. 
The system must support multi-transport connections (SSE, HTTP Streamable/JSON-RPC, Stdio, and Internal handlers) across heterogeneous MCP providers (WedPlanAI, NSE India Bhavcopy/Market, BSE, etc.), maintaining AGENTS.md purity rules (zero hardcoded domain logic in orchestrator core).

## 2. Diagnostics Findings (Phase 1)
- Container Status: All three containers (`savazai-db`, `savazai-backend`, `savazai-console`) are running and healthy.
- Port `3056`: HTTP probe to `http://127.0.0.1:3056` returns HTTP 200 OK.
- Runtime log inspection: Previous runs had tool lookup issues where `list_weddings` was requested against remote `https://wedplanai.savazar.com/api/mcp` which returned error or text instead of JSON, showing the need for robust error handling, schema caching, and transport isolation in the aggregator.

## 3. Component Design & Target Files

### A. Dependencies (`savazai-console/package.json`)
- Install `@modelcontextprotocol/sdk`.

### B. Universal MCP Client Aggregator (`savazai-console/src/lib/mcp/client-aggregator.ts`)
- Interface `McpServerConfig`:
  - `url` or `serverUrl`
  - `transport`: `"sse"` | `"streamable-http"` | `"http"` | `"stdio"` | `"internal"`
  - `headers`: Record<string, string>
  - `active` / `disabled`: boolean
- Singleton `McpAggregator`:
  - `readConfig(pool: Pool)`: Parse `mcpServers` from `system_configurations.design_tokens`.
  - Client connection pooling and caching.
  - Multi-transport handlers:
    - `@modelcontextprotocol/sdk/client/sse.js` (`SSEClientTransport`)
    - Streamable HTTP / JSON-RPC fallback
    - Internal tool definitions (`wedplanai` local database operations)
  - `listAllTools(pool: Pool)`: Aggregates tools across all configured servers, tagging each tool with `serverId` and schema properties.
  - `executeTool(serverId: string | undefined, toolName: string, args: Record<string, unknown>, pool: Pool)`: Routes tool invocation to the correct remote server or local handler, handling timeouts and error payloads cleanly.

### C. Unified MCP Route (`savazai-console/src/app/api/mcp/route.ts`)
- `GET`: Discover configured servers and dynamic tools using `McpAggregator.listAllTools()`.
- `POST`: Handle `tools/list` (returning all aggregated tools) and `tools/call` (invoking `McpAggregator.executeTool()`).

### D. Orchestrator Engine Hydration & Execution (`savazai-console/src/app/api/orchestrator/test/route.ts`)
- Update `hydrateMcpSchemas()` to query `McpAggregator.listAllTools()` or dynamically load tools across active configured external MCP servers.
- Update `runMcpToolWithResilience()` to delegate tool execution to `McpAggregator.executeTool()`.
- Ensure supervisor planning and worker graph receive live schemas without domain hardcoding.

## 4. Verification Sequence
1. `npm install @modelcontextprotocol/sdk` in `savazai-console`
2. Run TypeScript check: `npx tsc --noEmit`
3. Run Console build: `npm run build` in `savazai-console`
4. Rebuild & launch containers: `docker compose up --build -d`
5. Verify health & endpoints (`http://localhost:3056`, `/api/mcp`)
6. Test external MCP server aggregation and dynamic schema hydration
7. Update Walkthrough tracking in `/devplans/WALKTHROUGH_UNIVERSAL_MCP_INTEGRATION.md`
