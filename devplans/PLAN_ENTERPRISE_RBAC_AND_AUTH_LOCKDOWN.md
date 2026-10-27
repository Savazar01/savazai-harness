# Technical & Security Deep Dive + Implementation Plan: Zero-Trust Onboarding & Enterprise RBAC (`PLAN_ENTERPRISE_RBAC_AND_AUTH_LOCKDOWN`)

---

## 1. Technical & Security Deep Dive (Root Cause & Vulnerability Audit)

We performed a comprehensive security audit of the SavazAI codebase (`savazai-console` and root `src/`) to determine how the unauthorized account was created on `savazai-harnessin.savazar.com` and where horizontal/vertical privilege escalation vectors existed.

### 🚨 Critical Vulnerability Findings

#### Finding 1: How the Unauthorized Account Was Created (`Better-Auth` Open Endpoint)
* **Location**: `savazai-console/src/lib/auth.ts` & `savazai-console/src/app/api/auth/[...all]/route.ts`
* **Root Cause**: While `savazai-console/src/app/signup/page.tsx` hid the UI in production via `if (process.env.NODE_ENV === "production") redirect("/signin")`, `betterAuth` had `emailAndPassword: { enabled: true }` without `disableSignUp: true`, and the catch-all handler `/api/auth/[...all]` forwarded **all** `POST` requests directly to Better-Auth.
* **Exploit Vector**: Automated bots or attackers sending a `POST` request to `/api/auth/sign-up/email` (or `/api/auth/register` / `/api/auth/signup`) completely bypassed the UI redirect, triggered the `user.create.before` hook, created an active user with `role: "user"`, and received an immediate authenticated session cookie.

#### Finding 2: Authenticated Non-Admin Users Had Access to Studio, Business Center & Command Center UI
* **Location**: `studio/layout.tsx`, `business/layout.tsx`, `admin/layout.tsx`, and `sidebar.tsx`
* **Root Cause**: `StudioLayout`, `BusinessLayout`, and `AdminLayout` (`/admin/settings`) only checked `if (!session) redirect("/signin")`. They did **not** check user status, password reset flags, or role permissions. Furthermore, `Sidebar` unconditionally rendered `Capability Studio`, `Business Center`, `Documentation`, and `Command Center` (`/admin/settings`) to every logged-in user regardless of role.

#### Finding 3: Zero Authentication on Critical Next.js API Routes & Server Actions
Critical endpoints (`admin/settings/actions.ts`, `/api/settings`, `/api/agentflows`, `/api/chat`, `/api/orchestrator/*`, `/api/skills`, `/api/okf`, `/api/governance/*`) lacked server-side RBAC enforcement.

#### Finding 4: Database ORM & Adapter Alignment (Drizzle ORM + `pg.Pool`)
* **Resolution**: Implemented all tables, enums, columns, unique constraints, and foreign key cascades (`AccountStatus`, `"user"`, `"role"`, `"role_permission"`, `"user_permission"`, `"verification_token"`) in **both** Drizzle ORM (`src/db/schema.ts`) and auto-bootstrapped SQL migrations in `savazai-console/src/lib/auth.ts`, while keeping full compatibility with Better-Auth's `"user"` and `"account"` tables.

---

## 2. Implementation Architecture

1. **Phase 1 — Centralized Permission Registry (`savazai-console/src/lib/auth/permissions-registry.ts`)**:
   - All **53 granular permissions** across the 7 platform categories (`capability_studio`, `business_center`, `command_center`, `agent_workspace`, `documentation`, `demo_requests`, `user_admin`).
   - 6 predefined system roles (`Super Administrator`, `Studio Flow Architect`, `Workspace Operator`, `Business Policy Manager`, `Infrastructure Lead`, `Auditor`).
   - Dynamic runtime extensibility via `registerDynamicPermission`.

2. **Phase 2 — Database Schema & Auto-Bootstrapping (`src/db/schema.ts`, `savazai-console/src/lib/auth.ts`)**:
   - Added `status`, `mustResetPassword`, `roleId` to `"user"`.
   - Created `"role"`, `"role_permission"`, `"user_permission"`, and `"verification_token"` tables.
   - Auto-seeds all 6 predefined system roles and quarantines any non-admin accounts lacking an approved role.

3. **Phase 3 — Eradicating Public Registration, Bot Defense (CAPTCHA) & Email OTP Pipeline**:
   - Configured `disableSignUp: true` in Better-Auth and blocked `/sign-up`, `/signup`, `/register` in `/api/auth/[...all]/route.ts` and `src/middleware.ts` with `403 Forbidden`.
   - Implemented `savazai-console/src/lib/auth/captcha.ts` and `savazai-console/src/lib/auth/otp.ts` (SHA-256 hashed 6-digit OTP, 10-minute TTL, max 3 attempts).
   - Implemented controlled access request flow (`/api/auth/otp/send`, `/api/auth/access-request`) creating accounts in `PENDING_APPROVAL` with `mustResetPassword = true` and `roleId = null`.
   - Implemented forced first-time password reset (`/reset-password` and `/api/auth/reset-password`).

4. **Phase 4 — Server-Side RBAC Guardrails (`savazai-console/src/lib/auth/rbac.ts`)**:
   - Implemented `requirePermission(resource, action)` across all Next.js API routes, server actions, and route layouts.

5. **Phase 5 — User Admin UI & Interactive Role/Permission Matrix (`/admin/users`)**:
   - Upgraded `savazai-console/src/components/admin/user-management.tsx` with Pending Approvals Queue, Active User Directory with per-user permission overrides, and the interactive Role & Permission Matrix.

6. **Phase 6 — Dynamic Sidebar & Component Action-Level UI Guards**:
   - Updated `sidebar.tsx`, `studio/page.tsx`, `canvas-editor.tsx`, `business/page.tsx`, `skills-registry.tsx`, `okf-registry.tsx`, `compliance-manager.tsx`, `settings-dashboard.tsx`, `chat-workspace.tsx`, and `demo-request-management.tsx` to dynamically gate tabs and buttons using `usePermissions()`.
