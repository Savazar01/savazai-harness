# PROMPT: Attack Surface Minimization, Obfuscated Onboarding, Command Center "System Admin" Hub & Real SMTP/OTP Delivery

## 1. Context & Identified Vulnerabilities

Following our recent security hardening:
1. **Attack Surface Leakage on `/signin`**:
   - `image_5237b9.png` shows an open link: `"Need enterprise workspace access? Request Quarantined Account (OTP + Admin Approval)"`.
   - This link gives public visitors, crawlers, and automated bots a direct path to the onboarding pipeline, inviting spam requests and OTP flooding.
   - **Remediation**: Completely remove this link from `/signin`. The sign-in page must strictly be a login gate with zero public onboarding links.
2. **Predictable `/signup` Route Elimination**:
   - `image_523077.png` and `image_521a54.png` show the page living at `http://localhost:3056/signup`.
   - Automated scanners probe `/signup`, `/register`, etc.
   - **Remediation**: Deprecate and remove `/signup`. Replace it with an administrative invite-only onboarding route (e.g., `/auth/invite/onboard` with an administrative invite token or configurable secret path) that administrators share explicitly with pre-authorized operators. Direct hits to `/signup` or `/register` must return `404 Not Found` or redirect to `/signin`.
3. **Missing "System Admin" Configuration in Command Center**:
   - Currently, there is no UI to configure Cloudflare Turnstile keys, Google reCAPTCHA keys, or SMTP/Gmail email credentials.
   - **Remediation**: Add a 9th sub-tab in the Command Center (`/admin/settings`) titled **"System Admin"** (protected by `command_center:system_admin_manage` / `command_center:system_admin_view` permissions).
   - The tab must configure:
     - **Security & Bot Protection**: CAPTCHA provider toggle (Turnstile vs. reCAPTCHA v3), Site Key, and Secret Key.
     - **Email Service & Delivery**: SMTP Host, Port, Secure (TLS), User, Password/App-Password, From Name, From Address, or Gmail OAuth credentials.
     - **Email Delivery & OTP Audit Log**: Table of recently dispatched emails/OTPs with timestamps, recipient, status (`SENT`, `FAILED`), and a **"Send Test Email"** action to verify deliverability live.
4. **OTP Dispatch Failure**:
   - In `image_521a54.png`, the system reported a 6-digit code was sent to `savazarco@gmail.com`, but no email arrived because the backend lacked an active SMTP/Nodemailer transport or fell back silently to `console.log`.
   - **Remediation**: Connect the OTP service to real Nodemailer/SMTP transport configured via the new System Admin settings, with strict error catching and delivery verification.

## 2. DevPlans Framework & Quality Gates

Maintain all files in `/devplans`:
- `PROMPT_OBFUSCATED_ONBOARDING_AND_SYSTEM_ADMIN.md`
- `PLAN_OBFUSCATED_ONBOARDING_AND_SYSTEM_ADMIN.md`
- `WALKTHROUGH_OBFUSCATED_ONBOARDING_AND_SYSTEM_ADMIN.md`
