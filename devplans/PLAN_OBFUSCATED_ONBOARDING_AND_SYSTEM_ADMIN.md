# IMPLEMENTATION PLAN: Attack Surface Minimization, Obfuscated Onboarding, Command Center "System Admin" Hub & Real SMTP/OTP Delivery

## 1. Executive Summary & Problem Analysis

Following our recent deployment of Zero-Trust Onboarding and RBAC controls, four critical security and operational gaps were identified in live testing (`image_5237b9.png`, `image_523077.png`, `image_521a54.png`):

1. **Attack Surface Leakage on `/signin`**:
   - The signin form rendered an open footer: `"Need enterprise workspace access? Request Quarantined Account (OTP + Admin Approval)"` linking directly to `/signup`.
   - **Vulnerability**: Exposes the onboarding pipeline to automated bots, web crawlers, and malicious actors, inviting spam account creation attempts and OTP verification flooding.
   - **Fix**: Completely remove this link from `/signin`. The login page becomes a strict zero-disclosure credential gate.

2. **Predictable `/signup` Route Elimination**:
   - The onboarding form was hosted at the well-known path `/signup`.
   - **Vulnerability**: Standard dictionary attacks and web scanners target `/signup` and `/register`.
   - **Fix**: Permanently deprecate `/signup` (configured in Next.js middleware and page routing to return 404 or redirect to `/signin`). Introduce an administrative invite-only onboarding route: `/auth/invite/onboard?token=<TOKEN>&email=<EMAIL>` protected by single-use or time-bounded cryptographic invitation tokens generated exclusively by platform administrators.

3. **Missing "System Admin" Management Hub in Command Center**:
   - There was no UI to configure Cloudflare Turnstile / reCAPTCHA v3 keys, or SMTP / Gmail transactional email credentials.
   - **Fix**: Add a dedicated 9th sub-tab **"System Admin"** in the Command Center (`/admin/settings`), guarded by permissions `command_center:system_admin_view` and `command_center:system_admin_manage` (assigned to Super Administrator).
   - This tab provides:
     - **Bot Protection & CAPTCHA**: Provider toggle (Turnstile vs reCAPTCHA v3), Site Key, Secret Key, and live key validation.
     - **Email Service & Delivery**: Provider selector (`SMTP Server`, `Gmail App Password`, `SendGrid API`), Host, Port, Secure (TLS), Username, Password/App-Password, Sender Name, Sender Email.
     - **"Send Test Email" Action**: Modal to send a live test message to any email address and display real-time transport handshake results.
     - **Outbound Email & OTP Audit Log**: Real-time table displaying recent outbound emails with recipient, purpose, status (`SENT`/`FAILED`), timestamp, and failure diagnostics.

4. **Real SMTP Email & OTP Delivery**:
   - In live testing, OTP dispatch fell back silently to `console.log` because no SMTP transporter was configured. No email reached `savazarco@gmail.com`.
   - **Fix**: Implement a dynamic Nodemailer transport engine in `savazai-console/src/lib/email/transporter.ts` that dynamically loads encrypted SMTP/Gmail credentials from `system_configurations.design_tokens.smtpSettings`. Connect `generateAndSendEmailOtp` to this engine and record all delivery attempts in a newly created `email_audit_logs` database table.

---

## 2. Technical & Security Deep Dive

### 2.1 Threat Model & Attack Surface Elimination

| Attack Vector | Current State | Hardened State | Mitigation Mechanism |
| :--- | :--- | :--- | :--- |
| **Public Route Enumeration** | `/signup` responds with onboarding form | `/signup` & `/register` return 404 / 302 to `/signin` | Middleware route blocking & route removal |
| **Signin Page Reconnaissance** | Link on `/signin` reveals onboarding route | No links, zero public onboarding references | Removal of link in `signin-form.tsx` |
| **Unauthorized Onboarding Requests** | Anyone with email can submit request | Only users with cryptographically signed, unexpired invite tokens can submit | CSPRNG 32-byte invitation token stored in `verification_token` with `purpose = 'invitation'` |
| **Credential & Key Exposure** | Plaintext SMTP passwords in config files | Encrypted at rest via AES-256-GCM (`lib/crypto.ts`) | Dynamic encryption/decryption in database layer |
| **Undetected Email / OTP Failures** | Silent console log fallback | Every outbound dispatch logged to `email_audit_logs` | Dedicated audit logging table with error traces |
| **Spam / Bot Submissions** | Basic checkbox simulation | Real Turnstile / reCAPTCHA v3 verification using dynamic server-side secrets | Verification against Cloudflare/Google verify API |

### 2.2 Cryptographic Invitation Token Protocol
```
Admin in User Admin UI 
  ├──> Clicks "Generate Onboarding Invite Link"
  ├──> Inputs Invitee Email & Expiration (24h, 48h, 7d)
  ├──> Backend generates CSPRNG token (32 bytes hex)
  ├──> Hashes token (SHA-256) and inserts into verification_token:
  │      purpose: 'invitation'
  │      identifier: invitee_email
  │      token: sha256(rawToken)
  │      expiresAt: now + TTL
  └──> UI displays onboarding link:
         https://<host>/auth/invite/onboard?token=<rawToken>&email=<invitee_email>
       (Optional: dispatches invite email via Nodemailer if SMTP is active)

Invitee opens Link
  ├──> Route checks token & email against verification_token
  ├──> If expired or invalid -> displays "Access Denied: Invalid or Expired Invitation"
  └──> If valid -> displays Onboarding Form with locked email field, sends 6-digit OTP to that email, and submits to PENDING_APPROVAL quarantine.
```

---

## 3. Step-by-Step Implementation Breakdown

### Phase 1: Attack Surface Minimization & Route Hardening
- **Step 1.1**: Edit `savazai-console/src/components/signin-form.tsx` to remove lines 176–184 (`<div className="mt-6 pt-5 ...">Need enterprise workspace access? ...</div>`).
- **Step 1.2**: Update `savazai-console/src/middleware.ts` to block and redirect public attempts to `/signup`, `/register`, and `/sign-up` to `/signin` (or return 404).
- **Step 1.3**: Deprecate `savazai-console/src/app/signup/page.tsx` (replace with redirect to `/signin`).
- **Step 1.4**: Create `savazai-console/src/app/auth/invite/onboard/page.tsx` and `src/components/obfuscated-onboard-form.tsx`:
  - Validates `?token=` and `?email=` via a server action or API call (`/api/auth/invite/verify`).
  - If invalid, renders a sleek Zero-Trust "Access Denied: Invalid or Expired Invitation" screen.
  - If valid, pre-fills the email (disabled/read-only), executes CAPTCHA verification, triggers real 6-digit OTP dispatch, and submits user record in `PENDING_APPROVAL` quarantine with zero roles and `mustResetPassword: true`.

### Phase 2: Schema Migration & Audit Logging Table
- **Step 2.1**: Update `src/db/schema.ts` to declare `emailAuditLogs`:
  ```ts
  export const emailAuditLogs = pgTable("email_audit_logs", {
    id: uuid("id").defaultRandom().primaryKey(),
    recipient: text("recipient").notNull(),
    subject: text("subject").notNull(),
    purpose: text("purpose").notNull(), // 'onboarding_otp', 'password_reset', 'test_email', 'admin_invite'
    status: varchar("status", { length: 50 }).notNull(), // 'SENT', 'FAILED'
    error: text("error"),
    metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  });
  ```
- **Step 2.2**: In `savazai-console/src/lib/auth.ts`, ensure `ensureAdminProvisioned` creates the `"email_audit_logs"` table idempotently if it does not already exist.

### Phase 3: Dynamic Email Transporter & Real Delivery Engine
- **Step 3.1**: Install `nodemailer` and `@types/nodemailer` in `savazai-console`.
- **Step 3.2**: Create `savazai-console/src/lib/email/transporter.ts`:
  - Retrieves active `smtpSettings` from `system_configurations.design_tokens`.
  - Decrypts password using `decrypt()` from `@/lib/crypto`.
  - Supports:
    1. **Custom SMTP Server** (`host`, `port`, `secure`, `user`, `pass`).
    2. **Gmail App Password** (`service: 'gmail'`, `user`, `pass`).
    3. **SendGrid API** (via SendGrid v3 API or SMTP `smtp.sendgrid.net`).
  - Implements `sendEmail({ to, subject, html, text, purpose })`.
  - Inserts result record into `email_audit_logs` regardless of success or failure.
  - Implements `verifySmtpConnection()` to test SMTP handshake without sending an email.
- **Step 3.3**: Refactor `savazai-console/src/lib/auth/otp.ts`:
  - Replace dummy SendGrid/console-log with call to `sendEmail(...)`.
  - Format professional dark-mode HTML email template with security notices and branded styling.

### Phase 4: Permissions Registry & Super Admin Seeding
- **Step 4.1**: In `savazai-console/src/lib/auth/permissions-registry.ts`:
  - Add `command_center:system_admin_view` ("View System Admin Settings")
  - Add `command_center:system_admin_manage` ("Manage System Admin & SMTP")
  - Add both permissions to `role_super_admin` in `SYSTEM_ROLES`.
- **Step 4.2**: In `savazai-console/src/lib/auth.ts`, update role permission seeding so `role_super_admin` receives the new permissions upon system startup.

### Phase 5: Command Center "System Admin" 9th Sub-Tab
- **Step 5.1**: In `savazai-console/src/components/settings-dashboard.tsx`:
  - Add `system_admin` to `TabType`.
  - Add tab button: `TabButton tab="system_admin" icon={ShieldAlert} label="System Admin"`.
  - Implement the **System Admin Tab Component**:
    - **Section 1: Bot Protection & CAPTCHA**:
      - Provider toggle: Cloudflare Turnstile vs Google reCAPTCHA v3.
      - Site Key and Secret Key inputs (with masked display for Secret Key).
      - "Test CAPTCHA Key" button.
    - **Section 2: Transactional Email & SMTP Service**:
      - Provider dropdown: `SMTP Server` | `Gmail App Password` | `SendGrid API`.
      - Host, Port (default 587/465), SSL/TLS toggle (`secure`).
      - Auth Username / Email.
      - Auth Password / App-Password (encrypted via `@/lib/crypto`).
      - Sender Name (e.g. `SavazAI Security`) and Sender Email (`security@savazar.com`).
      - Action: **"Send Test Email"** button opening a modal with Target Email input, executing live delivery test, and displaying exact connection handshake results.
    - **Section 3: Outbound Email & OTP Audit Log**:
      - Real-time table fetching from `/api/admin/system/email-logs`.
      - Displays last 25 outbound dispatches: Recipient, Subject/Purpose, Status (`SENT` with green badge / `FAILED` with red badge), Timestamp, and expandable error message tooltip.
      - "Refresh Logs" button.

### Phase 6: System Admin API Routes
- **Step 6.1**: Create `savazai-console/src/app/api/admin/system/test-email/route.ts`:
  - Guarded by `requirePermission("command_center", "system_admin_manage")`.
  - Accepts `{ targetEmail, configOverride? }`.
  - Uses dynamic transporter to dispatch a test email to `targetEmail`.
  - Returns `{ success: boolean, messageId?: string, error?: string }`.
- **Step 6.2**: Create `savazai-console/src/app/api/admin/system/email-logs/route.ts`:
  - Guarded by `requirePermission("command_center", "system_admin_view")`.
  - Queries `email_audit_logs` ordered by `created_at DESC` limit 50.
  - Returns `{ logs: EmailAuditLog[] }`.
- **Step 6.3**: Create `savazai-console/src/app/api/admin/invitations/route.ts`:
  - Guarded by `requirePermission("user_admin", "approve_users")`.
  - POST: Generates CSPRNG 32-byte token for given invitee email, saves to `verification_token` with expiration, returns full invite URL.
  - GET: Lists active invitation tokens.
- **Step 6.4**: Create `savazai-console/src/app/api/auth/invite/verify/route.ts`:
  - Unauthenticated endpoint that validates `token` and `email` against `verification_token` without leaking system state.

### Phase 7: User Admin "Generate Onboarding Invite Link" Modal
- **Step 7.1**: In `savazai-console/src/components/admin/user-management.tsx`:
  - Add a **"Generate Invite Link"** button with `UserPlus` / `Link` icon at the top of the User Directory.
  - Build modal:
    - Input: Invitee Email.
    - Expiration dropdown: 24 Hours, 48 Hours, 7 Days.
    - Button: "Generate Secure Link".
    - Result view: Generated Link with 1-click "Copy Link" button, expiration countdown, and optional "Dispatch Email Directly to Invitee" button.

---

## 4. Verification & Quality Gates

1. **Compilation & Typing**:
   - `npx tsc --noEmit` (Root workspace)
   - `cd savazai-console && npx tsc --noEmit`
   - `cd savazai-console && npm run build`
2. **Knowledge Graph Synchronization**:
   - `graphify update .`
3. **Container Infrastructure**:
   - `docker compose down && docker compose up --build -d`
   - `docker compose ps` verifying all 3 containers are healthy.
4. **End-to-End Penetration & Delivery Verification**:
   - **Check 1: Attack Surface**: Verify `GET /signin` contains no links to `/signup` or `/register`.
   - **Check 2: Route Obfuscation**: Verify `GET /signup` and `GET /register` return 404 or redirect to `/signin`.
   - **Check 3: Invite Verification**: Verify `/auth/invite/onboard` without a valid token returns 403/Access Denied.
   - **Check 4: Real Email Delivery**: Configure SMTP / Gmail credentials in Command Center -> System Admin, send a test email to `savazarco@gmail.com`, and verify delivery and appearance in `email_audit_logs`.
   - **Check 5: Live Onboard with Token**: Generate an invite link for `savazarco@gmail.com`, follow the link, receive real 6-digit OTP in Gmail inbox, complete onboarding, and verify user is placed in `PENDING_APPROVAL` with zero permissions.
5. **Documentation**:
   - Write `/devplans/WALKTHROUGH_OBFUSCATED_ONBOARDING_AND_SYSTEM_ADMIN.md` documenting all changes and test outputs.
