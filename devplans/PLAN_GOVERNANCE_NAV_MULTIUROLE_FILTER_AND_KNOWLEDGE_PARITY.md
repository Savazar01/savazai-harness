# PLAN: Governance Hub Navigation Overhaul, Multi-Role Filter Fix, Default List Views & Unified Knowledge Tab Architecture

## Architectural Specification & File Change Breakdown

### Workstream 1: Governance Hub Scalable Categorized Sub-Navigation
- **File**: `savazai-console/src/components/governance/governance-dashboard.tsx`
- **Design**:
  - Replace the single cramped horizontal `<TabsList>` that wraps onto line 2 with an enterprise-grade Two-Tier / Left-Rail Sub-Navigation layout.
  - Group the 9 report sections into 3 logical categories:
    1. **Analytics & Controls**:
       - `overview`: Overview Dashboard (Icon: `BarChart3`)
       - `alerting`: Alerting Rules (Icon: `Bell`)
    2. **Operational Audit Ledgers**:
       - `user_admin`: User Admin (Icon: `Users`)
       - `command_center`: Command Center (Icon: `Sliders`)
       - `business_center`: Business Center (Icon: `Briefcase`)
       - `agentflows`: Agentflows (Icon: `Workflow`)
       - `agents_activity`: Agents Telemetry (Icon: `Activity`)
    3. **Asset Version Control**:
       - `asset_revisions`: Skills & OKF Versions (Icon: `FileCode`)
       - `prompt_revisions`: System Prompt Versions (Icon: `Terminal`)
  - Layout Structure:
    - Side navigation rail on desktop (`w-64 shrink-0 flex flex-col gap-4 border-r border-border pr-4`) with clean categorized list items, active indicators (`bg-primary text-primary-foreground shadow-xs font-semibold`), hover states, and clear category labels.
    - Responsive collapsible/dropdown selector for narrow/mobile screens to maintain 100% responsiveness without any ugly wrapping or broken layouts.
    - Right-side content container includes the header action strip (Search input, Export CSV, Refresh button) and the active report view.
  - Styling:
    - Full theme compliance with `DESIGN.md`: no hardcoded colors, semantic tokens (`bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`), WCAG AA contrast.

### Workstream 2: Multi-Role Directory Filtering & Default List View in User Admin
- **File**: `savazai-console/src/components/admin/user-management.tsx`
- **Changes**:
  1. Default `roleViewMode` to `"list"`:
     - `const [roleViewMode, setRoleViewMode] = useState<"grid" | "list">("list");`
     - Verify List View renders on first load of Roles & Access Profiles tab.
  2. Multi-Role Directory Filter Predicate:
     - Resolve role by ID or Name: Find matching role from `roles` array if `roleFilter` matches either `r.id` or `r.name`.
     - Filter logic: Check if `roleFilter === "all"`, or `admin` check, or if user's primary `roleId`/`role`/`roleName` matches, OR if user's multi-role array `roleIds`, `roleNames`, or `roles` includes the selected role filter.
     - On mount, if URL parameter `role` exists (e.g. `?role=Auditor` or `?role=role_auditor`), initialize `roleFilter` and activate the Active Users tab.
  3. Clicking assigned users badge:
     - Ensure clicking the assigned operator pill sets `roleFilter` and seamlessly switches to the active tab displaying all users with that role (e.g. Sujatha A who has Studio Flow Architect + Auditor).

### Workstream 3: Default List View in Agent Catalog & Builder Hub
- **File**: `savazai-console/src/components/studio/agent-builder/agent-catalog-view.tsx`
- **Changes**:
  1. Change default view mode state from `"grid"` to `"list"`.
  2. Implement `localStorage` persistence under key `"savazai_agent_builder_view"`, defaulting to `"list"`.
  3. Ensure table mounts instantly with all columns: Name & Slug, Role, Model & Config, Tools & Bindings, Origin Flow, and Actions.

### Workstream 4: Agent Inspector Default Full View & Knowledge Tab Parity
- **File**: `savazai-console/src/components/studio/agent-drawer.tsx`
- **Changes**:
  1. Dialog Dimensions:
     - Initialize `isDrawerExpanded` to `true` by default so the drawer opens in `max-w-5xl sm:max-w-6xl` view without requiring the user to find and click the expand icon.
  2. Knowledge Tab UX Parity:
     - Maintain top RAG parameters: `pgvector RAG Namespace` and `Embedding Model`.
     - Header Filter & Bulk Actions Bar matching MCP tab:
       - Search input: `Search knowledge skills & OKF concepts by name, key, description...`
       - Bulk toggle buttons: `Enable All Filtered` | `Disable All Filtered`
       - Active count indicator: `Showing X assets • Y currently active`
     - Section 1: Universal Business Skills Data Table:
       - High-contrast toggle switch
       - Skill & Key with category badges (`Custom`, `Native`, `MCP Bound`, etc.)
       - Description & parameters/instructions preview
       - Status badge (`Active` vs `Disabled`)
     - Section 2: OKF Concepts Data Table:
       - High-contrast toggle switch
       - Concept Key & Title with category badge (`SOP Ruleset`, `Domain Glossary`, `Compliance Standard`, etc.)
       - Description & tags
       - Status badge (`Active` vs `Disabled`)
     - Preserve "Author New Skill" inline modal capability.

## Verification & Testing Plan
1. Typecheck: `npx tsc --noEmit`
2. Theme lint check: `npm --prefix savazai-console run lint:theme`
3. Contrast check: `npm --prefix savazai-console run check:contrast`
4. Next.js production build: `npm --prefix savazai-console run build`
5. Playwright e2e verification:
   - Navigate to `/admin/governance` in light and dark mode, check sub-nav layout and ensure 0 wrapping.
   - Navigate to `/admin/users`, verify Roles tab defaults to list mode, click `1 Users Assigned` on Auditor, verify user directory lists the assigned user.
   - Navigate to `/studio`, verify Agent Builder Hub defaults to list mode.
   - Open Agent Inspector, verify expanded width and Knowledge tab table structure with switches and search.
6. Knowledge graph synchronization: `graphify update .`
7. Container restart & health check.
