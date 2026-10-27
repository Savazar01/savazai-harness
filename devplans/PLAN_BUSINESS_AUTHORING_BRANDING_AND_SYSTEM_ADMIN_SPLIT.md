# PLAN: Business Authoring Markdown Editors & Templates, Custom Regex Guide, Brand Customization, Landing Page Theme Placement & Dedicated System Administration Navigation

---

## 1. Architectural Strategy & Scope

This implementation encompasses 7 cohesive workstreams:

1. **Workstream 1: Skills Authoring Markdown Editor & Process Templates (`skills-registry.tsx`)**:
   - Sanitize `savazai-console/src/components/shared/markdown-editor.tsx` to replace hardcoded `hover:bg-slate-800` and `bg-slate-800` with semantic tokens (`hover:bg-muted`, `bg-border`, `text-foreground`).
   - Integrate `MarkdownEditor` into the "Create Custom Skill Definition" modal in `skills-registry.tsx`.
   - Add template selector dropdown:
     - Standard Business Process Agent Skill (Default structured blueprint)
     - Custom Local JS Snippet
     - Native TypeScript Tool
     - MCP-Bound Connector Skill
   - Prompt user confirmation if replacing non-empty existing content.

2. **Workstream 2: OKF Concepts Markdown Editor & Google OKF Template Ingestion (`okf-registry.tsx`)**:
   - Integrate `MarkdownEditor` into the "Author OKF Concept Bundle" modal in `okf-registry.tsx`.
   - Implement concept-aware starter blueprints based on selected Concept Type:
     - SOP Ruleset (Standard Operating Procedure)
     - Domain Glossary / Business Taxonomy
     - Security & Compliance Directive
   - Add **[ Upload Google OKF Template ]** file upload input accepting `.md` and `.json`.
   - Parse YAML frontmatter or JSON attributes (`conceptKey`, `title`, `category`, `tags`) and body markdown, auto-populating fields and editor.

3. **Workstream 3: Custom Regex Rules Interactive Documentation Guide (`compliance-manager.tsx`)**:
   - Add interactive trigger link `[ How to write custom regex patterns? 📖 ]` in the Custom Regex Rules card.
   - Implement an interactive modal/drawer with:
     - Streaming regex matching overview.
     - Syntax rules (escaping backslashes, word boundaries `\b`, group capturing).
     - 4 real-world enterprise pattern cards (MRN, Project Codewords, Invoices, Employee IDs).
     - One-click `[ Insert Example Pattern ]` action buttons that populate `regexLabel` and `regexPattern` in the form.

4. **Workstream 4: Universal High-Contrast Button Inversion Guardrail**:
   - Audit `button.tsx`, `skills-registry.tsx`, `okf-registry.tsx`, `compliance-manager.tsx`, and `settings-dashboard.tsx`.
   - Replace any instance of `bg-primary ... text-foreground` or dark text on saturated primary backgrounds with `text-primary-foreground font-semibold` or `text-white`.

5. **Workstream 5: Configurable Platform Brand Identity (Logo Replacing Robot Icon)**:
   - In `sidebar.tsx`, replace the static `Bot` icon and hardcoded `SavazAI` string with dynamically resolved branding from `system_configurations` (via `/api/settings` or state).
   - If a custom `logoUrl` exists, render `<img src={logoUrl} alt={platformTitle} className="h-7 w-auto object-contain" />`.
   - If no custom logo is set, render the canonical corporate logo rather than the generic placeholder robot icon.
   - In Branding settings (`settings-dashboard.tsx`), allow configuring Platform Title, Brand Logo URL (with file upload to Data URL), and Browser Favicon.

6. **Workstream 6: Landing Page Theme Switcher Placement (`app/page.tsx`)**:
   - In `app/page.tsx`, relocate `<ThemeToggle compact className="mr-2" />` to the top-right header navigation immediately preceding the `Sign In` / `Request Demo` action buttons.

7. **Workstream 7: Elevation of System Administration to Top-Level Navigation**:
   - Update `permissions-registry.ts`:
     - Add `"System Admin"` category.
     - Add `system_admin:view`, `system_admin:update`, `appearance:update`, `branding:update`.
     - Assign to `Super Administrator` and `Infrastructure Lead`.
   - Create `savazai-console/src/app/admin/system/page.tsx` with RBAC guard `requirePermission("system_admin", "view")`.
   - Enhance `SettingsDashboard` to support `mode="command_center" | "system_admin"`:
     - In `mode="system_admin"`, render System Core (SMTP, Bot Defense, Outbound Audit, Security Policies), Appearance, and Branding.
     - In `mode="command_center"`, render LLMs, MCPs, Databases, API Connectors, Spend, Social Channels.
   - In `sidebar.tsx`, add top-level navigation item **System Admin** (`/admin/system`, icon: `ShieldCheck`) visible when `hasPermission("system_admin", "view")` or for administrators.

---

## 2. File Change Breakdown

| File | Change Summary |
| :--- | :--- |
| `savazai-console/src/components/shared/markdown-editor.tsx` | Sanitize hardcoded slate-800 tokens to semantic classes |
| `savazai-console/src/components/business/skills-registry.tsx` | Replace textarea with `MarkdownEditor`, add template selector, fix button text |
| `savazai-console/src/components/business/okf-registry.tsx` | Replace textarea with `MarkdownEditor`, add Google OKF upload, add concept templates |
| `savazai-console/src/components/business/compliance-manager.tsx` | Add regex syntax guide modal with 1-click example inserts, fix button text |
| `savazai-console/src/components/sidebar.tsx` | Replace Bot icon with dynamic logo & title, add System Admin top-level nav item |
| `savazai-console/src/app/page.tsx` | Relocate theme switcher to top-right header |
| `savazai-console/src/lib/auth/permissions-registry.ts` | Add system_admin permissions and System Admin category |
| `savazai-console/src/components/settings-dashboard.tsx` | Support mode="command_center" and mode="system_admin", fix button contrast |
| `savazai-console/src/app/admin/system/page.tsx` | New dedicated System Admin route with RBAC protection |

---

## 3. Verification & Quality Gates Sequence

1. `npx tsc --noEmit`
2. `npm --prefix savazai-console run lint:theme`
3. `npm --prefix savazai-console run check:contrast`
4. `npm --prefix savazai-console run build`
5. `graphify update .`
6. `docker compose down && docker compose up --build -d`
7. Verification of all interactive features in browser and end-to-end checks.
