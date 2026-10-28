# WALKTHROUGH: System Prompt Version Tracking, Standalone Agent Builder & Reusable Agent Palette Discovery

## 1. Executive Summary
This architectural enhancement addresses three critical operational needs:
1. **System Prompt Revision Audit Tracking**: Fixed prompt revision capture on agent edit, save draft, and publish in Capability Studio, populating the Governance Hub ledger with agent name, agent role, flow title, characters, and visual diff inspection.
2. **Dedicated Standalone "Agent Builder" Hub (`agents_catalog`)**: Enabled independent authoring, configuration, versioning, and cataloging of agents with enterprise lock policies, usage counters across workflows, and sync capabilities.
3. **Reusable Agent Palette in Capability Studio**: Introduced a 2-tab palette (`Archetypes` vs `Catalog`) enabling operators to search, filter, and drag pre-configured catalog agents onto the canvas with visual enterprise lock badges and fork/detach ergonomics.

---

## 2. Changes Breakdown

### A. Database Schemas & Persistence
- **Enhanced Table `prompt_revisions`** (`src/db/schema.ts` and `savazai-console/src/lib/auth.ts`):
  - Added columns: `agent_name`, `agent_role`, `agentflow_title`, `change_summary`, `prompt_length_chars`.
  - Added indexes on `agent_id`, `agentflow_id`, and `created_at`.
- **Created Table `agents_catalog`** (`src/db/schema.ts` and `savazai-console/src/lib/auth.ts`):
  - Columns: `id`, `agent_key`, `name`, `role`, `description`, `llm_provider`, `model_name`, `temperature`, `system_prompt`, `bound_tools`, `bound_skills`, `bound_concepts`, `origin_type`, `origin_flow_id`, `origin_flow_title`, `is_locked`, `allow_modification_in_flow`, `created_at`, `updated_at`.
  - Added indexes on `agent_key`, `role`, and `origin_type`.

### B. Prompt Version Audit Tracking Fix
- **`savazai-console/src/lib/versioning/asset-versioner.ts`**:
  - Enhanced `RecordPromptRevisionInput` and `recordPromptRevision` to persist `agentName`, `agentRole`, `agentflowTitle`, `changeSummary`, and `promptLengthChars`.
- **`savazai-console/src/app/api/agentflows/[id]/route.ts`**:
  - Fixed prompt detection by inspecting `node.systemPrompt || node.data?.systemPrompt || node.instructions || node.data?.instructions || node.prompt || node.data?.prompt` across all nodes upon save draft or publish.
  - Automatically snapshots revised prompts into `prompt_revisions`.
- **`savazai-console/src/app/api/studio/prompt-revisions/route.ts`**:
  - Direct endpoint for real-time drawer prompt revision snapshots upon clicking [ Done Editing ] or [ Apply Configuration ].
- **`savazai-console/src/app/api/governance/audit/route.ts`**:
  - Updated `tab === "prompt_revisions"` and `action === "compare"` to return and diff `agent_name`, `agent_role`, `agentflow_title`, `change_summary`, and `prompt_length_chars`.
- **`savazai-console/src/components/governance/governance-dashboard.tsx`**:
  - Updated table headers to `Timestamp`, `Agent Name`, `Agentflow Title`, `Version #`, `Author`, `Characters`, `Actions ([ View Diff ])`.
  - Rendered agent role badges, character counts, and functional modal diff comparison between baseline and revised prompts.

### C. Standalone Agent Builder Hub
- **API Endpoints (`savazai-console/src/app/api/agents/route.ts` & `[id]/route.ts`)**:
  - `GET /api/agents`: Lists catalog agents with dynamic `usedInFlows` calculated by scanning active agentflows.
  - `POST /api/agents`: Creates agent in `agents_catalog` and snapshots prompt revision `v1`.
  - `POST /api/agents` (`action: "sync_from_flows"`): Syncs existing canvas agent nodes into the catalog.
  - `PUT /api/agents/[id]`: Updates agent, versioning prompt if changed.
  - `DELETE /api/agents/[id]`: Safely removes agent, preventing deletion if `is_locked === true`.
- **UI Components**:
  - `savazai-console/src/components/studio/agent-builder/agent-catalog-view.tsx`:
    - Metric summary cards (Total, Supervisors, Specialists, Synthesizers, Enterprise Locked).
    - Search bar, role filter chips, origin filter (`Standalone` vs `Flow Imported`), lock policy filter.
    - Responsive card grid displaying role badge, model engine, tool counts, usage badge (`Used in X Flows`), lock pill, and action buttons (`Edit`, `Clone`, `Delete`).
    - Styled delete confirmation dialog (`AlertDialog`).
  - `savazai-console/src/components/studio/agent-builder/agent-editor-modal.tsx`:
    - Full configuration modal covering Agent Identity, Model Engine parameters, System Directive Prompt with AI Assist button, Tool Bindings, and Enterprise Governance Lock switches.
- **Capability Studio Sub-View Switcher** (`savazai-console/src/app/studio/page.tsx`):
  - Top header toggle: `[ Agentflows Canvas ]` vs `[ Agent Builder Hub ]`.

### D. Reusable Agent Palette Discovery
- **`savazai-console/src/components/studio/canvas-editor.tsx`**:
  - Upgraded left palette with tab switcher: `[ Archetypes ]` vs `[ Catalog ]`.
  - Under `Catalog`: searchable list of catalog agents with role pills, model tags, and lock indicators.
  - One-click `handleAddCatalogAgent`: adds pre-configured agent to the canvas inside appropriate team containers with hydrated directives, tools, and lock state.
  - Visual lock badge rendered on canvas node header when `node.isLocked === true`.
- **`savazai-console/src/components/studio/agent-drawer.tsx`**:
  - Displays amber Enterprise Lock Notice if agent is locked: *"Enterprise Locked Agent: Directives and bindings are governed centrally."*
  - Provides `[ Detach / Fork ]` action allowing operators to clone and customize their own unlocked instance.

---

## 3. Verification & Quality Gates
- **TypeScript Compilation**: `npx tsc --noEmit` & `npx --prefix savazai-console tsc --noEmit` passed with 0 errors.
- **Theme & Contrast Linters**:
  - `npm --prefix savazai-console run lint:theme` passed with 0 violations.
  - `npm --prefix savazai-console run check:contrast` verified 16/16 presets passing WCAG AA.
- **Production Build**: `npm --prefix savazai-console run build` compiled 47 routes successfully.
- **Knowledge Graph Synchronization**: `graphify update .` successfully updated knowledge graph with 6,652 nodes and 8,743 edges.
- **Docker Stack**: Rebuilt with `docker compose up --build -d`. All 3 containers (`savazai-db`, `savazai-backend`, `savazai-console`) are healthy and operational.
