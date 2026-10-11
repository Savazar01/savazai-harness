# PLAN: Universal Dynamic MCP Engine, Server Discovery Fix & Zero-Hardcoding Architecture

## Architectural Specification

### 1. Robust Server Config Normalization
In `savazai-console/src/lib/mcp/client-aggregator.ts`:
- Implement a recursive extraction helper `normalizeMcpServersConfig(raw: unknown)`:
  - Handles string JSON parsing or object structure.
  - Recursively traverses nested `mcpServers` envelopes (handling arbitrary nesting levels).
  - Identifies genuine server config nodes (which possess `serverUrl`, `url`, `command`, or `type/transport === 'internal'`).
  - Returns a clean dictionary `Record<string, McpServerConfigEntry>` with active/disabled flags and resolved URLs/headers.

### 2. Multi-Transport Client Creation & Auto-Detection
- When a server config specifies `transport === "streamable-http"` or `"http"`, instantiate `StreamableHTTPClientTransport`.
- When `transport === "stdio"`, instantiate `StdioClientTransport`.
- When unspecified or `"sse"`:
  - Try `StreamableHTTPClientTransport` first or attempt `SSEClientTransport` with immediate fallback to `StreamableHTTPClientTransport`.
  - Also maintain a direct JSON-RPC 2.0 `tools/list` HTTP POST fallback if SDK transports fail.

### 3. Complete Elimination of Fallback Dummy Wrapper
- Remove the synthetic tool generator:
  ```typescript
  // REMOVE:
  {
    name: `${serverId}_query`,
    description: `Automated query dispatch tool for configured endpoint ${serverId}`,
    ...
  }
  ```
- If an MCP server cannot be reached, return a clean empty tool list or log a structured diagnostic, NEVER synthesizing dummy `<serverId>_query` tools that pollute the UI and agent planning.

### 4. Remove Hardcoded Server Names
- Remove `const sid = t.serverId || "wedplanai-prod";` in `client-aggregator.ts`, replacing it with `t.serverId || "default"`.
- Clean up any domain-specific hardcoding across aggregator routines.

### 5. Verification & Testing Strategy
1. Unit/Integration testing via Node script: query `GET /api/mcp` and ensure `wedplanai-prod` returns all 19 granular tools (`get_wedding`, `create_wedding`, `list_guests`, etc.) and ZERO `wedplanai-prod_query` tools.
2. Verify Tool Execution via POST to `/api/mcp` with `tools/call`.
3. Quality Gates:
   - `npx tsc --noEmit`
   - `cd savazai-console && npm run build && cd ..`
   - `graphify update .`
   - Docker container restart & health check.
