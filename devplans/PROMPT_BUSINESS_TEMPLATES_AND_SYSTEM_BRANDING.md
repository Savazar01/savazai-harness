# PROMPT: Modal Confirmation Standardization, Dynamic Header Logo & App Name, Organizational Data Hub, and Business Email Templates Engine

**Author:** Antigravity AI Orchestrator  
**Date:** 2026-10-27  
**Scope:** Confirmation Dialogs Standardization, Dynamic Header Logo & App Name, Enterprise Organizational Data Hub, Business Center Email Message Templates Engine  
**Evidence Artifacts:** `image_16335c.jpg`, `image_162f21.jpg`, `image_162c16.jpg`, `image_162782.png`

---

## 1. Problem Statement & User Feedback

Visual inspection and user defect reports identified four distinct areas needing immediate implementation and standardization:

1. **Unstyled Browser Native `window.confirm()` Popups (`image_16335c.jpg` & `image_162c16.jpg`)**:
   - In both the Skills editor (`skills-registry.tsx`) and Google OKF Concept editor (`okf-registry.tsx`), switching blueprint templates invokes the native browser alert `window.confirm("Replace current instructions with the selected blueprint template?")` or `window.confirm("Replace current guidelines markdown with the selected concept template?")`.
   - **Requirement**: Replace these browser alerts with the application's standard styled Shadcn `AlertDialog` / modal component matching the clean "Reject & Purge Request" confirmation modal shown in `image_162f21.jpg`.
   - Cancel keeps existing content without loading the template; Confirm loads the selected blueprint into the editor and dismisses the dialog.

2. **Persistent Robot Icon & Hardcoded "SavazAI" Brand (`image_162782.png`)**:
   - The top-left corner of the sidebar still renders a generic purple robot icon (`Bot`) and hardcoded "SavazAI" brand text.
   - **Requirement**: Sidebar and application headers must render the configured platform logo image (with a clean corporate brand mark fallback if not uploaded) alongside the configurable application name (`appName` / `platformTitle`). This must be directly editable in **System Admin -> Branding**.

3. **Enterprise Organizational Data Hub (System Admin -> Branding)**:
   - System administrators must be able to specify comprehensive organizational details: Company Name, Tax ID / Business Registration, i18n-compliant Address (Country, Street Address, Suite/Unit, City, State/Region, Postal Code), Timezone, Default Language, Corporate Email, Corporate Phone, and Website URL.
   - Changing the `Country` selector must dynamically reformat address fields to match international conventions (e.g. US State + ZIP vs. India State/UT + PIN vs. UK County/Region + Postal Code vs. General Province + Area Code).
   - Configuration must persist to database and log an audit entry in `system_audit_logs`.

4. **Business Center Email Message Templates Engine**:
   - In the **Business Center** (`/business`), add a dedicated sub-catalog tab: **"Email Message Templates"** alongside Universal Skills, Google OKF Concepts, and Compliance & PII Rules.
   - Provide a full-featured WYSIWYG rich text editor to compose message templates with Subject and HTML/Markdown Body.
   - Support system merge tags (`{{agent_name}}`, `{{workflow_title}}`, `{{step_name}}`, `{{approver_email}}`, `{{review_link}}`, `{{execution_id}}`, `{{status}}`, `{{timestamp}}`, `{{company_name}}`) for automated notifications, human-in-the-loop approvals, and workflow result dispatches.
   - Live preview with mock variable substitutions and live test dispatch capability over configured SMTP transporter.
   - Database table `email_templates` and export runtime helper `renderEmailTemplate(templateKey, context)`.

---

## 2. Evidence Mapping

| Screenshot Ref | Component / Route | Defect / Desired State |
| :--- | :--- | :--- |
| `image_16335c.jpg` | Skills Registry modal (`/business`) | Native browser `window.confirm` modal when selecting blueprint template while editor has content. |
| `image_162c16.jpg` | OKF Concept modal (`/business`) | Native browser `window.confirm` modal when selecting concept template while editor has content. |
| `image_162f21.jpg` | User Admin (`/admin/users`) | Target aesthetic: Clean Shadcn modal with backdrop blur, rounded-2xl container, warning icon, title, description, and styled action buttons. |
| `image_162782.png` | Sidebar (`/dashboard`, `/business`, `/studio`) | Top-left sidebar displays generic purple `<Bot className="h-7 w-7 text-primary" />` icon and static text. Needs dynamic configured logo or corporate emblem + editable app name. |

---

## 3. Mandatory Engineering Mandates & Quality Gates

1. Zero domain-specific hardcoding in engine core.
2. 100% adherence to `DESIGN.md` and semantic tokens (zero arbitrary hardcoded hex or non-adaptive dark classes).
3. Typecheck verification (`npx tsc --noEmit`).
4. Automated theme & contrast checks (`npm --prefix savazai-console run lint:theme` & `check:contrast`).
5. Production build pass (`npm --prefix savazai-console run build`).
6. Codebase knowledge graph update (`graphify update .`).
