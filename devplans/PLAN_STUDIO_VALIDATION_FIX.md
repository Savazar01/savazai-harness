# IMPLEMENTATION PLAN: Fix Capability Studio Zod Validation Schema, Eliminate Hardcoding, and Formalize DevPlans / Graphify Rules in AGENTS.md

## 1. Architectural Scope & Target Files

### File 1: Backend Core Schemas (`src/core/schemas.ts`)
- Replace rigid `z.enum(["native", "mcp"])` with `ToolCategorySchema = z.string().default("mcp")`.
- Enhance `ToolReferenceSchema` with open string category, `.passthrough()`, and optional fields.
- Make `ModelConfigSchema` permissive and resilient with defaults (`provider: "openai"`, `model: "gpt-4o-mini"`, `temperature: 0.2`) and preprocess handling for undefined/null.
- Enhance `AgentNodeSchema` to support optional `modelConfig`, team nodes (`roleTemplate: "team"`), visual hierarchy properties (`parentId`, `collapsed`, `customColor`, `width`, `height`, `x`, `y`, `data`), and `.passthrough()`.
- Add `.passthrough()` and default array for edges on `CanvasDefinitionSchema`.

### File 2: Backend Compiler & Handler Extensions (`src/core/compiler.ts`)
- Add support for `roleTemplate === "team"` in `createNodeHandler` by routing to `createTeamHandler(node)`.
- Implement `hitlPolicy` evaluation (`"always"`, `"on_delete"`, `"on_mutate"`) in `createWorkerHandler` so that compiler unit tests pass cleanly.

### File 3: Console Validation Schema (`savazai-console/src/lib/validations/canvas.ts`)
- Author a dedicated, canonical Zod canvas validator for the console that matches the open backend schema specification.
- Export `toolCategorySchema`, `modelConfigSchema`, `agentNodeSchema`, `canvasEdgeSchema`, and `canvasDefinitionSchema`.

### File 4: Canvas Sanitization & Serialization (`savazai-console/src/lib/agentflow-utils.ts`)
- Implement `sanitizeCanvasDefinition(def: CanvasDefinition): CanvasDefinition`:
  - Ensure all nodes have safe `modelConfig` fallback (or undefined for container team nodes).
  - Normalize tool categories to valid non-empty strings (defaulting to `"mcp"`).
  - Cleanly preserve node IDs, parent references, layout dimensions, and custom colors.

### File 5: Canvas Editor & Studio Integration (`savazai-console/src/components/studio/canvas-editor.tsx` and `savazai-console/src/app/studio/page.tsx`)
- Update `ToolReference` interface to permit open string category.
- Apply `sanitizeCanvasDefinition` before saving drafts or compiling/publishing.
- Ensure human-readable error formatting in toast notifications if validation errors ever occur.

### File 6: Governance, Standards & Knowledge Graph (`AGENTS.md` & `README.md`)
- Add Rule 10 to `AGENTS.md`:
  - **DevPlans Workflow Rule**: Strict mandatory creation of `/devplans/PROMPT_<TASK>.md`, `/devplans/PLAN_<TASK>.md`, and `/devplans/WALKTHROUGH_<TASK>.md`.
  - **Knowledge Graph Synchronization**: Mandatory `graphify update .` execution.
  - **Zero-Hardcoding Policy**: Universal schema-driven dynamic tool, model, and category resolution.
- Update `README.md` with Capability Studio schema resilience, universal MCP compatibility, and DevPlans standards.

---

## 2. Test & Verification Plan

1. **Unit Testing**:
   - Run `npx tsx src/core/__tests__/compiler.test.ts` to verify schema validation and graph compilation tests pass 100%.
2. **Typecheck & Build Verification**:
   - `npx tsc --noEmit` across root and console workspaces.
   - `cd savazai-console && npm run build` to verify Next.js production build passes without warnings/errors.
3. **Knowledge Graph Synchronization**:
   - `graphify update .` to update the repository code graph.
4. **Container Stack Verification**:
   - Restart stack via `docker compose down && docker compose up --build -d`.
   - Verify `docker compose ps` shows all services healthy.
5. **Document Completion**:
   - Complete `/devplans/WALKTHROUGH_STUDIO_VALIDATION_FIX.md` with full execution log and verification proofs.
