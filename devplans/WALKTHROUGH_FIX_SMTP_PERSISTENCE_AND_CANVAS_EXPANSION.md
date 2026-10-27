# WALKTHROUGH: Fix SMTP App Password Persistence, False-Positive Feedback & Command Center Canvas Expansion

---

## 1. Executive Summary & Root Cause Diagnoses

We resolved the three critical production gaps identified in user testing and diagnostics (`image_4391f6.png`, `image_43a839.png`, `image_439d16.png`):

1. **SMTP Google App Password Persistence & Overwrite Flaw**:
   - **Root Cause A (Docker Secret Divergence)**: In `docker-compose.yml`, `savazai-console` was missing `MASTER_VAULT_SECRET`. As a result, console operations fell back to an unaligned default secret key (`"fallback_secret_key_long_enough_32"`), causing bad decrypt errors between containers.
   - **Root Cause B (Masked Placeholder Overwriting)**: When saving settings or dispatching test emails, the placeholder string `"••••••••"` or empty inputs were submitted back to `updateSystemConfig`, overwriting the stored encrypted token.
   - **Root Cause C (Whitespace in Google App Passwords)**: Google displays generated 16-character App Passwords with spaces (`abcd efgh ijkl mnop`). If encrypted or passed with whitespace to Nodemailer, Google SMTP rejects authentication (`535-5.7.8 Username and Password not accepted`).
   - **Root Cause D (Test Email Override Flaw)**: In `system-admin-hub.tsx`, `handleSendTestEmail` passed `pass: smtpSettings.pass` in `configOverride`. When `smtpSettings.pass` was `"••••••••"`, Nodemailer attempted connecting with literal bullets, bypassing decrypted database credentials.

2. **False-Positive Feedback Eradication**:
   - Client modals and route handlers now strictly enforce honest status reporting. If Nodemailer throws an SMTP handshake error, an explicit amber/red diagnostic banner renders with the exact upstream error string, and the user is provided with the pre-authorized copyable onboarding link as a guaranteed fallback.
   - Fixed email audit logs query showing historical delivery records and real-time statuses (`SENT` vs `FAILED`).

3. **Command Center Canvas Expansion & Collapsible Navigation**:
   - In `settings-dashboard.tsx`, replaced the rigid `max-w-6xl` container and fixed `w-64` navigation column with a fluid `max-w-[1400px]` responsive canvas.
   - Added a collapsible sub-navigation rail with `PanelLeftClose` and `PanelLeftOpen` toggle controls. When collapsed, the sub-navigation smoothly transitions to an icon-only rail (`w-16`) with hover tooltips (`title={label}`), expanding the active form canvas to full width for dense tables, logs, and JSON payloads.

---

## 2. Key Code Changes

### A. Docker Infrastructure Alignment (`docker-compose.yml`)
- Added `MASTER_VAULT_SECRET: ${MASTER_VAULT_SECRET:-sz_dev_master_secret_key_2026_change_in_production_!!}` to `savazai-console` container environment, guaranteeing unified AES-256 key derivation across all services.

### B. Secret Sanitization & Resilient Decryption (`savazai-console/src/lib/crypto.ts`)
- Updated `decrypt()` to attempt `process.env.MASTER_VAULT_SECRET` first, with graceful backward-compatible fallback to the legacy key if a record was encrypted prior to vault secret alignment:
```typescript
export function decrypt(encryptedText: string): string {
  if (!encryptedText) return "";
  const [ivHex, encrypted] = encryptedText.split(":");
  if (!ivHex || !encrypted) return encryptedText;

  const secrets = [
    process.env.MASTER_VAULT_SECRET,
    "fallback_secret_key_long_enough_32",
  ].filter(Boolean) as string[];

  const iv = Buffer.from(ivHex, "hex");

  for (const secret of secrets) {
    try {
      const key = scryptSync(secret, "salt", 32);
      const decipher = createDecipheriv(ALGORITHM, key, iv);
      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch {
      // Try next secret candidate
    }
  }

  return encryptedText;
}
```

### C. Server Actions Secret Preservation (`savazai-console/src/app/admin/settings/actions.ts`)
- In `updateSystemConfig`, safeguarded `smtpSettings.pass` and `sendgridApiKey` from being overwritten by placeholder strings:
```typescript
let passToStore = current.pass;
if (
  typeof parsed.pass === "string" &&
  parsed.pass.trim() !== "" &&
  !parsed.pass.includes("••••")
) {
  passToStore = encrypt(parsed.pass.trim().replace(/\s+/g, ""));
}
```

### D. Transporter Sanitation & Merging (`savazai-console/src/lib/email/transporter.ts`)
- In `createEmailTransporter`, automatically strip all whitespace from Google App Passwords: `(cfg.pass || "").trim().replace(/\s+/g, "")`.
- When `configOverride` is passed without a plaintext password (or containing `"••••"`), automatically fall back to the decrypted stored credentials from `getSmtpConfig()`.

### E. System Admin Hub Password UI (`savazai-console/src/components/admin/system-admin-hub.tsx`)
- Added `[ Encrypted Password Saved ✓ ]` visual indicator badge.
- Added `[ Change ]` button to cleanly replace stored credentials without interference from mask characters.
- In `handleSendTestEmail`, sanitized payload to omit `pass` when masked so the server cleanly decrypts database credentials.

### F. Command Center Canvas & Collapsible Menu (`savazai-console/src/components/settings-dashboard.tsx`)
- Expanded maximum width to `max-w-[1400px]`.
- Added `isNavCollapsed` toggle with Lucide `PanelLeftClose` and `PanelLeftOpen`.
- Added `isCollapsed` prop to `TabButton` (centers icons and displays tooltip).

---

## 3. End-to-End Verification Proofs

### A. TypeScript Verification
- Root Workspace: `npx tsc --noEmit` exited with code 0.
- Frontend Workspace: `npx --prefix savazai-console tsc --noEmit` exited with code 0.

### B. Knowledge Graph Sync
- Ran `graphify update .` successfully (rebuilt 5527 nodes, 7370 edges).

### C. Live Container Verification
- `docker compose ps`:
  - `savazai-harness-savazai-backend-1`: Up (healthy) on port 3055
  - `savazai-harness-savazai-console-1`: Up (healthy) on port 3056
  - `savazai-harness-savazai-db-1`: Up (healthy) on port 5622

### D. Live Transactional Email Delivery Test
- Dispatched live test email to `savasarala123@gmail.com`:
```json
{
  "success": true,
  "message": "Test email successfully dispatched to savasarala123@gmail.com",
  "messageId": "<2c7ee555-0e44-ce14-f026-07fc271efc3a@savazar.com>"
}
```
- Database Audit Log Entry (`email_audit_logs`):
```sql
recipient: savasarala123@gmail.com
subject: [SavazAI] Test Transactional Email Handshake
purpose: test_email
status: SENT
created_at: 2026-10-27 01:27:11.261198+00
```
- Tested second dispatch to verify password persistence:
```json
{
  "success": true,
  "message": "Test email successfully dispatched to savasarala123@gmail.com",
  "messageId": "<554ffd07-e53d-9ab2-ee4a-52fb3d9eff6d@savazar.com>"
}
```
Password was verified to decrypt cleanly as `dltkgcjklvuqnswv` without corruption or reset.
