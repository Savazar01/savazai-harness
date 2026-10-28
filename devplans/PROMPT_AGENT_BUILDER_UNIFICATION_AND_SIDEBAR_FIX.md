# PROMPT: Standardize Agent Builder to Full Agent Inspector, Ingest Existing Flow Agents to Catalog, and Fix Collapsible Sidebar Restore Trigger

## 1. Problem Analysis & Screenshot Defect Diagnosis

Based on the operational screenshots (`media_1793162096579_bc209b21.png`, `media_1793162156929_4233a77e.png`, `media_1793162328143_c31f1db4.png`, `media_1793162661763_c9e374cf.png`), three critical deficiencies must be addressed:

### 🔍 Defect 1: Divergent Agent Creation Modals (`media_1793162096579_bc209b21.png` vs `media_1793162328143_c31f1db4.png`)
- In Agent Builder Hub, clicking `[ + Create Agent ]` opens a truncated modal (`agent-editor-modal.tsx`) containing only basic identity, model, and prompt fields.
- It completely misses the rich 8-tab configuration architecture of the standard `AgentDrawer` / `AgentInspector`:
  1. `IDENTITY` (Role template, color theme, lock policy)
  2. `NATIVE & CUSTOM TOOLS`
  3. `EXTERNAL DATABASES`
  4. `SOCIAL MEDIA`
  5. `MCP SERVERS`
  6. `KNOWLEDGE` (Skills & OKF Concepts)
  7. `MEMORY & HISTORY`
  8. `GUARDRAILS`
- **Requirement**: Unify agent authoring into a canonical multi-tab `AgentDrawer` / `AgentInspector` that operates seamlessly in both canvas mode (`flow_node`) and standalone mode (`standalone_builder`).

### 🔍 Defect 2: Missing Ingestion of Pre-Existing Flow Agents (`media_1793162156929_4233a77e.png`)
- The Agent Catalog & Builder Hub displays `Total Catalog: 0` and `No Agents Found`.
- Pre-existing Agentflows (e.g., "Wedding Planning with Local Search" containing Supervisor, Guest Worker, Ceremonies Worker, Tasks Worker, Vendor Worker, Details Worker, Web & Places Specialist, Synthesizer) have not been automatically indexed into `agents_catalog`.
- **Requirement**: Auto-sync existing flow agents on initial mount or when catalog is empty, and ensure the `[ Sync from Flows ]` button indexes and displays active flow usage badges (e.g. `Used in 1 Agentflow`).

### 🔍 Defect 3: Collapsible Sidebar Restore Trigger Trapped (`media_1793162661763_c9e374cf.png`)
- When the sidebar is collapsed in `sidebar.tsx`, the collapse/expand trigger is obscured or clipped by the page container overflow (`overflow-hidden`), forcing horizontal scrolling to restore navigation.
- **Requirement**: Render a fixed floating trigger (`PanelLeftOpen` / `ChevronRight`) docked at `fixed top-3 left-3 z-50` when collapsed, visible in both light and dark modes with zero horizontal scrolling required.
