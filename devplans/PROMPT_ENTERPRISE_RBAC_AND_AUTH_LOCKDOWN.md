# PROMPT: Enterprise RBAC, Zero-Trust Onboarding & Access Control Lockdown

## Incoming Incident & Requirement
An unauthorized account creation occurred on our hosted production deployment (`savazai-harnessin.savazar.com`).
We require an airtight, enterprise-grade Zero-Trust Access & RBAC architecture across the entire SavazAI platform:

1. **Permanent Removal of Public Registration**: Eradicate any route, handler, or webhook allowing automated bot, crawler, or unauthorized human account creation (`/api/auth/sign-up/email`, `/api/auth/register`, `/api/auth/signup`, `/signup`).
2. **Bot Defense & Multi-Factor Email OTP**: Enforce CAPTCHA (Cloudflare Turnstile or reCAPTCHA v3) on sign-in and access request forms; mandate time-limited (10-minute) 6-digit email OTP verification (max 3 attempts) before credentials can be issued or reset.
3. **Quarantine State & Mandatory Admin Approval**: Any new user requested/created is set to `status = PENDING_APPROVAL` with **ZERO permissions** (`roleId = null`). They cannot sign in, view any sidebar menu, or invoke any API routes until an administrator explicitly approves the account and assigns roles/permissions.
4. **Forced First-Time Password Reset**: Users must change their password upon initial activation or reset before gaining dashboard access (`mustResetPassword: true`), intercepted globally to redirect to `/reset-password`.
5. **Universal Granular RBAC Permission Registry**: Fine-grained, action-level access controls covering every screen, tab, sub-component, and button across the platform (`PERMISSION_REGISTRY` with 50+ atomic resource:action pairs across Capability Studio, Business Center, Command Center, Agent Workspace, Documentation, Demo Requests, and User Admin).
6. **Future-Proof Extensibility**: Centralized `PERMISSION_REGISTRY` in `savazai-console/src/lib/auth/permissions-registry.ts` and database-backed `roles`, `role_permissions`, `user_permissions`, and `verification_tokens` tables.
7. **Complete API & Server Action Lockdown**: Every Next.js route handler, Server Action (`actions.ts`), and backend Express endpoint (`src/index.ts`) must enforce `requirePermission(resource, action)` or internal service authentication.
