# PROMPT: Edge Condition Documentation & Waypoint Routing, Navigation Reorganization, Role Management Overhaul, OKF Agent Assignment & WYSIWYG Email Template Engine

## 1. Problem Statement & Incoming Requirements

Based on user feedback and screenshots (`media_1793146332716_b3c2efae.png` through `media_1793148301067_b8d8f7dc.png`), seven key architectural, layout, and UX enhancements are required:

1. **Edge Condition Documentation & Drag Routing (`media_1793146332716_b3c2efae.png`)**:
   - The "EDGE CONNECTION" dialog currently provides a bare text input field (`CONDITION EXPRESSION`) with zero instructions, variable references, or syntax guidelines.
   - Operators cannot easily understand state variables evaluated by the LangGraph router (`context.last_output`, `context.intent`, `context.confidence`, `context.tool_calls_count`, `context.is_approved`).
   - Need interactive edge dragging / midpoint waypoint handle to re-route orthogonal paths around cards without overlap, plus a comprehensive syntax guide drawer/modal with insertable templates.

2. **Sidebar Navigation Hierarchy Reorganization**:
   - `Documentation` (`/docs`) and `Demo Requests` (`/admin/demo-requests`) currently sit in the middle of core operational modules.
   - Reorder into:
     - Core Operational Modules (Top):
       1. Agent Workspace (`/dashboard`)
       2. Capability Studio (`/studio`)
       3. Business Center (`/business`)
       4. Command Center (`/admin/settings`)
       5. System Admin (`/admin/system`)
       6. User Admin (`/admin/users`)
     - Secondary Utility Items (Bottom, directly above Dark/Light Mode switch):
       1. Documentation (`/docs`)
       2. Demo Requests (`/admin/demo-requests`)
   - Restrict `Demo Requests` visibility strictly to `Super Administrator` (`user.role === "admin" || user.roleName === "Super Administrator"`).

3. **Dedicated "User Administrator" Role & Matrix Row Sizing (`media_1793146978763_edb7c61d.png` & `media_1793147367445_31e3cd64.png`)**:
   - Define a 7th system role: `User Administrator` scoped to `user_admin:*` plus documentation viewing.
   - Fix matrix layout: Set `Module & Action` column to a comfortable wide base (`min-w-[280px]` to `w-[320px]`), and role columns to `max-w-[150px]` with truncation and tooltips to prevent stretching by long role names (e.g. `Custom Quality Auditor ...`). Add sticky scrolling container.

4. **Universal Role Customization (Edit & Delete All Roles)**:
   - Make Edit and Delete available on all role cards.
   - Safety guardrail: Protect active `Super Administrator` from deletion.
   - Update backend API `/api/admin/roles/route.ts` to allow editing descriptions and permissions for roles while enforcing safety protections.

5. **Business Center OKF Concepts Renaming & Agent Assignment (`media_1793147505456_0ce3129f.png`)**:
   - Purge "Google" prefix: rename "Google OKF Concepts" to **"OKF Concepts"** across navigation, headers, and UI text.
   - Add interactive **"Assign Agents"** modal to the `ACTIVE IN AGENTS` column in `OkfRegistry`, replicating the workflow from Universal Skills with agentflow and agent selection, search filtering, and persistence.

6. **WYSIWYG Email Message Templates & Dynamic Category Authoring (`media_1793148301067_b8d8f7dc.png`)**:
   - Replace raw HTML `<textarea>` with a true WYSIWYG rich text editor with visual formatting controls (headings, bold, italic, lists, buttons, dividers, alignments) plus live preview.
   - Add organizational merge tags: `{{company_name}}`, `{{company_email}}`, `{{company_phone}}`, `{{company_address}}`, `{{company_website}}`, `{{support_email}}` in addition to agentflow state tags.
   - Implement Creatable Combobox for template categories allowing custom categories on the fly.
   - Purge the word "workflow" across templates, merge tags, and interface text, standardizing on **"Agentflow"**.
