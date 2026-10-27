# PROMPT: Deep Diagnostic, Live Log Inspection & Definitive Resolution for Nodemailer / Gmail SMTP Dispatch

---

## 1. Issue Description & Visual Evidence

Following our security and admin enhancements, the operator attempted to verify transactional email delivery via the Command Center System Admin Hub (`/admin/settings`):
- **Screenshot 1 (`media_1793064786961_3fd17be5.png`)**:
  - Transporter Provider: `Google Gmail App Password (Service: Gmail)`
  - SMTP Username / Email: `savazar01@gmail.com`
  - 16-Char Google App Password: entered / saved
  - Sender Display Name: `SavazAI Platform`
  - Sender Email Address (From): `info@savazar.com`
  - Form displayed: `Platform settings updated successfully.`
- **Screenshot 2 (`media_1793064910858_10e0f7f7.png`)**:
  - In *"Send Live Test Email"* modal, operator entered `avasat01@gmail.com` and clicked **"Dispatch Test"**.
  - The modal submitted but no test email was received at `avasat01@gmail.com`, and no in-modal diagnostics or error feedback were surfaced.
- **Screenshot 3 (`media_1793064980879_5a7460de.png`)**:
  - The System Admin view displayed `[ Encrypted Password Saved ]` with a `Change` button.

---

## 2. Root Cause Diagnoses

1. **Nested `<form>` DOM Collision in Next.js / React (Primary UI Culprit)**:
   - In `settings-dashboard.tsx`, the entire settings area is wrapped in `<form onSubmit={handleSave}>`.
   - In `system-admin-hub.tsx`, the "Send Live Test Email" dialog contained a nested `<form onSubmit={handleSendTestEmail}>` with `<button type="submit">Dispatch Test</button>`.
   - In standard browser DOM semantics, clicking submit in a nested form event-bubbles and triggers the *outer* form's `onSubmit={handleSave}`.
   - This caused the Command Center to post all settings, display `"Platform settings updated successfully."`, and dismiss/re-render the modal without ever invoking `POST /api/admin/system/test-email`!
   - Container logs confirm zero calls to `test-email` occurred during the button click.

2. **Google Gmail Anti-Spoofing From Envelope Rejection**:
   - The user authenticated with `savazar01@gmail.com`, but the envelope From address was set to `info@savazar.com`.
   - Gmail SMTP strictly mandates that the envelope sender matches the authenticated account (`savazar01@gmail.com`) or an authorized verified alias in Google Workspace. Non-matching envelope senders trigger `550 5.7.1 Unauthenticated email from domain is not accepted` or silent dropping.
   - Solution: When using Gmail provider, force envelope sender to `<${user}>` (`savazar01@gmail.com`), while preserving `Reply-To: ${fromEmail}` (`info@savazar.com`).

3. **Docker IPv6 DNS & Connection Hang in Container Bridge**:
   - `nodemailer.createTransport({ service: 'gmail' })` resolves `smtp.gmail.com` to IPv6 by default in Node.js 22, causing connection timeouts inside Docker's IPv4 bridge network.
   - Solution: Explicitly configure `host: "smtp.gmail.com"`, `port: 465`, `secure: true` with connection and greeting timeouts (15s).

4. **Transporter Verification & In-Dialog Feedback**:
   - The test email route must call `await transporter.verify()` before sending to test the handshake explicitly.
   - The modal must not close automatically upon submission; instead, it must render prominent emerald success alert with message ID or amber/red error box with the exact upstream error.
