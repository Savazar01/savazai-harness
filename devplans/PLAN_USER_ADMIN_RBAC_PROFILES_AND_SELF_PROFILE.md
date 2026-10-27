# DEVPLAN: Complete User Administration (Approvals Queue & RBAC Profiles Matrix), Automated Invite Dispatch & User Self-Service Profile Hub

## 1. Architecture & Design Principles

### A. Separation of Concerns & Zero-Trust
1. **Quarantine Lifecycle**:
   - New users registered via invite/OTP are created with `status = 'PENDING_APPROVAL'`, `roleId = null`, and `mustResetPassword = true`.
   - They cannot sign in, establish sessions, or view dashboard screens until an administrator explicitly reviews them in the **Pending Approvals Queue** and assigns a valid RBAC profile.
2. **Dynamic Permission Enforcement**:
   - All roles, system profiles, and granular permissions adhere to the centralized `PERMISSION_REGISTRY` (53 permissions across 7 platform modules).
3. **Transparent Invite Feedback**:
   - The invitation modal must provide unambiguous real-time feedback on email delivery status, preventing silent email failures and guiding administrators to manual copy fallback if SMTP is unconfigured.
4. **Self-Service Transparency**:
   - Authenticated operators have a dedicated `/profile` hub to maintain their profile information, change credentials, and audit their active permissions without needing admin intervention for basic profile management.

---

## 2. File Change Breakdown

### A. Database & Schema
- `src/db/schema.ts`:
  - Add `location: text("location")` to `users` table.
- `savazai-console/src/lib/auth.ts`:
  - Add DDL in `ensureAdminProvisioned` for `location` and `image` columns on `user` table:
    `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "location" TEXT;`
    `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "image" TEXT;`

### B. Fix Invitation Email Dispatch
- `savazai-console/src/app/api/admin/invitations/route.ts`:
  - When `sendEmailDirectly === true`, capture `const emailResult = await sendEmail(...)`.
  - Return `{ success: true, inviteUrl, emailSent: emailResult.success, emailError: emailResult.error, email, expiresAt }`.
- `savazai-console/src/components/admin/user-management.tsx`:
  - Update `handleGenerateInvite` to capture `emailSent` and `emailError`.
  - Render explicit status banner inside the modal:
    - Success: Green banner `✓ Invitation email successfully sent to ${email}`.
    - Failure: Amber banner `⚠️ Email delivery failed: ${emailError}. Please copy the link below and share it directly.`

### C. User Administration Modular Overhaul (`/admin/users`)
- Refactor `savazai-console/src/components/admin/user-management.tsx`:
  - Implement top sub-tab navigation:
    1. `[ Active Users Directory ]`
    2. `[ Pending Approvals (${pendingCount}) ]` (with badge)
    3. `[ Roles & Profiles Matrix ]`
  - **Sub-Tab 1: Active Users Directory**:
    - Filter users where `status !== 'PENDING_APPROVAL'`.
    - Columns: User (avatar, name, email), Assigned Profile (display name with colored badge), Status (`ACTIVE` / `SUSPENDED`), Created Date, Actions:
      - Edit user profile & assign role.
      - Toggle Account Status (`ACTIVE` <-> `SUSPENDED`).
      - Force Password Reset.
      - Delete User.
  - **Sub-Tab 2: Pending Approvals Queue**:
    - Filter users where `status === 'PENDING_APPROVAL'`.
    - Columns: User, Requested Date, Verification Status (`Email OTP Verified`), Actions:
      - **[ Approve & Assign Profile ]**: Opens approval modal with dropdown of all available roles (`Super Administrator`, `Studio Flow Architect`, `Workspace Operator`, `Business Policy Manager`, `Infrastructure Lead`, `Auditor`, or custom roles), role description, optional custom permission overrides. Submitting updates user to `status = 'ACTIVE'` with assigned `roleId`.
      - **[ Reject & Purge ]**: Deletes quarantined record.
  - **Sub-Tab 3: Roles & Access Profiles Matrix**:
    - Fetches `/api/admin/roles`.
    - Displays cards for the 6 predefined system profiles:
      - `Super Administrator` (53 permissions)
      - `Studio Flow Architect` (Studio + Docs)
      - `Workspace Operator` (Agent Workspace + Docs)
      - `Business Policy Manager` (Skills, OKF, Compliance)
      - `Infrastructure Lead` (Command Center)
      - `Auditor` (Read-only access)
    - Full interactive 53-permission matrix grouped by categories:
      - Capability Studio (9)
      - Business Center (13)
      - Command Center (10)
      - Agent Workspace (9)
      - Documentation (3)
      - Demo Requests (4)
      - User Admin (5)
    - **[ + Create Custom Profile ]** button & modal to define new custom enterprise roles.

### D. User Self-Service Profile Hub
- `savazai-console/src/app/profile/page.tsx`:
  - Protected page checking active session.
  - Passes session access context (`user`, `role`, `permissions`) to client component.
- `savazai-console/src/components/profile/profile-hub.tsx`:
  - **Card 1: Personal Profile**:
    - Avatar preview / file upload (stores base64 data URL in `user.image`).
    - Full Name input.
    - Location / Address input.
    - Verified email (read-only with badge).
    - Save Profile button calling `PATCH /api/auth/profile`.
  - **Card 2: Security & Credentials**:
    - Change Password form (Current Password, New Password, Confirm Password) with strength checks.
    - Calls `POST /api/auth/change-password`.
    - 2FA / OTP status indicator.
  - **Card 3: My Access Profile & Permissions**:
    - Display assigned role badge and role description.
    - Categorized accordion / pills of all granted permissions.
- `savazai-console/src/app/api/auth/profile/route.ts`:
  - `PATCH` endpoint updating `name`, `location`, `image` for current session user.
- `savazai-console/src/app/api/auth/change-password/route.ts`:
  - `POST` endpoint verifying current password, updating new password hash, and clearing `mustResetPassword`.
- `savazai-console/src/components/sidebar.tsx`:
  - Add user profile button in sidebar footer above Sign Out with avatar, name, and role badge linking to `/profile`.

---

## 3. Testing & Verification Strategy

1. **Invite Email Dispatch Verification**:
   - Generate invite link with "Dispatch Email Directly" checked.
   - Verify modal shows explicit delivery status (success or SMTP error reason with copy link fallback).
   - Verify record in `email_audit_logs`.
2. **Pending Approvals Queue & Role Assignment Verification**:
   - Verify quarantined user `savasarala123@gmail.com` appears in "Pending Approvals" tab with count badge `Pending (1)`.
   - Click "Approve & Assign Profile", select `Workspace Operator`, and submit.
   - Confirm user moves to "Active Users Directory" with `status = 'ACTIVE'` and role `Workspace Operator`.
   - Sign in as `savasarala123@gmail.com` and verify successful login.
3. **Roles & Profiles Matrix Verification**:
   - Navigate to "Roles & Profiles Matrix" tab.
   - Verify all 6 predefined profiles are listed with accurate permission counts.
   - Verify 53-permission matrix is displayed grouped by platform module.
   - Test creating a custom profile (e.g. `Custom Demo Operator`).
4. **Self-Service Profile Hub Verification**:
   - Navigate to `/profile`.
   - Update full name, location, and upload avatar. Verify persistence.
   - Change password and verify login with new password.
   - Verify "My Access Profile" accurately lists assigned permissions.
5. **Quality Gates**:
   - `npx tsc --noEmit`
   - `npm --prefix savazai-console run build`
   - `graphify update .`
   - Docker container restart & health check.
