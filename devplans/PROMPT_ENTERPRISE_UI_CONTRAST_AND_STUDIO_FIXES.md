# PROMPT: High-Fidelity Enterprise UI/UX Remediation, Theme Engine Contrast Audit, Business Center Restoration & Dynamic Canvas Theming

---

## 1. Executive Summary & Defect Diagnosis

Based on user-uploaded screenshot evidence (`image_2675da.jpg`, `image_2672f3.jpg`, `image_262057.png`, `image_261bf9.png`, `image_2617c4.jpg`, `image_261117.png`), recent refactoring introduced critical functional regressions and contrast legibility breakdowns:

### 🚨 Critical Regressions Identified:
1. **Capability Studio Light Mode Contrast & Canvas Deficiencies (Ref: `image_2675da.jpg` vs `image_2672f3.jpg`)**:
   - In Light Mode, agent node blocks wash out into pale, low-contrast rectangles with unreadable faint text, missing icons, and missing interactive resize handles.
   - The dot grid, team containers, and orthogonal routing edges lack an adaptive contrast formula for both themes.
2. **Business Center UI Obliteration (Ref: `image_262057.png`)**:
   - The Business Policy & Library Center renders as a completely blank white container in both Light and Dark modes. The left sub-catalog navigation (Universal Skills, Google OKF Concepts, Compliance & PII Rules) and corresponding data tables are not rendering.
3. **Severe Typography Inversions & Low-Contrast Text (Ref: `image_261bf9.png`, `image_2617c4.jpg`, `image_261117.png`)**:
   - **White-on-White / Light Gray Text**: Input boxes (e.g. `PLATFORM LOGO URL` in Branding, `RAW JSON CONFIGURATION EDITOR` and configured server names in MCP Integration, API Key inputs in LLM Providers) render white or faint grey text on white input backgrounds.
   - **Faint Purple Text & Earmarks**: Headings, labels, and card borders render in a washed-out, illegible light lavender/purple hue.
   - **Clashing Button Palettes**: Buttons display yellow text on purple backgrounds or mismatched accent colors, violating corporate design standards.
4. **Branding Asset Management**:
   - The Branding tab only accepts a raw URL string without support for direct file uploads for the platform Logo and Favicon.

---

## 2. DevPlans Framework & Quality Gates (MANDATORY WORKFLOW)

Track and record all engineering actions under `/devplans`:
1. **PROMPT Tracking**: Recorded in `/devplans/PROMPT_ENTERPRISE_UI_CONTRAST_AND_STUDIO_FIXES.md`.
2. **PLAN Tracking**: Document the root causes, component inspection findings, the contrast token model, restoration steps for the Business Center, and verification scripts into `/devplans/PLAN_ENTERPRISE_UI_CONTRAST_AND_STUDIO_FIXES.md` BEFORE modifying code.
3. **WALKTHROUGH Tracking**: Upon verified delivery, record the exact diffs, browser contrast validations, and test logs in `/devplans/WALKTHROUGH_ENTERPRISE_UI_CONTRAST_AND_STUDIO_FIXES.md`.

---

## 3. Scope of Workstreams

* **Workstream 1**: Restore Business Policy & Library Center (`/business`).
* **Workstream 2**: Capability Studio Dynamic Canvas & Node Color Architecture (`/studio`).
* **Workstream 3**: Eradicate Unreadable Text, Faint Purples & Button Mismatches (`/admin/settings`).
* **Workstream 4**: Command Center Branding & Direct Asset Uploads (Logo & Favicon drag-and-drop).
* **Workstream 5**: Comprehensive Cross-Platform Contrast & Theming Audit.
