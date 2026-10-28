# PLAN: Fix System Prompt Version Audit Tracking, Standalone Agent Builder Hub & Reusable Agent Palette Discovery

## 1. Schema & Database Persistence
- **Table `prompt_revisions`**:
  - Add missing columns if not exists: `agent_name`, `agent_role`, `agentflow_title`, `change_summary`, `prompt_length_chars`.
  - Update `savazai-console/src/lib/auth.ts` table initialization.
  - Update `src/db/schema.ts` definition.
- **Table `agents_catalog`**:
  - Define schema: `id`, `agentKey`, `name`, `role`, `description`, `llmProvider`, `modelName`, `temperature`, `systemPrompt`, `boundTools`, `boundSkills`, `boundConcepts`, `originType`, `originFlowId`, `originFlowTitle`, `isLocked`, `allowModificationInFlow`, `createdAt`, `updatedAt`.
  - Add idempotent bootstrap in `savazai-console/src/lib/auth.ts` and `src/db/schema.ts`.

## 2. System Prompt Version Audit Tracking Fix
- **Backend / API**:
  - Update `savazai-console/src/lib/versioning/asset-versioner.ts`: record prompt revision with `agentName`, `agentRole`, `agentflowTitle`, `changeSummary`, `promptLengthChars`.
  - In `savazai-console/src/app/api/agentflows/[id]/route.ts`:
    - In `PUT`, iterate nodes in `canvasDefinition.nodes`.
    - Check if `node.data.systemPrompt` or `node.data.instructions` has been modified compared to previous version.
    - Snapshot revision records using `recordPromptRevision`.
  - Also provide direct endpoint `savazai-console/src/app/api/studio/prompt-revisions/route.ts` for instant drawer snapshotting when clicking [ Done Editing ] or [ Apply Configuration ].
- **Frontend / Governance Hub**:
  - In `savazai-console/src/app/api/governance/audit/route.ts`: fetch enhanced columns (`agent_name as "agentName"`, `agent_role as "agentRole"`, `agentflow_title as "agentflowTitle"`, `change_summary as "changeSummary"`, `prompt_length_chars as "promptLengthChars"`).
  - In `savazai-console/src/components/governance/governance-dashboard.tsx`: render table with columns: `Timestamp`, `Agent Name`, `Agentflow Title`, `Role`, `Version #`, `Author`, `Characters`, `Actions ([ View Diff ])`.
  - Ensure visual diff modal cleanly compares previous and current prompt versions.

## 3. Dedicated Standalone "Agent Builder" Hub
- **API Endpoints**:
  - `GET /api/agents`: returns all agents with usage counts (`usedInFlows` calculated from `agentflows`).
  - `POST /api/agents`: create standalone agent with validation.
  - `GET /api/agents/[id]`: retrieve single agent.
  - `PUT /api/agents/[id]`: update agent (record prompt revision if changed).
  - `DELETE /api/agents/[id]`: delete agent (safe guard if in use).
- **UI Architecture**:
  - Capability Studio header switcher: **[ Agentflows ]** | **[ Agent Builder ]**.
  - `savazai-console/src/components/studio/agent-builder/agent-catalog-view.tsx`:
    - Responsive card/table grid with search, role filters (`All`, `Supervisors`, `Specialists`, `Synthesizers`).
    - Origin badge (`Standalone` vs `Imported`).
    - Lock badge (`Locked` vs `Editable in Flows`).
    - Usage count badge (`Used in X Flows`).
    - Actions: `[ + Create Agent ]`, `[ Edit ]`, `[ Clone ]`, `[ Delete ]`.
  - `savazai-console/src/components/studio/agent-builder/agent-editor-modal.tsx`:
    - Comprehensive configuration: Name, Key, Role, Description, Model parameters (Provider, Model, Temperature).
    - System directive prompt editor with character count.
    - Multi-select for Tools, Skills, and OKF Concepts.
    - Enterprise Lock policy switches (`isLocked`, `allowModificationInFlow`).

## 4. Reusable Agent Discovery in Capability Studio Palette
- In `savazai-console/src/components/studio/agent-palette.tsx`:
  - Add tab toggle: `[ Node Types ]` vs `[ Existing Agents ]`.
  - Under `Existing Agents`:
    - Live search input + role filter chips (`All`, `Supervisors`, `Specialists`, `Synthesizers`, `Locked`).
    - Draggable cards displaying Agent Name, Role, Model tag, and Lock pill.
    - Drag-and-drop integration creating a hydrated canvas node (`type: 'agentNode'`) populated with `agentId`, `name`, `systemPrompt`, `tools`, `skills`, `model`, `isLocked`, `catalogAgentId`.
- In `savazai-console/src/components/studio/nodes/agent-node.tsx`:
  - Display lock indicator on node header if `isLocked === true`.
- In `savazai-console/src/components/studio/drawers/agent-drawer.tsx`:
  - If agent is locked (`isLocked === true`):
    - Display alert banner explaining enterprise policy locks.
    - Disable prompt input and tool/skill removals.
    - Surface `[ Detach / Fork Agent ]` button to create a local editable copy if customization is required.

## 5. Verification & Testing
- Run TypeScript build check (`npx tsc --noEmit`).
- Run theme & contrast linters (`npm run lint:theme`, `npm run check:contrast`).
- Run Next.js production build (`npm run build`).
- Update knowledge graph (`graphify update .`).
- Rebuild & restart Docker containers.
- End-to-end verification of prompt versioning, agent creation, and palette drag-and-drop.
