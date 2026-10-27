# PROMPT: Business Authoring Markdown Editors & Templates, Custom Regex Guide, Brand Customization, Landing Page Theme Placement & Dedicated System Administration Navigation

---

## 1. Problem Statement & User Objectives

Visual inspection of the Business Center, Compliance Gateway, Brand Settings, and Navigation hierarchy revealed essential authoring and architectural requirements:

1. **Skills Authoring Markdown Editor & Templates (`image_186e12.jpg`)**:
   - In "Create Custom Skill Definition" modal, the instructions field is a raw unformatted textarea without markdown tools, formatting helpers, live preview, or industry starter templates.
   - Operators need a rich Markdown WYSIWYG editor with formatting toolbar and a "Load Blueprint Template" dropdown (Standard Business Process Agent Skill, Custom Local JS Snippet, Native TypeScript Tool, MCP-Bound Connector Skill).

2. **OKF Concepts Markdown Editor & Template Ingestion (`image_18699c.jpg`)**:
   - In "Author OKF Concept Bundle" modal, the guidelines body is a raw textarea.
   - Operators require a rich Markdown WYSIWYG editor, concept-aware templates (SOP Ruleset, Domain Glossary, Security & Compliance Directive), and a file upload dropzone accepting Google OKF `.md` and `.json` template files with automatic metadata and markdown parsing.

3. **Custom Regex Rules Interactive Documentation Guide (`image_186270.png`)**:
   - In Compliance & PII Rules, the "Custom Regex Rules" card lacks contextual guidance on how to write valid enterprise regex patterns.
   - Requires an interactive modal/drawer guide explaining streaming regex matching with enterprise examples (Medical Record Numbers, Project Codewords, Invoice Numbers, Employee Badges) with one-click insertion.

4. **Universal High-Contrast Button Inversion Guardrail**:
   - Buttons rendering dark or saturated primary backgrounds (`bg-primary`) must strictly use `text-primary-foreground` or `text-white` to eliminate dark text on saturated button backgrounds in Light Mode.

5. **Configurable Platform Brand Identity (Logo Replacing Robot Icon)**:
   - In the sidebar header and public landing page, replace the static generic robot icon with the configured brand logo and application title.
   - Support custom logo URL/data URL, application name, and favicon in the Branding settings.

6. **Landing Page Theme Switcher Placement**:
   - Relocate the Light/Dark mode toggle switch to the top-right header adjacent to the action buttons.

7. **Elevation of System Administration to Top-Level Navigation**:
   - Create a dedicated top-level sidebar module: **System Admin** (`/admin/system`).
   - Group enterprise governance under this hub: **System Core** (SMTP/Nodemailer, Turnstile CAPTCHA, Outbound Audit Stream, Security Policies & Sessions), **Appearance** (theming studio, density, typography), and **Branding** (logo, favicon, application title).
   - Retain operational AI controls in **Command Center** (`/admin/settings`): LLMs, MCPs, Databases, API Connectors, Spend, Social.
   - Enforce RBAC permissions (`system_admin:view`, `system_admin:update`, `appearance:update`, `branding:update`).
