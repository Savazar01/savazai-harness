# IMPLEMENTATION PLAN: Fix Rogue Sign-In Redirect to `/admin/settings` & Resolve 404 / Missing Route Crash

---

## 1. Root Cause Analysis

### A. TDZ (Temporal Dead Zone) ReferenceError in `sidebar.tsx`
- **Root Cause**: In `savazai-console/src/components/sidebar.tsx` (lines 154-160), `isSuperAdmin` was referenced inside `canViewGovernance` *before* `const isSuperAdmin` was declared:
  ```ts
  const canViewGovernance =
    hasPermission("governance", "view") ||
    isSuperAdmin || // <-- ReferenceError: Cannot access 'isSuperAdmin' before initialization
    user?.roleNames?.includes("Auditor") ||
    user?.roleNames?.includes("User Administrator");

  const isSuperAdmin = user?.role === "admin" || user?.roleName === "Super Administrator" || session?.user?.role === "admin";
  ```
- **Impact**: Any route that renders the application `<Sidebar />` (including `/admin/settings`, `/admin/system`, `/admin/users`, `/admin/governance`, etc.) threw a fatal `ReferenceError`, triggering the Next.js runtime error boundary `"This page couldn't load"`.

### B. Hardcoded Redirects to `/admin/settings`
- **`savazai-console/src/app/signin/page.tsx`**:
  ```ts
  if (session) {
    redirect(session.user.role === "admin" ? "/admin/settings" : "/studio");
  }
  ```
  Immediately forces any user with role `"admin"` visiting `/signin` to `/admin/settings`.
- **`savazai-console/src/app/page.tsx` (Lines 64, 130, 528)**:
  ```ts
  href={session.user.role === "admin" ? "/admin/settings" : "/dashboard"}
  ```
  Forces admin users clicking "Open Workspace" to `/admin/settings`.
- **`savazai-console/src/components/signin-form.tsx`**:
  Should respect `returnUrl` query parameter if present, and default strictly to `/dashboard`.

### C. SQL Column Name Mismatch in `/api/governance/audit/route.ts`
- **Root Cause**: The query in `/api/governance/audit/route.ts` used `actor_id` and `actor_email`, while `system_audit_logs` table schema defines `user_id` and `user_email`.
- **Impact**: `column "actor_email" does not exist` when fetching governance audit logs.

### D. Missing / Incomplete Resilient Error Boundaries
- **`savazai-console/src/app/error.tsx` & `savazai-console/src/app/admin/error.tsx`**:
  Need actionable error cards with `[ Go to Workspace (/dashboard) ]` and `[ Clear Session & Sign In ]` buttons instead of unhelpful dead ends.

---

## 2. File Modification Plan

### File 1: `savazai-console/src/components/sidebar.tsx`
- Move `const isSuperAdmin = ...` above all `canView*` permission checks.
- Eliminates the Temporal Dead Zone `ReferenceError` completely.

### File 2: `savazai-console/src/app/signin/page.tsx`
- Replace hardcoded `redirect(session.user.role === "admin" ? "/admin/settings" : "/studio")` with `redirect("/dashboard")` (or `returnUrl` if provided via searchParams).

### File 3: `savazai-console/src/app/page.tsx`
- Replace `session.user.role === "admin" ? "/admin/settings" : "/dashboard"` with `href="/dashboard"` across all header and CTA links.

### File 4: `savazai-console/src/components/signin-form.tsx`
- Support `useSearchParams()` to extract `returnUrl`.
- On successful authentication, redirect to `returnUrl || permData.defaultRoute || "/dashboard"`. If `permData.defaultRoute === "/admin/settings"` and user can view workspace, prefer `/dashboard`.

### File 5: `savazai-console/src/lib/auth/rbac.ts`
- In `resolveDefaultLandingRoute`: Prioritize `/dashboard` if user has `agent_workspace:view`, or if user is `admin`/`Super Administrator`. Only return `/admin/settings` if the user *only* holds Command Center view permissions.

### File 6: `savazai-console/src/app/api/governance/audit/route.ts`
- Fix SQL query columns in `system_audit_logs`:
  Use `COALESCE(user_id, actor_id)` / `user_id as "actorId"` and `COALESCE(user_email, actor_email)` / `user_email as "actorEmail"` with fallback support.

### File 7: `savazai-console/src/app/admin/settings/page.tsx`
- Add defensive null-coalescing defaults for all fetched data in `SettingsPage`.

### File 8: `savazai-console/src/app/error.tsx` & `savazai-console/src/app/admin/error.tsx`
- Build resilient error boundaries with:
  - Error alert styling (`bg-card`, `border-destructive/30`).
  - Error digest and stack in development/staging.
  - [ Try Again ] button.
  - [ Go to Workspace (/dashboard) ] primary button.
  - [ Clear Session & Sign In ] button that calls `authClient.signOut()` and redirects to `/signin`.

---

## 3. Verification & Quality Gates
1. `npx tsc --noEmit`
2. `npm --prefix savazai-console run lint:theme`
3. `npm --prefix savazai-console run build`
4. `graphify update .`
5. `docker compose down && docker compose up --build -d`
6. Test in Incognito: visit `/signin` -> login -> verify redirects to `/dashboard`.
7. Test in Standard: visit `/admin/settings` -> loads cleanly without errors.
8. Commit and push to GitHub `origin/main`.
