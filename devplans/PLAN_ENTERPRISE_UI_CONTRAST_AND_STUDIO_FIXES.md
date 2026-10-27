# ARCHITECTURAL PLAN: High-Fidelity Enterprise UI/UX Remediation, Theme Engine Contrast Audit, Business Center Restoration & Dynamic Canvas Theming

---

## 1. Root Cause Analysis & Diagnostic Findings

### Root Cause 1: Business Center UI Obliteration (`/business`)
- **Inspection Finding**: In `savazai-console/src/app/business/page.tsx`:
  ```tsx
  const canViewSkills = hasPermission("business_center:skills_view");
  const canViewOkf = hasPermission("business_center:okf_view");
  const canViewCompliance = hasPermission("business_center:compliance_view");
  ```
  `hasPermission` signature in `use-permissions.tsx` is `hasPermission(resource: string, action: string | string[])`.
  When called with a single colon-separated argument `"business_center:skills_view"`, `action` is `undefined`, generating an invalid internal key `"business_center:skills_view:undefined"`.
  All three boolean flags evaluate to `false`, causing neither the sub-catalog menu items nor the registry components to render.
- **Definitive Fix**:
  1. Enhance `use-permissions.tsx` so `hasPermission` automatically splits colon-separated keys (`"resource:action"`) into resource and action parts, and grants universal bypass for `role === "admin"` or `roleName === "Super Administrator"`.
  2. Update `app/business/page.tsx` to call `hasPermission("business_center", "skills_view")`, `hasPermission("business_center", "okf_view")`, and `hasPermission("business_center", "compliance_view")`.
  3. Ensure active tab state defaults cleanly to `"skills"` during initial hydration.

---

### Root Cause 2: Capability Studio Washed-Out Nodes in Light Mode (`/studio`)
- **Inspection Finding**: In `canvas-editor.tsx` (lines 1706-1786) and `team-node.tsx` (lines 176, 198, 322, 344):
  - Agent node card titles hardcode `text-white truncate max-w-full`. On light cards in Light Mode, white text on light background is completely unreadable.
  - Role badges (`ROLE_CONFIGS`) hardcode light tinted backgrounds (`bg-cyan-500/10`, `bg-indigo-500/10`) and light text (`text-cyan-300`, `text-indigo-300`).
  - Synthesizer node hardcodes dark gradients (`from-fuchsia-950/40 via-purple-950/30 to-slate-950/60 text-purple-200`).
  - Team nodes hardcode `bg-indigo-950/20` and `text-white` for team titles.
- **Definitive Fix**:
  1. Define dual-theme role styling:
     - Supervisor: `border-indigo-500/50 bg-card text-foreground`, badge `bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-500/30`, icon `text-indigo-600 dark:text-indigo-400`.
     - Specialist: `border-teal-500/50 bg-card text-foreground`, badge `bg-teal-100 dark:bg-teal-500/20 text-teal-800 dark:text-teal-300 border border-teal-300 dark:border-teal-500/30`, icon `text-teal-600 dark:text-teal-400`.
     - Synthesizer: `border-purple-500/60 bg-card text-foreground`, badge `bg-purple-100 dark:bg-purple-500/20 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-500/30`, icon `text-purple-600 dark:text-purple-400`.
     - Scheduled: `border-amber-500/50 bg-card text-foreground`, badge `bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/30`, icon `text-amber-600 dark:text-amber-400`.
  2. In `team-node.tsx`, replace `text-white` with `text-foreground`, style expanded/collapsed containers with `bg-card/80 dark:bg-card/60 border-2 border-dashed border-indigo-500/50 dark:border-indigo-500/40`, and make the corner resize handle prominent.
  3. Canvas dot grid: `bg-canvas` with `radial-gradient(var(--canvas-grid) 1.5px, transparent 1.5px)` ensuring high contrast in both modes.

---

### Root Cause 3: White-on-White Form Inputs & Faint Purple Text (`settings-dashboard.tsx`)
- **Inspection Finding**:
  - `settings-dashboard.tsx` has 71 lingering occurrences of `text-white` on `<input>`, `<textarea>`, `<select>`, and card titles (e.g. `brandLogoUrl` input, LLM API key/endpoint inputs, Raw JSON Configuration editor in MCP).
  - Info boxes hardcode `bg-indigo-500/5 text-indigo-300 border-indigo-500/20`, rendering unreadable light purple text on white cards in Light Mode.
- **Definitive Fix**:
  1. Replace all 71 occurrences of `text-white` in `settings-dashboard.tsx` with `text-foreground` (inputs/labels) or `text-primary-foreground` (on primary buttons).
  2. Replace `bg-muted/30 text-white` in form inputs with `bg-background text-foreground border-border placeholder:text-muted-foreground`.
  3. Replace faint purple info boxes with `bg-muted/40 border-border text-muted-foreground` and bold terms in `text-foreground`.
  4. Standardize all buttons to Shadcn variants (`primary`, `secondary`, `outline`, `destructive`).

---

### Root Cause 4: Branding Asset Management (Direct File Upload Dropzones)
- **Current Limitation**: Only accepts a raw URL string for `brandLogoUrl`, with zero support for direct file uploads or favicon customization.
- **Definitive Fix**:
  1. Add direct drag-and-drop / file upload dropzones in Command Center -> Branding for:
     - **Platform Brand Logo**: Accepts PNG, SVG, JPG (under 2MB), validates dimensions via `new Image()`, reads as Base64 Data URL, updates `brandLogoUrl`, displays live preview and dimension check.
     - **Browser Favicon**: Accepts ICO, PNG, SVG (under 512KB), reads as Base64 Data URL, updates `faviconUrl`, displays 16x16 / 32x32 preview badge.
  2. Maintain manual URL input fields for external CDN hosting.
  3. Add **[ Restore Canonical Logo & Favicon ]** button that resets `brandLogoUrl` to default and `faviconUrl` to `/favicon.ico`.
  4. Update `UpdateSettingsInput` in `actions.ts` to persist `faviconUrl` in `system_configurations.designTokens.faviconUrl`.
  5. Update `app/layout.tsx` to set `<link rel="icon" href={config.designTokens?.faviconUrl || "/favicon.ico"} />`.

---

## 2. File Change Breakdown

### A. Business Center Restoration
1. `savazai-console/src/lib/auth/use-permissions.tsx`:
   - Support colon-separated strings in `hasPermission(resource, action?)`.
   - Super Administrator role bypass (`user.role === 'admin' || user.roleName === 'Super Administrator'`).
2. `savazai-console/src/app/business/page.tsx`:
   - Fix permission checks to `hasPermission("business_center", "skills_view")`, etc.
   - Guard against empty rendering during initial permission loading.
   - Ensure clean high-contrast styling for left sub-navigation and active states.

### B. Capability Studio Dynamic Canvas & Dual-Theme Nodes
1. `savazai-console/src/components/studio/canvas-editor.tsx`:
   - Dual-theme `ROLE_CONFIGS` with high-contrast text and badges for both Light and Dark modes.
   - Node titles: `text-foreground font-bold`.
   - Provider/Model labels: `text-muted-foreground font-mono text-[10px]`.
   - Action buttons and hover controls: high-contrast icons.
   - Canvas dot grid: `bg-canvas` with `var(--canvas-grid)` radial gradient.
2. `savazai-console/src/components/studio/nodes/team-node.tsx`:
   - Replaced `text-white` and `text-indigo-300` with `text-foreground` and adaptive badge tokens.
   - High-contrast container borders (`border-2 border-dashed border-indigo-500/50 dark:border-indigo-500/40`).
   - Prominent corner resize handle with visual feedback on hover/drag.

### C. Command Center Form Inputs & Branding Asset Management
1. `savazai-console/src/components/settings-dashboard.tsx`:
   - Purged all 71 occurrences of `text-white` to `text-foreground` / `text-primary-foreground`.
   - Form inputs modernized to `bg-background text-foreground border-border placeholder:text-muted-foreground`.
   - Info callout boxes converted from faint purple to `bg-muted/40 border-border text-muted-foreground`.
   - Branding tab: Added direct file upload dropzones for Logo and Favicon, live preview, dimension checks, manual URL fallback, and `[ Restore Canonical Logo & Favicon ]`.
2. `savazai-console/src/app/admin/settings/actions.ts`:
   - Added `faviconUrl?: string` to `UpdateSettingsInput`.
   - Saved `faviconUrl` into `system_configurations.designTokens`.
3. `savazai-console/src/app/layout.tsx`:
   - Configured dynamic favicon link from `config.designTokens?.faviconUrl || "/favicon.ico"`.

---

## 3. Quality Gates Sequence

```bash
# 1. Typecheck entire workspace
npx tsc --noEmit

# 2. Production build verification
cd savazai-console && npm run build
cd ..

# 3. Automated Theme Lint & Contrast Check
npm --prefix savazai-console run lint:theme
npm --prefix savazai-console run check:contrast

# 4. Synchronize repository knowledge graph
graphify update .

# 5. Clean local container restart
docker compose down
docker compose up --build -d
docker compose ps
```

---

## 4. Verification Checklist

* [ ] DevPlan files (`PROMPT_ENTERPRISE_UI_CONTRAST_AND_STUDIO_FIXES.md` and `PLAN_ENTERPRISE_UI_CONTRAST_AND_STUDIO_FIXES.md`) created.
* [ ] Business Center (`http://localhost:3056/business`):
  * [ ] Sub-catalog navigation displays Universal Skills Registry, Google OKF Concepts, Compliance & PII Rules.
  * [ ] Registries render tables, filters, search, and action modals properly in both Light and Dark modes.
* [ ] Capability Studio (`http://localhost:3056/studio`):
  * [ ] Agent nodes and team containers adapt to Light Mode with crisp typography (`text-foreground`).
  * [ ] Distinct role styling for Supervisor, Specialist, Synthesizer, Scheduled.
  * [ ] Resize handles and action icons are clearly visible and interactive.
  * [ ] Canvas dot grid and connector lines render with clear contrast.
* [ ] Command Center (`http://localhost:3056/admin/settings`):
  * [ ] Branding tab supports Logo and Favicon file uploads alongside manual URL input.
  * [ ] Zero white-on-white text in inputs (Branding, LLM Providers, MCP Integration).
  * [ ] No faint purple labels or clashing buttons.
* [ ] Automated Quality Gates (`tsc`, `build`, `lint:theme`, `check:contrast`, `graphify`) pass with zero errors.
* [ ] DevPlan walkthrough file (`WALKTHROUGH_ENTERPRISE_UI_CONTRAST_AND_STUDIO_FIXES.md`) created.
