# PLAN: Fix Agent Workspace Zero-Tool Hydration & Dynamic Tool Enumeration for Direct MCP Mode

## 1. Problem Statement & Root Cause
From screenshot `media_1791727599623_7c97cc10.png`:
- The header badge indicated `MCP: nse-bhavcopy (0 tools)`.
- The dropdown popup showed `0 granular tools registered` for both `nse-bhavcopy` and `cm-market`.
- When the user requested to list available tools for the MCP, the assistant produced a single fallback summary for `nse-bhavcopy` because `Bound 0 tool(s)` were registered.
- Root Cause:
  1. `mcp.nseindia.in` is an external remote endpoint subject to transient network latency.
  2. In `client-aggregator.ts`, when discovery failed or timed out, it cached `tools: []` for 60 seconds (`this.schemaCache`), locking in `0 tools`.
  3. No persistent schema fallback existed for `nse-bhavcopy` (21 tools) or `cm-market` (15 tools) in the aggregator catalog fallback.

## 2. Architectural Solution
1. **Catalog & Fallback Registry in `McpAggregator` and `/api/mcp`**:
   - Registered full tool signatures with exact schemas and descriptions for all 21 `nse-bhavcopy` tools (`get_top_by_volume`, `get_top_movers`, `nse_lookup_symbol`, `get_market_mood`, `get_index_valuation`, `get_market_breadth`, `get_corporate_actions`, `get_ltp_by_date`, `get_bulk_quote`, `get_volume_analysis`, `get_stock_history`, `moving_average`, `get_52_week_high_low`, `get_index_snapshot`, `search_symbols`, `get_stock_vs_index`, `compare_stocks`, `get_index_history`, `get_index_performance`, `get_index_movers`, `compare_indices`).
   - Registered all 15 `cm-market` tools (`cm_get_live_stock`, `cm_get_index_quote`, `cm_get_option_chain`, `cm_get_fii_dii`, `cm_get_market_turnover`, etc.).
   - If live discovery fails or returns 0 tools, fallback automatically hydrates the full tool definitions.
2. **Never Cache Empty Arrays for Configured Servers**:
   - `McpAggregator.listAllTools` preserves prior known schemas if live polling fails.
3. **Direct MCP Chat Binding Invariant**:
   - In `/api/chat/route.ts`, if `boundTools.length === 0` for an active server, trigger an immediate schema cache reload with catalog fallback so `boundTools` is always populated with the 21 tools before querying the LLM.
4. **Verification & Quality Gates**:
   - `GET /api/mcp` confirms `nse-bhavcopy` returns 21 tools and `cm-market` returns 15 tools.
   - Direct MCP tool listing query yields full enumeration of all 21 tools.
   - Direct MCP stock query calls `get_top_by_volume` and formats live markdown table.
   - Run `npx tsc --noEmit` and `npm run build`.
   - Update knowledge graph via `graphify update .`.
