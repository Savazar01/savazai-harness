# PLAN: Standardize Agent Builder to Full Agent Inspector, Ingest Existing Flow Agents to Catalog, and Fix Collapsible Sidebar Restore Trigger

## 1. Architectural Strategy

### Workstream 1: Canonical Agent Inspector Unification
- Enhance `savazai-console/src/components/studio/agent-drawer.tsx` to support both `flow_node` mode and `standalone_builder` mode:
  ```typescript
  export interface AgentDrawerProps {
    mode?: "flow_node" | "standalone_builder";
    node: CanvasNode;
    allNodes?: CanvasNode[];
    onClose: () => void;
    onSave: (updated: CanvasNode) => void | Promise<void>;
    workflowId?: string;
    workflowName?: string;
  }
  ```
- In `standalone_builder` mode:
  - Header displays "Agent Inspector — Standalone Agent Catalog".
  - In `IDENTITY` tab, `ASSIGNED TEAM CONTAINER` displays `"Standalone / Unassigned (Assigned during flow composition)"`.
  - All 8 tabs (`IDENTITY`, `NATIVE & CUSTOM TOOLS`, `EXTERNAL DATABASES`, `SOCIAL MEDIA`, `MCP SERVERS`, `KNOWLEDGE`, `MEMORY & HISTORY`, `GUARDRAILS`) are fully active.
  - Includes enterprise governance lock switches (`isLocked`, `allowModificationInFlow`).
  - Deprecate/replace `agent-editor-modal.tsx` by using `AgentDrawer` directly in `agent-catalog-view.tsx`.
  - When saving in `standalone_builder` mode, persists directly to `/api/agents` (POST or PUT) and snapshots `prompt_revisions`.

### Workstream 2: Automated Ingestion & Live Sync of Flow Agents
- Enhance `/api/agents` and create dedicated `/api/studio/agents/sync/route.ts` (or enhance POST handler):
  - Robust parser for `agentflows.canvas_definition`:
    - Handles both stringified and object definitions.
    - Handles `nodes` of archetype types (`supervisor`, `worker`, `synthesizer`, `scheduled`, `team`).
    - Extracts `label`, `systemPrompt`, `modelConfig`, `tools`, `skills`, `okfConcepts`, `ragNamespace`, etc.
    - Generates unique `agent_key` if missing.
    - Upserts into `agents_catalog` with `origin_type = 'agentflow'`, `origin_flow_id = flow.id`, `origin_flow_title = flow.name`.
  - Auto-run on mount in `agent-catalog-view.tsx` when catalog is empty or when user clicks `[ Sync from Flows ]`.
  - Compute accurate `usedInFlows` counters and tooltip titles.

### Workstream 3: Collapsible Sidebar Fixed Restore Trigger
- Inspect `savazai-console/src/components/sidebar.tsx`:
  - When `isCollapsed === true`:
    - Render a fixed floating trigger docked at viewport `fixed top-3 left-3 z-50`.
    - Styled with semantic tokens: `bg-card text-foreground border border-border shadow-md hover:bg-muted`.
    - Click restores `setIsCollapsed(false)`.
    - Ensure no horizontal scrolling or container clipping can occlude this trigger.

---

## 2. Quality Gates & Verification Sequence
1. Workspace Typecheck: `npx tsc --noEmit` & `npx --prefix savazai-console tsc --noEmit`
2. Theme & Contrast Linters: `npm --prefix savazai-console run lint:theme` & `check:contrast`
3. Next.js Production Build: `npm --prefix savazai-console run build`
4. Knowledge Graph: `graphify update .`
5. Local Docker Container Restart & Healthcheck: `docker compose down && docker compose up --build -d`
6. Verification of all checklist items.
