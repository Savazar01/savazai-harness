# PROMPT SPECIFICATION: Complete User Administration (Approvals Queue & RBAC Profiles Matrix), Automated Invite Dispatch & User Self-Service Profile Hub

## 1. Context & Identified Production Gaps

Following the enterprise RBAC lockdown and obfuscated onboarding implementation, user acceptance testing and UI inspection revealed three distinct functional gaps:

### Gap 1: "Dispatch Email Directly" on Invite Generation Fails Silently (Ref: `image_4e7af8.png` & `image_4e7a9e.png`)
- **Observed Behavior**:
  - The administrator opened "Generate Onboarding Invite Link", specified `savasarala123@gmail.com`, and checked `"Dispatch Email Directly"`.
  - The modal generated the onboarding URL, but the user received no indication of email delivery status on screen.
  - If SMTP failed or was unconfigured, the modal swallowed the error and displayed `"Invitation Link Active"`, obscuring whether the email was delivered.
- **Root Cause**:
  - `POST /api/admin/invitations` invoked `sendEmail()` without verifying `const emailResult = await sendEmail(...)`. It returned `dispatchedEmail: sendEmailDirectly` unconditionally.
  - The modal UI in `user-management.tsx` did not display the email dispatch outcome (success confirmation vs failure diagnostic banner with copy fallback).

### Gap 2: Missing Approvals Queue & Roles/Profiles Management in User Admin (Ref: `image_4494dc.png` & `image_448d1c.png`)
- **Observed Behavior**:
  - A newly registered user (`savasarala123@gmail.com`) was correctly quarantined with: *"Account pending administrator approval and role provisioning."*
  - However, in `/admin/users`, the UI showed only a legacy flat table with simple `USER` / `ADMIN` pills.
  - There was NO tab to view the **Pending Approvals Queue** (`status === 'PENDING_APPROVAL'`), no **Approve & Assign Profile** action, and no **Roles & Access Profiles Matrix** to inspect the 6 system roles (`Super Administrator`, `Studio Flow Architect`, `Workspace Operator`, `Business Policy Manager`, `Infrastructure Lead`, `Auditor`) or manage custom profiles.
- **Requirements**:
  - Overhaul `/admin/users` into a modular 3-sub-tab layout:
    1. **Tab 1: Active Users Directory**: Full user management with real status pills, assigned RBAC profiles, edit/suspend/delete/reset actions.
    2. **Tab 2: Pending Approvals Queue**: Quarantined users with count badge (e.g. `Pending (2)`), requested timestamps, verification badges, and an interactive **Approve & Provision Role** drawer/modal.
    3. **Tab 3: Roles & Access Profiles Matrix**: Interactive 53-permission matrix categorized by platform module, showing the 6 system profiles and allowing creation of custom enterprise profiles.

### Gap 3: User Self-Service Profile Management (`/profile`)
- **Observed Behavior**:
  - Authenticated users had no self-service page to view their assigned profile, check active permissions, upload an avatar, maintain location/address details, or change their password.
- **Requirements**:
  - Create `/profile` with:
    1. **Personal Information**: Avatar upload, Full Name, Location / Address, Read-only verified email.
    2. **Security & Credentials**: Change Password form (Current, New, Confirm) with password validation and 2FA status.
    3. **My Access Profile**: Assigned role badge, description, and categorized permission pills.
    4. **Navigation Integration**: Link to `/profile` from the bottom-left sidebar user badge and top-right menus.

---

## 2. Screenshot Evidence Tracking
- `image_4e7af8.png`: Generate Onboarding Invite Link modal with "Dispatch Email Directly" checked for `savasarala123@gmail.com`.
- `image_4e7a9e.png`: "Invitation Link Active" modal displaying URL without email dispatch status.
- `image_4e7c3b.png`: Gmail inbox showing receipt of OTP code.
- `image_4494dc.png`: Quarantined user sign-in block: "Account pending administrator approval and role provisioning."
- `image_448d1c.png`: `/admin/users` showing only flat table with legacy `USER`/`ADMIN` pills.
