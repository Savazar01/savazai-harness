# IMPLEMENTATION PLAN: Landing Page Threat Surface Hardening, Studio Canvas Ergonomics, Zoom State Persistence & Deterministic Auto-Align Layout Engine

**Date**: October 28, 2026  
**Status**: APPROVED & IN PROGRESS  
**Reference Visuals**: `image_ab027f.jpg` through `image_aa1926.jpg`

---

## 1. Architectural Strategy & Workstream Breakdown

### Workstream 1: Threat Surface Hardening on Landing Page (`/`)
- **File**: `savazai-console/src/app/page.tsx`
- **Actions**:
  1. Remove `<Link href="/signin">Sign In</Link>` from header navigation (lines 70-76).
  2. Remove `<Link href="/signin">Operator Sign In</Link>` from hero section footer (lines 147-153).
  3. Remove `<Link href="/signin">Operator Sign In</Link>` from bottom CTA section (lines 554-560).
  4. Remove `<Link href="/signin">Operator Sign In</Link>` from footer (lines 576-578).
  5. Retain `<RequestDemoTrigger />` as the sole public gateway. Existing operators navigate directly to `/dashboard` or `/admin`.

---

### Workstream 2: Capability Studio Test Playground Contrast Fixes
- **File**: `savazai-console/src/components/studio/test-sandbox.tsx`
- **Actions**:
  1. Fix test prompt textarea (lines 895-912):
     - Replace hardcoded `text-white placeholder-slate-600` with semantic classes: `text-foreground placeholder:text-muted-foreground bg-muted/40 border-border focus:border-primary`.
     - In Light Mode, text will render in deep charcoal (`#0f172a`); in Dark Mode, text will render in slate-50 (`#f8fafc`).
  2. Fix Execution Strategy selector (lines 920-975):
     - Replace `text-slate-100` with `text-foreground bg-card border-border hover:bg-muted`.
     - Dropdown menu options: selected item `bg-primary/10 text-primary font-bold`, non-selected items `text-foreground hover:bg-muted`.

---

### Workstream 3: Infinite Matrix Ergonomics, Cursors, Resizing & Magnification
- **Files**:
  - `savazai-console/src/components/studio/nodes/team-node.tsx`
  - `savazai-console/src/components/studio/canvas-editor.tsx`
  - `savazai-console/src/app/globals.css`
  - `savazai-console/src/app/studio/page.tsx`
- **Actions**:
  1. **Dual-Tone Cursor for Team Containers**:
     - Update `team-node.tsx` container classes from generic `cursor-grab active:cursor-grabbing` to `canvas-cursor-grab active:canvas-cursor-grabbing`.
     - Add `.team-node-container` selector in `globals.css` guaranteeing high-contrast dual-tone cursor rendering.
  2. **High-Contrast Action Icons**:
     - In `team-node.tsx`, replace `bg-indigo-900/40 text-indigo-300` and `bg-red-950/40 text-red-400` with semantic token buttons: `bg-card border border-border text-foreground/80 hover:text-foreground hover:bg-muted` and `bg-destructive/10 border border-destructive/30 text-destructive hover:bg-destructive/20`.
  3. **Universal Agent Resizing (Supervisor, Specialist, Synthesizer)**:
     - Enforce `minWidth: 260px` and `minHeight: 120px` in `handleAgentResizeMouseDown`.
     - Render corner resize handle with active `border-primary` ring when selected.
  4. **Agent Hover Detail Magnification Popover**:
     - Add debounced (400ms) hover popover in `canvas-editor.tsx` for non-team nodes.
     - Displays card with Agent Label, Role Badge, Model Config, Tools list/count, and Prompt snippet.
  5. **Adjustable Waypoints on Edges**:
     - In `getNodePortPosition`, fix hardcoded output offset `+ 180` to dynamically use `+ (node.width || 208)`.
     - Add midpoint drag handle (`mx, my`) allowing nudging orthogonal connection lines away from team borders.
  6. **High-Contrast Save/Publish Toasts**:
     - In `studio/page.tsx` and `canvas-editor.tsx`, replace washed-out green with high-contrast emerald/rose semantic badges:
       - Success: `bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-500/30 text-emerald-900 dark:text-emerald-100 font-semibold shadow-md`
       - Error: `bg-rose-50 dark:bg-rose-950/80 border border-rose-500/30 text-rose-900 dark:text-rose-100 font-semibold shadow-md`

---

### Workstream 4: Viewport State Persistence (Zoom, Pan & Layout Retention)
- **Files**:
  - `savazai-console/src/components/studio/canvas-editor.tsx`
  - `savazai-console/src/app/studio/page.tsx`
- **Actions**:
  1. Listen to pan and zoom changes in `canvas-editor.tsx`.
  2. Persist `{ x, y, zoom }` into `localStorage.getItem("savazai_viewport_" + workflowId)`.
  3. Include `viewport` in `onSaveDraft` / database `canvasDefinition`.
  4. On component mount or workflow switch, restore saved viewport instead of resetting to default `{ x: 0, y: 0, zoom: 1 }`.

---

### Workstream 5: Deterministic Auto-Align Layout Engine
- **File**: `savazai-console/src/components/studio/canvas-editor.tsx`
- **Actions**:
  1. Calculate stacked team layout starting at $X=460, Y=80$:
     - For each team, compute dimensions via `getTeamDimensions` with balanced 2-3 column grid for specialists.
     - Stack teams vertically with `gap = 50px`.
     - Calculate overall team vertical span (`minTeamY` to `maxTeamY`) and centerline `teamCenterY`.
  2. Position **Supervisor Node** (width: 320, height: 180):
     - Left column at $X=80$.
     - Vertically centered at `teamCenterY - 90`.
  3. Position **Synthesizer Node** (width: 300, height: 180):
     - Right column at `startTeamsX + maxTeamW + 80`.
     - Vertically centered at `teamCenterY - 90`.
  4. Smooth animated CSS transitions (`duration: 350ms`) followed by `handleFitView()`.

---

## 2. Quality Verification Gates

1. `npx tsc --noEmit` $\rightarrow$ 0 errors
2. `npm run lint:theme` $\rightarrow$ 0 hardcoded dark/slate tokens
3. `npm run check:contrast` $\rightarrow$ 16/16 contrast ratios verified
4. `npm run build` $\rightarrow$ Next.js production build passes
5. `graphify update .` $\rightarrow$ Knowledge graph re-extracted
6. Rebuild and verify containers: `docker compose up --build -d`
