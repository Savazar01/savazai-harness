# DEVPLAN: Full-Spectrum Codebase Security Audit, Remediation & Production Release to GitHub

---

## 1. Executive Summary & Audit Inventory

Antigravity has executed a full-spectrum security audit across the entire codebase (`savazai-console/`, backend services, Docker infrastructure, and shared libraries) against the 5 Cloudflare Security Audit vectors:
1. **Cloudflare Edge, Network & Bot Defense Architecture**
2. **API Route & Server Action Perimeter**
3. **HTTP Response Headers & Content Security Policy (CSP)**
4. **Data Protection, Encryption-at-Rest & Secret Management**
5. **Session Management, Cookies & Injection Prevention**

### Discovered Vulnerability Matrix & Categorization:

| ID | Severity | Vector | File / Component | Description | Remediation Strategy |
|:---|:---|:---|:---|:---|:---|
| **SEC-01** | **CRITICAL** | Perimeter | `api/tools/registered/route.ts` | Endpoint allows unauthenticated listing of all registered tools and their parameters. | Enforce `requirePermission("capability_studio", "view")` with fallback to `requirePermission("agent_workspace", "view")`. |
| **SEC-02** | **CRITICAL** | Perimeter | `api/chat/threads/[threadId]/route.ts` | Endpoint allows unauthenticated retrieval of any chat thread execution history. | Enforce `requirePermission("agent_workspace", "view")`. |
| **SEC-03** | **CRITICAL** | Perimeter | `api/mcp/route.ts` | `GET` lists tools without auth; `POST` (`tools/call`) executes arbitrary tools without auth or internal service verification. | Enforce RBAC permissions for browser sessions (`agent_workspace` / `capability_studio`) + internal service secret verification header (`x-internal-secret`) for Docker container inter-communication. |
| **SEC-04** | **HIGH** | Bot / Onboard | `api/auth/access-request/route.ts` | Allows account creation without validating an active, unexpired administrator invitation token. | Enforce `inviteToken` parameter check against `verification_token` table, verify token expiration, and delete/consume token upon account creation. |
| **SEC-05** | **HIGH** | Bot / Onboard | `components/obfuscated-onboard-form.tsx` | Fails to pass the `token` parameter to `/api/auth/access-request`. | Pass `inviteToken: token` from client form payload. |
| **SEC-06** | **HIGH** | Edge / Network | `api/demo-request`, `api/auth/access-request`, `api/auth/otp/send` | Directly reads `x-forwarded-for` header, enabling IP spoofing. | Implement centralized `getClientIp` prioritizing Cloudflare's `cf-connecting-ip` -> `x-real-ip` -> sanitized first hop of `x-forwarded-for`. |
| **SEC-07** | **HIGH** | Bot Defense | `lib/auth/captcha.ts` | Hardcoded dummy test tokens bypass CAPTCHA in all environments; does not query dynamic DB configuration from Command Center. | Restrict test token bypasses to `NODE_ENV !== "production"`. Query `system_configurations.design_tokens.captchaSettings` and decrypt stored secret when env variable is missing. |
| **SEC-08** | **MEDIUM** | Headers & CSP | `middleware.ts` & `next.config.ts` | Missing HTTP security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy). | Inject standard hardened security headers in `next.config.ts` and `middleware.ts`, whitelisting `challenges.cloudflare.com` for Cloudflare Turnstile. |
| **SEC-09** | **MEDIUM** | Network / CORS | `src/index.ts` (Backend) | Uses permissive `cors()` (`*`) and lacks security headers on Express endpoints. | Restrict CORS to allowed origins (`http://localhost:3056`, internal Docker DNS, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`) and inject security headers middleware. |
| **SEC-10** | **LOW** | Code Cleanliness | `components/signup-form.tsx` | Unused legacy signup form component with public link references. | Delete unreferenced legacy component. |

---

## 2. Remediation Implementation Plan

### Phase 1: Edge & Network Security Hardening (Vectors 1 & 3)
- Create `savazai-console/src/lib/auth/ip.ts`:
  - `getClientIp(headers: Headers | Request): string`
  - Prioritizes `cf-connecting-ip`, then `x-real-ip`, then validated first IP from `x-forwarded-for`.
- Update `savazai-console/src/lib/auth/captcha.ts`:
  - Guard bypass test tokens with `process.env.NODE_ENV !== "production"`.
  - Add database resolution for `captchaSettings` from `system_configurations` via `decrypt` when environment variable is not defined.
- Update `savazai-console/next.config.ts` and `savazai-console/src/middleware.ts`:
  - Add comprehensive CSP:
    - `script-src 'self' 'unsafe-eval' 'unsafe-inline' https://challenges.cloudflare.com;`
    - `frame-src 'self' https://challenges.cloudflare.com;`
    - `connect-src 'self' https: ws: wss:;`
    - `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;`
    - `font-src 'self' https://fonts.gstatic.com data:;`
    - `img-src 'self' data: https: blob:;`
  - Add `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security`, `Permissions-Policy`.

### Phase 2: Perimeter Route & Server Action Hardening (Vectors 2 & 5)
- Update `savazai-console/src/app/api/tools/registered/route.ts`:
  - Enforce `requirePermission("capability_studio", "view")` / `requirePermission("agent_workspace", "view")`.
- Update `savazai-console/src/app/api/chat/threads/[threadId]/route.ts`:
  - Enforce `requirePermission("agent_workspace", "view")`.
- Update `savazai-console/src/app/api/mcp/route.ts`:
  - `GET`: Authenticate via session permission (`agent_workspace: view` / `capability_studio: view`) OR internal service token header `x-internal-secret`.
  - `POST`: Authenticate via session permission (`agent_workspace: direct_mcp_chat` / `capability_studio: test_run`) OR internal service token header `x-internal-secret`.
- Update `savazai-console/src/app/api/auth/access-request/route.ts`:
  - Require `inviteToken` in request payload.
  - Verify that `inviteToken` matches an unexpired record in `verification_token` with `purpose = 'invitation'` for `email`.
  - Consume (delete) the invitation record upon successful user creation.
  - Use `getClientIp` for CAPTCHA verification.
- Update `savazai-console/src/components/obfuscated-onboard-form.tsx`:
  - Pass `inviteToken: token` in `handleVerifyAndSubmit`.
- Update `savazai-console/src/app/api/demo-request/route.ts` & `savazai-console/src/app/api/auth/otp/send/route.ts`:
  - Use `getClientIp` for CAPTCHA verification.

### Phase 3: Backend Express & CORS Hardening (Vector 4 & Network)
- Update `src/index.ts`:
  - Restrict CORS origins to authorized hosts.
  - Add security headers middleware (`X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`).
- Remove legacy `savazai-console/src/components/signup-form.tsx`.

### Phase 4: Quality Gates, Knowledge Graph & Release
- Backend TypeScript check: `npx tsc --noEmit`.
- Frontend TypeScript check: `npx --prefix savazai-console tsc --noEmit`.
- Rebuild & test Docker containers: `docker compose build; docker compose up -d`.
- Verify console loads cleanly.
- Synchronize documentation (`README.md`, `AGENTS.md`).
- Run `graphify update .`.
- Create `/devplans/WALKTHROUGH_FULL_CODEBASE_SECURITY_AUDIT_AND_RELEASE.md`.
- Stage, commit, and push to GitHub `main` branch.
