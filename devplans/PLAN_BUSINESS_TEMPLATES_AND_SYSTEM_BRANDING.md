# PLAN: Modal Confirmation Standardization, Dynamic Header Logo & App Name, Organizational Data Hub, and Business Email Templates Engine

**Author:** Antigravity AI Orchestrator  
**Date:** 2026-10-27  
**Status:** In Progress (Plan Established)

---

## 1. Architectural Strategy & Scope Breakdown

### Workstream 1: Replace Native `window.confirm()` with Styled Shadcn Confirmation Dialog
- **Target Components**:
  - `savazai-console/src/components/ui/alert-dialog.tsx`: Provide standard Radix/Shadcn `AlertDialog` primitives (`AlertDialog`, `AlertDialogTrigger`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogAction`, `AlertDialogCancel`).
  - `savazai-console/src/components/business/skills-registry.tsx`:
    - Remove `window.confirm(...)`.
    - Introduce state `pendingSkillTemplate: { key: string; label: string; template: string; category?: string } | null`.
    - Introduce modal trigger when template select changes and `formInstructions.trim()` is not empty.
    - Render styled confirmation dialog with `AlertTriangle` in amber/warning badge (`bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-full p-2`), title `"Replace Content with Template?"`, description `"Loading this blueprint will replace your current editor content. This action cannot be undone unless manually reverted."`, Cancel (`Keep Current Content`), Confirm (`Apply Template`).
  - `savazai-console/src/components/business/okf-registry.tsx`:
    - Remove `window.confirm(...)`.
    - Introduce state `pendingConceptTemplate: { key: string; label: string; template: string } | null`.
    - If `formMarkdown.trim()` is present, intercept change and open confirmation dialog.
    - Cancel dismisses and keeps current content; Confirm applies template to `formMarkdown` and updates `formType`.

### Workstream 2: Dynamic Header Logo & Configurable Application Name
- **Sidebar & Header Identity**:
  - `savazai-console/src/components/sidebar.tsx`:
    - Replace `<Bot className="h-7 w-7 text-primary shrink-0" />`.
    - When `brandLogoUrl` is valid: render `<img src={brandLogoUrl} alt={platformTitle || "Platform"} className="h-7 w-auto max-w-[140px] max-h-[30px] object-contain shrink-0" onError={() => setBrandLogoUrl(null)} />`.
    - When `brandLogoUrl` is null/empty or onError fires: render corporate brand mark `/savazar-logo.png` or styled corporate monogram emblem (e.g. elegant badge with `S` and gradient styling). Never render the generic purple robot icon.
    - Ensure `platformTitle` reflects `config.branding.appName` / `appTitle` (defaulting to `"SavazAI"`), dynamically editable from System Admin Branding.
    - Dynamic document title updates on branding change.
  - Public Assets:
    - Ensure `/savazar-logo.png` exists in `savazai-console/public/savazar-logo.png` as high-contrast corporate mark.
- **Branding UI in `settings-dashboard.tsx`**:
  - Add explicit editable input for **Application Name / Brand Title** (`appTitle` / `appName`) at the top of Branding Assets.
  - Maintain dropzone + URL fallback for Platform Logo and Browser Favicon.
  - Emit `"savazai-branding-updated"` event and persist via `saveSystemDesignAction` / `UPDATE system_configurations`.

### Workstream 3: Enterprise Organizational Data Hub
- **Schema & Persistence**:
  - In `src/db/schema.ts` and `system_configurations.designTokens.organizationalData`:
    ```typescript
    export interface OrganizationalData {
      companyName: string;
      taxIdOrRegistration?: string;
      country: string;              // ISO-3166-1 alpha-2 (e.g., "US", "IN", "GB", "DE")
      streetAddress: string;
      suiteOrUnit?: string;
      city: string;
      stateOrRegion: string;
      postalCode: string;
      timezone: string;             // IANA (e.g., "Asia/Kolkata", "America/New_York")
      defaultLanguage: string;      // ISO 639-1 (e.g., "en", "hi", "de")
      corporatePhone: string;
      corporateEmail: string;
      websiteUrl?: string;
    }
    ```
  - Define table `systemAuditLogs` in `src/db/schema.ts` and `savazai-console/src/lib/auth.ts`:
    ```typescript
    export const systemAuditLogs = pgTable("system_audit_logs", {
      id: uuid("id").defaultRandom().primaryKey(),
      userId: text("user_id"),
      userEmail: text("user_email"),
      action: varchar("action", { length: 128 }).notNull(),
      resource: varchar("resource", { length: 128 }).notNull(),
      details: jsonb("details").$type<Record<string, any>>().default({}),
      ipAddress: text("ip_address"),
      createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    });
    ```
  - Server actions in `savazai-console/src/app/admin/settings/actions.ts`:
    - `saveOrganizationalDataAction(data: OrganizationalData)`:
      - Validates required fields (`companyName`, `country`, `corporateEmail`).
      - Updates `system_configurations.design_tokens.organizationalData`.
      - Logs audit record in `system_audit_logs`.
      - Revalidates `/admin/system` and `/admin/settings`.
- **i18n-Aware Organizational Data UI**:
  - In `settings-dashboard.tsx` under the Branding tab:
    - Add **"Enterprise Organizational Data Hub"** card.
    - Fields:
      - Organization Name (`companyName`), Tax ID / Business Registration (`taxIdOrRegistration`), Website URL (`websiteUrl`).
      - Country selector with ISO flags and search (US, IN, GB, DE, CA, AU, SG, JP, FR, etc.).
      - Dynamic Address Form:
        - When `country === "US"`: State label displays "State" with 50 US States select; Postal Code label displays "ZIP Code".
        - When `country === "IN"`: State label displays "State / UT" (Indian States/UTs select) and Postal Code displays "PIN Code" (6-digit validation hint).
        - When `country === "GB"`: State label displays "County / Region"; Postal Code displays "Postal Code".
        - Default / Other: "Region / Province" and "Postal / Area Code".
      - Timezone picker with major IANA timezones grouped by region (`Asia/Kolkata`, `America/New_York`, `America/Los_Angeles`, `Europe/London`, `Europe/Berlin`, `Asia/Singapore`, `Asia/Tokyo`, `Australia/Sydney`, `UTC`).
      - Default Language dropdown (English - US, English - UK, Hindi, Spanish, French, German, Japanese, Portuguese).
      - Corporate Phone (with country code prefix badge) and Corporate Email.

### Workstream 4: Business Center Email Message Templates Engine
- **Schema & Database Table**:
  - Define `emailTemplates` in `src/db/schema.ts` and initialize in `savazai-console/src/lib/auth.ts`:
    ```typescript
    export const emailTemplates = pgTable("email_templates", {
      id: text("id").primaryKey(), // UUID
      templateKey: varchar("template_key", { length: 128 }).notNull().unique(),
      name: varchar("name", { length: 256 }).notNull(),
      category: varchar("category", { length: 64 }).notNull(), // "approval", "notification", "workflow_result", "system_alert"
      description: text("description"),
      subject: text("subject").notNull(),
      bodyHtml: text("body_html").notNull(),
      bodyMarkdown: text("body_markdown"),
      supportedVariables: jsonb("supported_variables").$type<string[]>(),
      isActive: boolean("is_active").default(true).notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    ```
- **Business Center UI Integration**:
  - In `savazai-console/src/app/business/page.tsx`:
    - Add sub-tab `"templates"` with icon `Mail` / `Send` and label `"Email Message Templates"`.
  - Create `savazai-console/src/components/business/email-templates-registry.tsx`:
    - Registry Table: Template Name & Key, Category Badge, Subject Preview, Active Variables, Status Toggle, Actions (Edit, Test Send, Delete).
    - Seed templates out-of-the-box:
      1. `hitl_approval_request` (Category: `approval`, Subject: `[Action Required] Approval Needed: {{workflow_title}} - {{execution_id}}`).
      2. `workflow_execution_success` (Category: `workflow_result`, Subject: `[Completed] Execution Finished: {{workflow_title}}`).
      3. `agent_escalation_alert` (Category: `system_alert`, Subject: `[Attention] Agent Alert from {{agent_name}} on Step {{step_name}}`).
      4. `operator_invitation_notification` (Category: `notification`, Subject: `[Access Granted] Invitation to join {{company_name}} on {{platform_title}}`).
    - WYSIWYG Template Authoring Modal:
      - Template Key (slugified) and Name.
      - Category dropdown.
      - Subject input with variable support.
      - Dual-mode Markdown/HTML body editor with toolbar.
      - System Merge Variables Pill Bar: Clickable tags (`{{agent_name}}`, `{{workflow_title}}`, `{{step_name}}`, `{{approver_email}}`, `{{review_link}}`, `{{execution_id}}`, `{{status}}`, `{{timestamp}}`, `{{company_name}}`). Clicking any tag inserts it at the cursor position.
      - Live Split Preview: Interactive preview with mock variable substitutions rendering the styled email card.
      - Test Dispatch Dialog: Enter recipient email and click "Send Test Email" using platform SMTP transporter (`sendTransactionalEmail`).
- **Runtime Template Renderer**:
  - Create `savazai-console/src/lib/email/template-renderer.ts`:
    - `export async function renderEmailTemplate(templateKey: string, context: Record<string, any>): Promise<{ subject: string; bodyHtml: string; bodyMarkdown?: string }>`
    - Ingests template from DB, replaces variables `{{key}}` with context values or graceful fallbacks, returns rendered subject & body.

---

## 2. Implementation Steps

1. **Step 1: Styled Confirmation Dialog Primitives & Integrations**
   - Create `components/ui/alert-dialog.tsx`.
   - Update `skills-registry.tsx` and `okf-registry.tsx` to eliminate all `window.confirm()` calls and wire the styled dialog.
2. **Step 2: Dynamic Header Logo & App Name**
   - Provide corporate emblem asset `/savazar-logo.png` in `public/`.
   - Update `sidebar.tsx` to eliminate `<Bot>` icon in header, render logo with fallback corporate emblem, and render dynamic `platformTitle`.
   - Update `settings-dashboard.tsx` Branding tab to include the editable **Application Name / Brand Title** field.
3. **Step 3: Enterprise Organizational Data Hub**
   - Add schema definitions in `src/db/schema.ts` and table initializers in `savazai-console/src/lib/auth.ts`.
   - Implement `saveOrganizationalDataAction` in `savazai-console/src/app/admin/settings/actions.ts`.
   - Add the i18n Organizational Data UI form in `settings-dashboard.tsx` with dynamic Country -> State/Postal Code reformatting and Timezone/Language selectors.
4. **Step 4: Business Center Email Message Templates Engine**
   - Create API endpoints `/api/email-templates` (GET, POST, PUT, DELETE, and test-send).
   - Create `email-templates-registry.tsx` with registry table, WYSIWYG editor, merge variable pills, live preview, and test send modal.
   - Integrate fourth tab in `business/page.tsx`.
   - Implement `renderEmailTemplate` helper.
5. **Step 5: Quality Gates & Knowledge Graph Sync**
   - Typecheck (`npx tsc --noEmit`).
   - Theme lint (`npm --prefix savazai-console run lint:theme`).
   - Contrast check (`npm --prefix savazai-console run check:contrast`).
   - Next.js build (`npm --prefix savazai-console run build`).
   - Knowledge graph sync (`graphify update .`).
   - Record proofs in `devplans/WALKTHROUGH_BUSINESS_TEMPLATES_AND_SYSTEM_BRANDING.md`.
