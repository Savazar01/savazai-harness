# PROMPT: Universal MCP Aggregator Engine & Server Diagnostic Recovery

## User Request Summary
The user requested implementing a Universal MCP Aggregator Engine & Server Diagnostic Recovery for the SavazAI Business Harness codebase:

1. **DevPlans Framework Initialization**:
   - Track prompt in `/devplans/PROMPT_UNIVERSAL_MCP_INTEGRATION.md`
   - Track plan in `/devplans/PLAN_UNIVERSAL_MCP_INTEGRATION.md`
   - Track walkthrough in `/devplans/WALKTHROUGH_UNIVERSAL_MCP_INTEGRATION.md`

2. **Phase 1: Local Server Diagnostic & Error Recovery (`localhost:3056`)**:
   - Check status and logs of running containers (`savazai-console`, `savazai-backend`, `savazai-db`).
   - Diagnose any runtime/container issues and verify `http://localhost:3056` responds with HTTP 200.

3. **Phase 2: Root Cause Analysis — MCP Tool Isolation**:
   - Understand why external MCP servers (such as NSE MCP: `https://mcp.nseindia.in/bhavcopy/cm/mcp`, `https://mcp.nseindia.in/cmmkt/mcp`, or community `nse-bse-mcp`) configured in Command Center get ignored while console continues returning only static WedPlanAI tools.
   - Root cause: `/api/mcp` and LangGraph execution loop are statically wired to internal local tool schemas rather than dynamically aggregating tools from configured external MCP transports (SSE, HTTP streamable, stdio, internal).

4. **Phase 3: Technical Implementation — Universal MCP Client Aggregator**:
   - Target files:
     - `savazai-console/package.json` (install `@modelcontextprotocol/sdk`)
     - `savazai-console/src/lib/mcp/client-aggregator.ts` (NEW universal multi-transport aggregator)
     - `savazai-console/src/app/api/mcp/route.ts` (use aggregator for `tools/list` and `tools/call`, plus GET server listing)
     - `savazai-console/src/app/api/orchestrator/test/route.ts` (hydrate schemas and execute tools dynamically using aggregator)

5. **Verification & Validation**:
   - Typecheck & build: `npx tsc --noEmit` and `cd savazai-console && npm run build`
   - Local stack restart with Docker Compose
   - Validate `http://localhost:3056`
   - Configure external MCP servers and confirm tools dynamically hydrate and execute in the orchestrator pipeline.
