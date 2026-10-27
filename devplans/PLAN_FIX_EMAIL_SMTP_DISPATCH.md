# PLAN: Deep Diagnostic, Live Log Inspection & Definitive Resolution for Nodemailer / Gmail SMTP Dispatch

---

## 1. Live Log Diagnostic Findings

Inspected container logs via `docker compose logs savazai-console --tail 120`:
```
savazai-console-1  | [Auth Diagnostic] Sign-in attempt for email: "savazar01@gmail.com"
savazai-console-1  | [Auth Diagnostic] Sign-in attempt for email: "savazar01@gmail.com"
```
**Critical Discovery**:
- Container logs showed zero incoming requests to `/api/admin/system/test-email` at the time the operator clicked "Dispatch Test".
- The root cause is that the modal was rendered inside the parent `<form onSubmit={handleSave}>` in `settings-dashboard.tsx`.
- In HTML/React, nested `<form>` elements trigger outer form submission (`handleSave`), which posted settings, flashed "Platform settings updated successfully.", and never executed `handleSendTestEmail`.

---

## 2. Technical Architectural Scope

### A. Nested Form & Modal Event Isolation (`system-admin-hub.tsx`)
1. **React Portal Rendering**:
   - Render the "Send Live Test Email" modal via `createPortal(..., document.body)` (guarded by `typeof document !== 'undefined'`).
   - This physically mounts the modal outside the `<form onSubmit={handleSave}>` DOM subtree, completely eliminating form submission bubbling collisions.
2. **Button & Event Handlers**:
   - Replace `<form onSubmit={handleSendTestEmail}>` with `<div className="space-y-4">`.
   - Use `<button type="button" onClick={handleSendTestEmail}>Dispatch Test</button>` with explicit `e.stopPropagation()` and `e.preventDefault()`.
3. **In-Modal Feedback & Loading States**:
   - Render loading spinner with `[ Dispatching... ]`.
   - On success: render emerald banner:
     `✓ Success! Email dispatched. Message ID: ${data.messageId}. Check inbox for ${testEmailTarget}.`
   - On error: render prominent red/amber alert:
     `✕ Dispatch Failed: ${data.error}`
   - Provide "Dispatch Again" and "Close" controls without abruptly dismissing the modal.

### B. Dynamic Transporter & Gmail Anti-Spoofing Fix (`transporter.ts`)
1. **Gmail Explicit Transport Parameters**:
   - Replace generic `service: "gmail"` with explicit host, port, and SSL:
     ```typescript
     if (cfg.provider === "gmail" || (cfg.host && cfg.host.includes("gmail"))) {
       return nodemailer.createTransport({
         host: "smtp.gmail.com",
         port: 465,
         secure: true,
         auth: {
           user: cleanUser,
           pass: cleanPass,
         },
         tls: {
           rejectUnauthorized: true,
         },
         connectionTimeout: 15000,
         greetingTimeout: 15000,
       });
     }
     ```
2. **Envelope Sender Alignment & Reply-To**:
   - In `sendEmail`:
     ```typescript
     const isGmail = cfg.provider === "gmail" || (cfg.host && cfg.host.includes("gmail"));
     const effectiveFrom = (isGmail && cfg.fromEmail && !cfg.fromEmail.includes("@gmail.com"))
       ? `"${cfg.fromName || 'SavazAI Platform'}" <${cfg.user}>`
       : `"${cfg.fromName || 'SavazAI Platform'}" <${cfg.fromEmail || cfg.user}>`;
     
     const replyTo = cfg.fromEmail && cfg.fromEmail !== cfg.user ? cfg.fromEmail : undefined;
     ```
   - Envelope `from` matches the authenticated Gmail account (`savazar01@gmail.com`), satisfying Google's anti-spoofing policy, while `replyTo` routes replies to `info@savazar.com`.
3. **Password Decryption Sanity Check**:
   - In `createEmailTransporter`, throw clear descriptive error if `cleanPass` is empty after decryption:
     ```typescript
     if (!cleanPass || cleanPass.length === 0) {
       throw new Error("SMTP Password decryption returned an empty string. Please re-enter your 16-character Google App Password in System Admin.");
     }
     ```

### C. Handshake Verification & Audit Logging in Route (`test-email/route.ts`)
1. Call `await transporter.verify()` before sending to test the TCP/TLS and auth handshake explicitly.
2. Call `await transporter.sendMail(...)` with `effectiveFrom`, `replyTo`, and `targetEmail`.
3. Record dispatch in `email_audit_logs` with status `SENT` or `FAILED`.
4. Return JSON `{ success: true, message: `Test email successfully dispatched to ${targetEmail}`, messageId: info.messageId }` or `{ success: false, error: err.message }` with appropriate status code.

---

## 3. Verification & Quality Gates Plan

1. Run root backend typecheck: `npx tsc --noEmit`.
2. Run console typecheck: `npx --prefix savazai-console tsc --noEmit`.
3. Production build verification: `docker compose build savazai-console`.
4. Knowledge graph sync: `graphify update .`.
5. Local stack restart: `docker compose down && docker compose up --build -d`.
6. Live execution of test email dispatch to `avasat01@gmail.com`.
7. Verify receipt in `email_audit_logs` and confirm message delivery.
8. Document all findings in `/devplans/WALKTHROUGH_FIX_EMAIL_SMTP_DISPATCH.md`.
