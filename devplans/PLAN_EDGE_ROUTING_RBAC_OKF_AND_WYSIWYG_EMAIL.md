# PLAN: Edge Condition Documentation & Waypoint Routing, Navigation Reorganization, Role Management Overhaul, OKF Agent Assignment & WYSIWYG Email Template Engine

## 1. Architecture & Component Blueprint

### Workstream 1: Edge Connection Documentation & Interactive Waypoint Dragging
- **Files**: `savazai-console/src/components/studio/canvas-editor.tsx`
- **Component**: `<EdgeConditionGuideModal />` or embedded expandable drawer:
  - Details execution context in LangGraph conditional edges.
  - Lists variables: `context.last_output`, `context.intent`, `context.confidence`, `context.tool_calls_count`, `context.is_approved`.
  - Details operators (`===`, `!==`, `>`, `<`, `&&`, `||`, `.includes()`).
  - Provides instant `[ Insert Template ]` buttons that paste expressions directly into `conditionInput`.
  - Fix modal width from `w-56` to responsive `w-80 sm:w-96` and replace hardcoded `text-white` with `text-foreground`.
  - Fix edge popover positioning so it centers neatly near `(mx, my)` rather than clamping to X=300px.
  - Enhance waypoint dragging: visual handles with `cursor-ns-resize` and clear guide lines, preserving `offsetY` on the edge.

### Workstream 2: Sidebar Navigation Restructuring & Access Governance
- **Files**: `savazai-console/src/components/sidebar.tsx`
- Split nav into two distinct sections:
  1. Top Core Operational Items:
     - Agent Workspace (`/dashboard`)
     - Capability Studio (`/studio`)
     - Business Center (`/business`)
     - Command Center (`/admin/settings`)
     - System Admin (`/admin/system`)
     - User Admin (`/admin/users`)
  2. Bottom Utility Items (above theme switch and profile card):
     - Documentation (`/docs`)
     - Demo Requests (`/admin/demo-requests`)
  - Demo Requests conditional render: check `user?.role === "admin" || user?.roleName === "Super Administrator"`.

### Workstream 3: Dedicated "User Administrator" System Role & Matrix Column Width Sizing
- **Files**:
  - `savazai-console/src/lib/auth/permissions-registry.ts`: Add `role_user_admin` to `SYSTEM_ROLES`.
  - `savazai-console/src/components/admin/user-management.tsx`:
    - Widen `Module & Action` column to `w-[320px] min-w-[280px]` with clear wrapping.
    - Constrain role header columns to `max-w-[150px] min-w-[120px]` with truncation and `title={r.name}` tooltip.
    - Make the matrix container sticky horizontally and vertically (`overflow-x-auto` with sticky headers).

### Workstream 4: Universal Role Customization (Edit & Delete All Roles)
- **Files**:
  - `savazai-console/src/components/admin/user-management.tsx`
  - `savazai-console/src/app/api/admin/roles/route.ts`
- Changes:
  - Role cards render Edit (✏️) and Delete (🗑️) buttons for all roles.
  - Deletion of `Super Administrator` (`id === "role_super_admin"` or `name === "Super Administrator"`) is permanently disabled with security tooltip.
  - Update `PUT` and `DELETE` in `/api/admin/roles/route.ts` to allow editing system roles (except deleting Super Admin).
  - Add Edit Role Modal with permission toggles to `user-management.tsx`.

### Workstream 5: Rename to "OKF Concepts" & Agent Assignment Modal
- **Files**:
  - `savazai-console/src/components/business/okf-registry.tsx`
  - `savazai-console/src/app/business/page.tsx`
  - `savazai-console/src/lib/auth/permissions-registry.ts`
- Changes:
  - Replace "Google OKF Concepts" with "OKF Concepts" in navigation, tab headers, search placeholders, export messages.
  - Add `AssignConceptToAgentsModal` inside `okf-registry.tsx`:
    - Opens when clicking the `ACTIVE IN AGENTS` column badge.
    - Lists active and draft Agentflows with collapsible agent groups.
    - Toggles concept in `tools` or `okfConcepts` and updates `/api/agentflows/${id}`.

### Workstream 6: True WYSIWYG Email Template Editor & Dynamic Categories
- **Files**:
  - `savazai-console/src/components/business/email-templates-registry.tsx`
- Changes:
  - Replace raw HTML `<textarea>` with a rich visual WYSIWYG editor containing formatting toolbar (Bold, Italic, Headings, Bullet Lists, Numbered Lists, Callouts, Buttons, Dividers, Alignment) and visual/split/preview toggles.
  - Expand merge tags:
    - Agentflow State: `{{agent_name}}`, `{{agentflow_title}}`, `{{step_name}}`, `{{approver_email}}`, `{{review_link}}`, `{{execution_id}}`, `{{status}}`, `{{timestamp}}`
    - Organization: `{{company_name}}`, `{{company_email}}`, `{{company_phone}}`, `{{company_address}}`, `{{company_website}}`, `{{support_email}}`
  - Dynamic Category combobox: supports adding new custom categories and persists them.
  - Purge "workflow" from email subjects, templates, and text, standardizing on "Agentflow".

## 2. Quality Gates Sequence
1. `npx tsc --noEmit`
2. `npm --prefix savazai-console run lint:theme`
3. `npm --prefix savazai-console run check:contrast`
4. `npm --prefix savazai-console run build`
5. `graphify update .`
6. `docker compose down && docker compose up --build -d && docker compose ps`
