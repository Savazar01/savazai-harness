# ARCHITECTURAL PLAN: Multi-Role User Assignment, Comprehensive Audit Logging, Dedicated Governance Hub, Dynamic SMTP Senders, User Master Merge Tags & Versioned Asset Tracking

---

## 1. Architecture Overview

This plan details the implementation of 7 workstreams to deliver enterprise multi-role assignment with self-escalation safeguards, tamper-evident audit logging, a dedicated Governance Hub with 7 searchable reports and diff visualizers, dynamic SMTP sender configurations, user master merge tags with searchable accordion categories, and version tracking for Skills, OKF Concepts, and Agent Prompts.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 SAVAZAI CONSOLE PLATFORM                               │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│  Navigation Hierarchy:                                                                 │
│  [Agent Workspace] [Capability Studio] [Business Center] [Command Center]              │
│  [System Admin] [User Admin] [Governance Hub (NEW /admin/governance)]                  │
│  ────────────────────────────────────────────────────────────────────────────          │
│  [Documentation] [Demo Requests (Super Admin)] [Theme Toggle]                          │
│                                                                                        │
│  Governance Reports Hub (/admin/governance):                                           │
│  ├── Tab 1: User Admin Tracking Report (Roles, Onboarding, Status, Password Resets)    │
│  ├── Tab 2: Command Center Audit Report (MCP, DB, Social, API mutations)               │
│  ├── Tab 3: Business Center Audit Report (Skills, OKF, Compliance, Email Templates)   │
│  ├── Tab 4: Agentflows Audit Report (Create, Save Draft, Publish, Auto-Align)          │
│  ├── Tab 5: Agents Activity Log (Execution runs, Latency, Tool calls, Tokens)          │
│  ├── Tab 6: Skills & OKF Concepts Version Audit (Semver, Author, Change Diff Viewer)   │
│  └── Tab 7: Agent System Prompt Version Audit (Prompt Revisions, Diff Viewer)          │
│                                                                                        │
│  Zero-Trust Multi-Role Architecture:                                                   │
│  ├── users.roles TEXT[] & user_assigned_role join table                                │
│  ├── Union aggregation of permissions across all assigned roles                        │
│  └── Self-assignment security safeguard (User Admin cannot self-escalate / edit roles) │
│                                                                                        │
│  Email Infrastructure & Merge Tag Overhaul:                                            │
│  ├── Sender Display Name + Sender Email Address in System Core Email Settings          │
│  ├── Total purge of hardcoded 'security@savazar.com'                                   │
│  ├── Collapsible & Searchable Categorized Merge Tag Picker (Agentflow, User, Org)      │
│  └── User Master Merge Tags ({{user_full_name}}, {{user_email}}, {{user_role}}, etc.)  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Workstream Breakdown & File Changes

### Workstream 1: Multi-Role User Assignment with Self-Escalation Safeguard
- **Database (`auth.ts`, `src/db/schema.ts`)**:
  - Add table `user_assigned_role (id, userId, roleId, createdAt)` with unique constraint.
  - Add `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "roles" TEXT[] DEFAULT ARRAY[]::TEXT[];`.
  - In `ensureAdminProvisioned()`: bootstrap table and migrate existing single `roleId` to `user_assigned_role` and `users.roles`.
- **RBAC Engine (`savazai-console/src/lib/auth/rbac.ts`)**:
  - In `resolveUserAccessById(userId)`:
    - Query all assigned roles from `user_assigned_role` join `role` (plus fallback to `u.roleId`).
    - Union permissions across all assigned roles.
    - Set primary `roleName` to highest privilege role or comma-separated roles.
- **Admin Users API (`/api/admin/users/route.ts` & `/api/admin/users/[id]/route.ts`)**:
  - In `GET /api/admin/users`: return `roleIds: string[]`, `roleNames: string[]` along with legacy `roleId`/`roleName`.
  - In `PATCH /api/admin/users/[id]`:
    - Accept `roleIds: string[]` (or single `roleId`).
    - **Self-Assignment Security Guard**:
      `if (targetUserId === check.context.userId && isUserAdmin && !isSuperAdmin)`
      If `roleIds` or `roleId` is attempted to be changed, reject with `403 Forbidden` and error message:
      `"User Administrators cannot modify their own assigned roles. Contact a Super Administrator for role adjustments."`
    - Update `user_assigned_role` join table and `users.roles` array.
- **Client UI (`user-management.tsx`)**:
  - Update `ManagedUser` interface with `roleIds?: string[]` and `roleNames?: string[]`.
  - Replace single `<select>` with a Multi-Role Badge/Checkbox grid:
    - Lists all available roles.
    - Checkbox to toggle each role.
    - Selected role pills with remove (x) button.
  - If editing own account as User Administrator without Super Admin:
    - Disable role checkboxes.
    - Show amber warning banner: `"User Administrators cannot modify their own assigned roles. Contact a Super Administrator for role adjustments."`

---

### Workstream 2: Granular User Administration Audit Logging
- **Audit Logger Utility (`savazai-console/src/lib/audit/audit-logger.ts`)**:
  - Centralized function: `logAuditEvent({ category, action, actor, target, details, ipAddress })`.
  - Writes to `system_audit_logs` table with columns: `category`, `action`, `resource`, `user_id`, `user_email`, `target_id`, `target_name`, `details`, `ip_address`.
- **Integrate into User Admin Operations**:
  - `USER_ROLES_UPDATED`: target user ID, actor, old roles vs new roles.
  - `USER_ONBOARDING_APPROVED`: applicant email, assigned roles, actor.
  - `USER_ONBOARDING_REJECTED`: rejected applicant email, actor, reason.
  - `USER_PASSWORD_RESET_TRIGGERED`: target user email, actor.
  - `USER_STATUS_CHANGED`: old status vs new status (ACTIVE, SUSPENDED), actor.
  - `USER_PROFILE_UPDATED`: name/email updates, actor.

---

### Workstream 3: Dedicated "Governance" Hub in Primary Navigation
- **Navigation (`sidebar.tsx`)**:
  - Add `Governance` (`/admin/governance`) between `User Admin` and bottom utility divider.
  - Use `Scale` icon from `lucide-react`.
  - Check permission: `user.permissions.has("governance:view")` or admin.
- **Permissions Registry (`permissions-registry.ts`)**:
  - Add category `"governance"` with permissions:
    - `governance:view`: "View Governance & Audit Reports" (Super Admin, Auditor, User Admin).
    - `governance:export_logs`: "Export Governance Audit Logs" (Super Admin, Auditor).
    - `governance:manage_retention`: "Manage Audit Log Retention" (Super Admin).

---

### Workstream 4: Governance Hub Reports Suite (`/admin/governance`)
- **Page & Component Architecture**:
  - `savazai-console/src/app/admin/governance/page.tsx`: Server component with RBAC auth check.
  - `savazai-console/src/components/governance/governance-dashboard.tsx`: Interactive client component with 7 sub-tabs:
    1. **User Admin Audit**: Roles assigned, status changes, password resets, onboarding approvals.
    2. **Command Center Audit**: MCP servers, database credentials, API integrations mutations.
    3. **Business Center Audit**: Universal skills, OKF concepts, PII rules, email templates mutations.
    4. **Agentflows Audit**: Graph creations, saves, publishes, deletions, and auto-aligns.
    5. **Agents Activity Log**: Executed agentflow traces, runtime durations, tool calls, and PII masking events.
    6. **Skills & Concepts Version Audit**: History of revisions for skills and OKF concepts with diff viewer.
    7. **Agent Prompts Version Audit**: History of revisions for agent system directive prompts with diff viewer.
  - **Shared Features**:
    - Search input filtering table rows.
    - Category & status filters.
    - CSV / JSON Export button (`Export Report`).
    - Interactive **[ View Diff ]** modal for text/code diffs.
- **Backend API (`/api/governance/audit/route.ts`)**:
  - Slices data from `system_audit_logs`, `telemetry_logs`, `asset_revisions`, and `prompt_revisions`.

---

### Workstream 5: Dynamic Email Transporter Sender Identity
- **Settings Dashboard & System Admin Hub (`system-admin-hub.tsx`, `settings-dashboard.tsx`)**:
  - In `SmtpSettingsState`: ensure `fromName` (Sender Display Name) and `fromEmail` (Sender Email Address) are bound to explicit inputs.
  - Add input fields for:
    - **Sender Display Name** (e.g. `SavazAI Operations` or `Enterprise Agentflow Dispatcher`).
    - **Sender Email Address (From / Reply-To)** (e.g. `agentflow-alerts@company.com`).
- **Transporter & Renderer (`transporter.ts`, `template-renderer.ts`, `test-email/route.ts`)**:
  - Purge hardcoded `"security@savazar.com"` and replace with dynamic fallback to `smtpSettings.user` or configured `fromEmail`.
  - Format sender header as `"${fromName}" <${fromEmail}>`.
- **Email Templates Registry (`email-templates-registry.tsx`)**:
  - Update template preview header to display dynamic configured sender from system tokens or organizational data instead of hardcoded `security@savazar.com`.

---

### Workstream 6: User Master Data Merge Tags & Tag Selector UX
- **Email Templates Registry (`email-templates-registry.tsx`)**:
  - Expand available merge tags:
    - **Agentflow Execution**: `{{agent_name}}`, `{{agentflow_title}}`, `{{step_name}}`, `{{approver_email}}`, `{{review_link}}`, `{{execution_id}}`, `{{status}}`, `{{timestamp}}`.
    - **User Master Data**: `{{user_full_name}}`, `{{user_email}}`, `{{user_role}}`, `{{user_region}}`, `{{user_id}}`.
    - **Organization & Brand**: `{{company_name}}`, `{{company_email}}`, `{{company_phone}}`, `{{company_address}}`, `{{company_website}}`, `{{support_email}}`.
  - Component UX overhaul:
    - Filter search input: `Search merge tags...`
    - Categorized tab/accordion views (`⚡ Agentflow Execution`, `👤 User Master Data`, `🏢 Organization & Brand`).
    - Click-to-insert at active cursor position.
- **Template Renderer (`template-renderer.ts`)**:
  - Support user master variables with mock preview substitutions and live dispatch substitutions.

---

### Workstream 7: Version Control & Diff Tracking for Skills, OKF & System Prompts
- **Schema & Tables (`src/db/schema.ts`, `auth.ts`)**:
  - Table `asset_revisions`: `id`, `asset_type`, `asset_key`, `version`, `content`, `metadata_snapshot`, `author_id`, `author_email`, `change_summary`, `created_at`.
  - Table `prompt_revisions`: `id`, `agent_id`, `agentflow_id`, `version_number`, `system_prompt`, `author_id`, `author_email`, `created_at`.
- **Asset Versioning Helper (`savazai-console/src/lib/versioning/asset-versioner.ts`)**:
  - `recordAssetRevision({ assetType, assetKey, content, metadata, authorId, authorEmail, changeSummary })`.
  - `recordPromptRevision({ agentId, agentflowId, systemPrompt, authorId, authorEmail })`.
- **Integrate Hook in APIs**:
  - Skills save: `/api/skills`
  - OKF Concepts save: `/api/okf`
  - Agentflow prompt save: `/api/agentflows/[id]` (inspects agent node prompts)
- **Diff Viewer Modal (`diff-viewer-modal.tsx`)**:
  - Displays previous version vs new version side-by-side with line additions (green) and deletions (red).

---

## 3. Mandatory Quality Gates Sequence

1. `npx tsc --noEmit` (Root workspace typecheck)
2. `npm --prefix savazai-console run lint:theme` (Design token compliance)
3. `npm --prefix savazai-console run check:contrast` (WCAG AA theme contrast verification)
4. `npm --prefix savazai-console run build` (Next.js production build)
5. `graphify update .` (Knowledge graph synchronization)
6. `docker compose down` & `docker compose up --build -d` & `docker compose ps`
7. Git commit and push to remote repository.
