# PROMPT: Fix System Prompt Version Audit Tracking, Standalone Agent Builder Hub & Reusable Agent Palette Discovery

## Context & Objectives
Based on operational testing and customer requests:
1. **Broken System Prompt Audit Tracking**:
   - In Capability Studio, editing an agent's System Directive Prompt and saving/publishing fails to record revisions in **Governance -> System Prompt Versions** (`/admin/governance`).
   - The ledger displays "No records found".
   - The audit log requires accurate agent name, agent role, flow title, character count, author, version number, and visual diff viewer.

2. **Standalone "Agent Builder" Hub & Universal Agent Registry**:
   - Enable independent authoring, configuration, versioning, and cataloging of agents outside of individual flow graphs.
   - Persist in `agents_catalog` database table with enterprise lock policies (`isLocked`, `allowModificationInFlow`).
   - Provide Studio tab navigation: `[ Agentflows ]` vs `[ Agent Builder ]`.
   - List agents with search, role filters, flow usage counter, origin badges (`Standalone` vs `Imported`), and action buttons (Create, Edit, Clone, Delete).

3. **Capability Studio Palette: Searchable Reusable Agent Selector**:
   - In `agent-palette.tsx`, provide tabs: `[ Node Types ]` and `[ Existing Agents ]`.
   - Search filter across existing catalog agents with role pills.
   - Drag-and-drop hydrated agent nodes onto the ReactFlow canvas.
   - Support enterprise locked agents: render lock pill/icon, enforce locked read-only state in `agent-drawer.tsx` with a `[ Detach / Fork Agent ]` action.
