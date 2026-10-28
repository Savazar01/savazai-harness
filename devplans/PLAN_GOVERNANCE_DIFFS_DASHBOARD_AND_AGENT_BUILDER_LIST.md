# PLAN: Precise Audit Diff Tracking, Governance Analytics & Alerting Engine, Agent Builder Dual-View Modes, RBAC Authorization Matrix Segregation, and Platform Documentation Sweep

## 1. Architectural Strategy & Design

### Workstream 1: Precise Key-Level Delta Diffs & Granular Audit Actions
1. **Utility `calculateAuditDelta(before, after)`**:
   - Compare old and new structures recursively or field-by-field.
   - For `llmProviders`:
     - Compare `active`, `defaultModel`, `models`, `discoveredModels`, `endpoint`.
     - Detect exact added/removed models: e.g. `{ field: "allowedModels", changeType: "added", value: "gpt-5-nano" }`.
     - Emit action `LLM_PROVIDER_UPDATED`, resource `llm_providers`, targetName `OpenAI`.
   - For `mcpServers`, `dbConnections`, `socialConnections`, `apiServices`:
     - Calculate specific changes and emit dedicated action types (`MCP_SERVER_UPDATED`, `DATABASE_HUB_UPDATED`, `API_SERVICES_UPDATED`, `SOCIAL_MEDIA_UPDATED`).
   - For `organizationalData`:
     - ONLY emit `ORGANIZATIONAL_DATA_UPDATED` if `input.organizationalData` was actually passed AND differs from `currentTokens.organizationalData`.
   - For general settings:
     - Emit `SETTINGS_UPDATED` with `changes: [{ field, oldValue, newValue }]` rather than dumping all keys.
2. **Unified Red/Green Visual Diff Modal**:
   - Refactor the Audit Record Details modal in `governance-dashboard.tsx`.
   - If `record.details?.changes` exists, render a structured diff card:
     - Header: Action badge, resource, target, timestamp, actor email, IP address.
     - Diff Table/Cards: Field name, Previous Value (red strike-through / red badge), New Value (green bold / green badge), Change Type (`added`, `modified`, `removed`).
     - Includes a toggle to switch to "Raw JSON view" for power users.

### Workstream 2: Executive Governance Dashboard & Alerting Engine
1. **Overview Dashboard Tab**:
   - Make `[ Overview Dashboard ]` the primary default tab of the Governance Hub (`activeTab: "overview"`).
   - Summary Metric Cards:
     - Total Audit Events (Last 24h, 7d, 30d)
     - Critical Security Mutations (Auth, Roles, API Keys)
     - Active Agent Executions & Telemetry
     - Total Prompt Revisions
   - Visual Analytics:
     - Module distribution breakdown (Command Center, Business Center, Capability Studio, User Admin).
     - Top active operators with activity pills.
     - Recent critical mutation feed.
   - Global Filter Bar: Date presets (`Today`, `Last 7 Days`, `Last 30 Days`, `All Time`), actor filter, module filter.
2. **Alerting Rules Sub-Tab & Dispatcher**:
   - Alert rules stored in `system_configurations.design_tokens.governanceAlertRules`:
     - Fields: `id`, `name`, `eventPattern` (e.g. `LLM_PROVIDER_*`, `ROLE_*`, `PROMPT_*`, `API_KEY_*`), `recipientEmails`, `severityThreshold` (`critical`, `warning`, `all`), `enabled`.
   - API endpoint `/api/governance/alerts` (`GET`, `POST`, `DELETE`, `PUT`) to manage alert rules.
   - Dispatcher `dispatchGovernanceAlert(event)` in `src/lib/alerts/governance-alerter.ts`:
     - Checks active rules against the newly logged audit event.
     - Renders email using template `governance_alert_notification` (or seeds it if absent) and dispatches via `sendEmail`.

### Workstream 3: Agent Builder Hub Dual-View: Grid vs. List Mode
1. **View Switcher (`[ ⊞ Grid ]` / `[ ☰ List ]`)**:
   - In `agent-catalog-view.tsx`, add dual-view toggle next to search and filters.
2. **List Mode Data Table**:
   - Columns:
     1. `Name & Key`: Agent title, slug identifier, role badge.
     2. `Role Archetype`: Colored badge (`Supervisor`, `Worker`, `Synthesizer`, etc.).
     3. `LLM Provider & Model`: e.g. `openai / gpt-4o-mini`.
     4. `Bound Tools & Knowledge`: Tool count badge (hover lists tools), Skills count, Concepts count.
     5. `Origin & Consuming Flows`: Badge showing `Flow: Wedding Planning` or `Agent Builder`, with tooltip listing all flows where active.
     6. `Policy`: `Enterprise Locked` vs `Flow Editable`.
     7. `Actions`: Button group (`Configure / Edit`, `Duplicate`, `Delete`).
   - Multi-column sorting (by Name, Role, Model, Recently Updated) and pagination.

### Workstream 4: User Admin: Role List View, Assigned Users & Matrix Segregation
1. **Expand Permissions Registry to 68 Permissions**:
   - Add 5 granular Agent Builder permissions under Capability Studio in `savazai-console/src/lib/auth/permissions-registry.ts`:
     - `capability_studio:agent_builder_view`
     - `capability_studio:agent_builder_create`
     - `capability_studio:agent_builder_edit`
     - `capability_studio:agent_builder_delete`
     - `capability_studio:agent_builder_lock`
   - Include these in `Super Administrator` and `Studio Flow Architect` seed profiles.
2. **Segregate Authorization Matrix into Dedicated Tab 4**:
   - Tab 1: **Active Users Directory**
   - Tab 2: **Pending Approvals Queue**
   - Tab 3: **Roles & Access Profiles** (Only Role Cards / Role List, clean and uncluttered)
   - Tab 4: **Platform Authorization Matrix** (Dedicated full-width 68-permission interactive matrix)
3. **Roles & Access Profiles Dual-View & Assigned Users**:
   - Add `[ ⊞ Grid ]` / `[ ☰ List ]` toggle in Tab 3.
   - For each role, calculate assigned users count and member names (e.g. `3 Users Assigned` with hover tooltip: `Sujatha A, Satish A, System Admin`).
   - Clicking the badge filters the Active Users Directory by that role.

### Workstream 5: Comprehensive Platform Documentation Sweep
1. **Update `README.md`**:
   - Detail Agent Builder Hub, Governance Ledger with delta diffs & alerting, System Admin module, and Capability Studio features.
2. **Update Landing Page (`app/page.tsx`) & In-App Docs (`app/docs/page.tsx`)**:
   - Update architecture sections, feature cards, and guides.

---

## 2. Quality Verification Gates
- `npx tsc --noEmit` (Backend)
- `npm --prefix savazai-console run lint` (Frontend theme & code lint)
- `npm --prefix savazai-console run check:contrast` (WCAG AA)
- `npm --prefix savazai-console run build` (Next.js production build)
- `graphify update .` (Knowledge graph synchronization)
- Docker compose restart and live localhost verification.
