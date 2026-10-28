# TASK PROMPT: Fix Rogue Sign-In Redirect to `/admin/settings` & Resolve 404 / Missing Route Crash

---

## 1. Issue Description

When attempting to sign in with valid credentials (or navigating to `/signin` in both standard and incognito sessions), users are unexpectedly redirected to:
`http://localhost:3056/admin/settings`

Upon arriving at `/admin/settings`, the page crashes with a Next.js client-side/server-side error boundary:
> **"This page couldn't load"**
> *Reload to try again, or go back.*
> [ Reload ] [ Back ]

## 2. Evidence from Uploaded Media
- `media_1793157287458_7243e906.png`: Chrome at `http://localhost:3056/admin/settings` displaying the unhandled crash page "This page couldn't load".
- `media_1793157340790_45df0c70.png`: Incognito window attempting sign-in at `http://localhost:3056/signin` with credentials `savazar01@gmail.com`.

## 3. Investigation Targets
1. **Search all instances of `/admin/settings`**:
   - `signin-form.tsx`
   - `resolveDefaultLandingRoute` in `savazai-console/src/lib/auth/rbac.ts`
   - `middleware.ts` or `proxy.ts`
   - Server actions and post-login redirection hooks
2. **Diagnose `/admin/settings` route crash**:
   - Inspect `savazai-console/src/app/admin/settings/page.tsx`
   - Inspect container logs (`docker compose logs console`)
   - Check data hydration, permissions check, null safety, or route coexistence with `/admin/system`
3. **Resilient Error Boundary**:
   - Add/update `error.tsx` in `savazai-console/src/app/error.tsx` and `savazai-console/src/app/admin/error.tsx` with recovery actions:
     - [ Go to Workspace (`/dashboard`) ]
     - [ Clear Session & Sign In ]
4. **Mandatory Quality Gates**:
   - Typecheck, theme lint, build verification, graphify sync, docker restart, and git push.
