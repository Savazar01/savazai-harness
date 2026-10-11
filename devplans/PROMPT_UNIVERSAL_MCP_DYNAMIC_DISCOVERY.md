# PROMPT: Universal Dynamic MCP Engine, Server Discovery Fix & Zero-Hardcoding Architecture

## Problem Statement
In Capability Studio (`localhost:3056/studio`), opening the Agent Inspector -> MCP Servers tab for `wedplanai-prod` collapses into a single fallback dummy wrapper:
- Tool: `wedplanai-prod_query`
- Description: "Automated query dispatch tool for configured endpoint wedplanai-prod"
- Category: "mcp"

Whereas on production (`savazai-harnessin.savazar.com/studio`), `wedplanai-prod` cleanly enumerates all 19 granular domain tools:
- `get_wedding`
- `create_wedding`
- `update_wedding`
- `list_guests`
- `create_guest`
- `update_guest`
- `delete_guest`
- `list_tasks`
- `create_task`
- `update_task`
- `delete_task`
- `list_ceremonies`
- `create_ceremony`
- `update_ceremony`
- `delete_ceremony`
- `list_vendors`
- `create_vendor`
- `update_vendor`
- `delete_vendor`

## Error Traces & Root Causes
1. **Fallback Dummy Wrapper Creation**:
   In `savazai-console/src/lib/mcp/client-aggregator.ts`, when SDK or direct queries fail, lines 308-318 silently synthesize:
   `{ name: \`${serverId}_query\`, description: \`Automated query dispatch tool for configured endpoint \${serverId}\` }`.
   This masks the real error and leaves agents with a useless fallback.
2. **Transport Mismatch**:
   `getOrCreateClient` defaulted to `SSEClientTransport` when `transport` was unspecified. But the remote endpoint (`https://wedplanai-in.savazar.com/api/mcp`) is a Streamable HTTP / JSON-RPC 2.0 endpoint (returning `application/json`, not `text/event-stream`), which fails under `SSEClientTransport` with `SSE error: Invalid content type, expected "text/event-stream"`.
   When tested with `StreamableHTTPClientTransport`, the endpoint immediately succeeds and returns all 19 granular tools!
3. **Double Nesting in `readServerConfigs`**:
   The configuration in `system_configurations.design_tokens.mcpServers` can have varied or nested JSON structures (`mcpServers.wedplanai-prod.mcpServers.wedplanai-prod` or `{ mcpServers: { ... } }`). A recursive normalizer is needed to robustly extract server entries regardless of nesting depth.
4. **Hardcoded Fallback References**:
   Line 202 in `client-aggregator.ts` had a hardcoded server ID `"wedplanai-prod"`.
   In `api/mcp/route.ts`, `MCP_SERVERS_TOOLS` hardcoded tools instead of keeping schemas dynamic.

## Objectives
1. Eliminate `<serverId>_query` dummy tool synthesis completely.
2. Implement auto-detect / resilient multi-transport fallback in `client-aggregator.ts`: try `StreamableHTTPClientTransport` if SSE fails or default to Streamable HTTP, with JSON-RPC POST fallback.
3. Recursively extract server configurations regardless of JSON nesting depth.
4. Ensure zero hardcoded server names or tool categories in the engine.
5. Pass all quality gates (`npx tsc --noEmit`, Next.js build, `graphify update .`, Docker restart).
