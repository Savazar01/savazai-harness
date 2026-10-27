# PLAN: Fix SMTP App Password Persistence, False-Positive Feedback & Command Center Canvas Expansion

---

## 1. Architectural Strategy & Root Causes

### A. Secret Persistence & Docker Vault Secret Alignment
- **Problem**: `savazai-console` in `docker-compose.yml` lacked `MASTER_VAULT_SECRET: ${MASTER_VAULT_SECRET:-sz_dev_master_secret_key_2026_change_in_production_!!}`.
- **Fix**: Inject `MASTER_VAULT_SECRET` into `savazai-console` environment in `docker-compose.yml` so both services share the exact AES-256 key derived via `scryptSync(secret, "salt", 32)`.

### B. Masked Password Overwrite Guard & Transporter Sanitation
- **Server Action (`actions.ts`)**:
  - In `updateSystemConfig`: If incoming `parsed.pass` is empty, only whitespace, or contains `"••••"`, preserve `current.pass` without modification.
  - If a fresh password is provided, strip all whitespace (`.trim().replace(/\s+/g, "")`) before encrypting with AES-256.
  - Apply the exact same preservation and whitespace-stripping logic to `sendgridApiKey`.
- **Transporter (`transporter.ts`)**:
  - In `createEmailTransporter(configOverride)`:
    - If `configOverride` is supplied, load stored configuration from `getSmtpConfig()` first.
    - If `configOverride.pass` is empty, contains `"••••"`, or is whitespace, fall back to the decrypted stored password from `getSmtpConfig()`.
    - Automatically strip whitespace from all passwords before passing to `nodemailer.createTransport`: `(cfg.pass || "").trim().replace(/\s+/g, "")`.
  - In `saveSmtpConfig`: Ensure masked or empty password strings never overwrite existing stored secrets.
- **Client Hub (`system-admin-hub.tsx`)**:
  - Do not pass `pass` in `configOverride` if `smtpSettings.pass` contains `"••••"` or is empty.
  - Add visual status pill: `[ Encrypted App Password Saved ✓ ]` when a password exists.
  - Add `[ Change Password ]` toggle allowing users to enter a new 16-character Google App Password cleanly without masked placeholder interference.
  - In Test Email modal, display exact error feedback when SMTP handshake fails.

### C. Collapsible Sub-Navigation & Canvas Expansion (`settings-dashboard.tsx`)
- Add `isNavCollapsed` state in `SettingsDashboard`.
- Add collapse/expand toggle button using Lucide `PanelLeftClose` and `PanelLeftOpen`.
- Update `TabButton` to support `isCollapsed` mode (icon-only with tooltip `title={label}`).
- Convert layout from rigid `grid grid-cols-4` to responsive `flex gap-6` with `isNavCollapsed ? "w-16" : "w-64"`.
- Expand container maximum width from `max-w-6xl` to `max-w-[1440px]` with fluid responsive adaptation.

---

## 2. File Change Breakdown

1. `docker-compose.yml`:
   - Add `MASTER_VAULT_SECRET: ${MASTER_VAULT_SECRET:-sz_dev_master_secret_key_2026_change_in_production_!!}` to `savazai-console` environment.
2. `savazai-console/src/app/admin/settings/actions.ts`:
   - Enhance `updateSystemConfig` to preserve existing secrets if incoming input contains `"••••"` or is empty/whitespace, and strip whitespace on incoming passwords before encrypting.
3. `savazai-console/src/lib/email/transporter.ts`:
   - Sanitize passwords by stripping all whitespace (`.replace(/\s+/g, "")`).
   - In `createEmailTransporter`, merge `configOverride` with stored config, ensuring masked/empty `pass` falls back to stored decrypted pass.
4. `savazai-console/src/components/admin/system-admin-hub.tsx`:
   - Password state management with "Change Password" toggle and "Saved ✓" indicator.
   - Sanitize test email payload so `"••••••••"` is never sent as plaintext password override.
5. `savazai-console/src/components/settings-dashboard.tsx`:
   - Collapsible sub-navigation with `PanelLeftClose`/`PanelLeftOpen`.
   - Full-width canvas layout up to `max-w-[1440px]`.

---

## 3. Verification Sequence
1. `npx tsc --noEmit`
2. `npm --prefix savazai-console run build`
3. `graphify update .`
4. Rebuild & restart Docker containers: `docker compose down && docker compose up --build -d`
5. Test saving Google App Password, verify it persists encrypted in DB without reset.
6. Verify test email delivery and audit log entry.
7. Verify collapsible navigation expands/collapses canvas seamlessly.
8. Document results in `/devplans/WALKTHROUGH_FIX_SMTP_PERSISTENCE_AND_CANVAS_EXPANSION.md`.
