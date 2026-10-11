# PROMPT: Fix Capability Studio Zod Validation Schema, Eliminate Hardcoding, and Formalize DevPlans / Graphify Rules in AGENTS.md

## Problem Statement
When saving or publishing a draft in Capability Studio (`http://localhost:3056/studio`), particularly for flows containing Agent Teams, custom tools, or external MCP tools (such as "Wedding Planning with Local Search"), the backend rejects the canvas definition with a `400 Bad Request` Zod validation error:

```json
{
  "error": "Invalid canvas definition",
  "details": [
    {"received": "custom", "code": "invalid_enum_value", "options": ["native", "mcp"], "path": ["nodes", 1, "tools", 6, "category"], "message": "Invalid enum value. Expected 'native' | 'mcp', received 'custom'"},
    {"received": "open", "code": "invalid_enum_value", "options": ["native", "mcp"], "path": ["nodes", 2, "tools", 4, "category"], "message": "Invalid enum value. Expected 'native' | 'mcp', received 'open'"},
    {"received": "custom", "code": "invalid_enum_value", "options": ["native", "mcp"], "path": ["nodes", 5, "tools", 7, "category"], "message": "Invalid enum value. Expected 'native' | 'mcp', received 'custom'"},
    {"code": "invalid_type", "expected": "object", "received": "undefined", "path": ["nodes", 8, "modelConfig"], "message": "Required"}
  ]
}
```

## Root Causes
1. **Rigid Tool Category Enum**:
   The backend Zod schema (`ToolReferenceSchema` in `src/core/schemas.ts`) strictly enums `["native", "mcp"]`, rejecting dynamic tools marked as `"custom"`, `"open"`, `"builtin"`, `"api"`, `"database"`, or external MCP providers.
2. **Missing `modelConfig` on Container / Team Nodes**:
   `AgentNodeSchema` strictly required `modelConfig: ModelConfigSchema`. When `TeamNode` or lightweight container nodes are added to the canvas, `modelConfig` is omitted or undefined, causing schema rejection.
3. **Pervasive Hardcoding & Serialization Fragility**:
   Tool category definitions and validation were overly rigid, and canvas serialization lacked a defensive sanitization pipeline to normalize model configs and tool categories before dispatch.
4. **Governance Incompleteness**:
   The `AGENTS.md` rules need formalization for DevPlans lifecycle tracking (`/devplans/PROMPT_*.md`, `PLAN_*.md`, `WALKTHROUGH_*.md`), mandatory knowledge graph updates with `graphify update .`, and strict zero-hardcoding policies.

## Objectives
1. Make backend and frontend Zod schemas open and extensible for tool categories (`z.string().default("mcp")`).
2. Make `modelConfig` optional with a safe default fallback (`{ provider: 'openai', model: 'gpt-4o-mini', temperature: 0.2 }`), and support team container nodes without mandatory LLM configuration.
3. Implement `sanitizeCanvasDefinition` in `savazai-console/src/lib/agentflow-utils.ts` and integrate it into pre-save and publish pipelines.
4. Formalize DevPlans rules, Graphify knowledge graph updates, and zero-hardcoding policies in `AGENTS.md` and `README.md`.
5. Pass all quality gates: `npx tsc --noEmit`, `npm run build`, compiler test suite, `graphify update .`, and Docker container restart.
