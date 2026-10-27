# ARCHITECTURAL PLAN: Comprehensive High-Contrast Light Mode Overhaul, Studio Ergonomics & Universal Text Contrast Remediation

---

## 1. Root Cause Analysis & Diagnostic Findings

### Root Cause 1: Studio Canvas Cursor Visibility & Missing Node Resizing
- **Inspection Finding**:
  - The canvas container (`canvas-editor.tsx`, line 1454) uses `cursor-grab active:cursor-grabbing`. Under Windows and standard browsers, the default grab cursor has a white or pale fill that blends into `#ffffff` and `#f8fafc`, making mouse tracking nearly invisible.
  - Non-team agent nodes (`Supervisor`, `Specialist`, `Synthesizer`, `Scheduled`) are statically fixed to `w-48` (`192px`), without any corner resize handles or width/height state mapping, whereas `TeamNode` supports dynamic width/height drag resizing.
  - Action buttons (`Settings`, `Trash2`) in `canvas-editor.tsx` (lines 1765-1775) have `opacity-0 group-hover:opacity-100` and use `bg-slate-800 border-border text-muted-foreground` which creates a dark clashing box in Light Mode.
- **Definitive Fix**:
  1. Add a high-visibility SVG hand cursor (with `#0f172a` dark outer stroke, `#ffffff` fill, and distinct drop shadow) via CSS classes `.canvas-cursor-grab` and `.canvas-cursor-grabbing` in `globals.css` that renders cleanly over both `#f8fafc` and `#0b0e14`.
  2. Implement interactive corner resizing for individual Agent Nodes (width: 192px–420px, height: 110px–280px) with `handleNodeResizeMouseDown`, tracking zoom scaling, updating `node.width` / `node.height`, and rendering a prominent corner resize handle when selected.
  3. Add an expand/collapse toggle button on the node header allowing operators to minimize the node into a compact badge or expand to view full model details.
  4. Modernize node action buttons to `bg-card border border-border shadow-xs text-foreground/80 hover:text-foreground hover:bg-muted` with clear visible hover states.

---

### Root Cause 2: Hardcoded Dark Gradients in "Node Color & Visual Theme"
- **Inspection Finding**:
  - `NODE_CUSTOM_COLORS` in `canvas-editor.tsx` (lines 115-123) and `COLOR_PRESETS` in `agent-drawer.tsx` (lines 76-85) define hardcoded dark gradients (`from-*-950/60 via-slate-950/70 to-*-950/40`, `bg-*-950`).
  - When Amber, Emerald, Cyan, or any other preset is selected, the node and the inspector button render as pitch-black/dark metallic cards with white text, clashing severely on Light Mode.
- **Definitive Fix**:
  - Refactor all 7 presets to dual-mode semantic palettes:
    - Light Mode: `bg-*-50/80` (5-10% tint), solid borders `border-*-500/40`, crisp text `text-foreground`, and dark-tinted badge `bg-*-100 text-*-800 border-*-300`.
    - Dark Mode: `dark:bg-*-950/40`, luminous border `dark:border-*-500/60`, and luminous badge `dark:bg-*-500/20 dark:text-*-300`.
  - Refactor the inspector palette buttons in `agent-drawer.tsx` so selected buttons use `border-primary ring-2 ring-primary/40 text-foreground` instead of `border-white text-white`.

---

### Root Cause 3: Agent Inspector Drawer Tab & Content Contrast Inversions
- **Inspection Finding**:
  - In `agent-drawer.tsx` (line 456), active tab uses `activeTab === tab ? "border-indigo-500 text-white" : ...`. In Light Mode, `text-white` on the white card background causes total text invisibility.
  - In `tool-data-table.tsx`:
    - Inactive switches use `bg-slate-700`.
    - MCP server badges and text use faint `text-purple-400` and `text-purple-300` on white rows.
    - Disabled badges use `bg-slate-800 text-muted-foreground`.
  - In `agent-drawer.tsx` (line 1031 & 1148):
    - Selected OKF concepts use `bg-indigo-500/5 text-white`, which produces white text on a white card.
    - Skill search results use `text-slate-200` on white rows, and active skills use `text-emerald-100`.
- **Definitive Fix**:
  - Drawer tabs: `activeTab === tab ? "border-primary text-primary font-bold bg-primary/5" : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"`.
  - `tool-data-table.tsx`:
    - Switch: `active ? "bg-emerald-500" : "bg-muted-foreground/30 border border-border"`.
    - Category pills: Dual-mode high-contrast tokens (`bg-purple-100 dark:bg-purple-500/20 text-purple-800 dark:text-purple-300`).
    - Server badge: `text-purple-700 dark:text-purple-300 font-mono text-[10px]`.
    - Disabled badge: `bg-muted text-muted-foreground border-border`.
  - Knowledge tab:
    - OKF concepts: `isChecked ? "bg-primary/10 border-primary/40 text-foreground font-semibold" : "border-border bg-muted/20 hover:border-border text-foreground"`.
    - Skills catalog: `text-foreground font-bold`, active pill `bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300`.

---

### Root Cause 4: Command Center Inputs & Notice Contrast Failures
- **Inspection Finding**:
  - In `system-admin-hub.tsx`, form inputs, textareas, and selects hardcode `text-white bg-muted/30` or `text-white placeholder-slate-600`.
  - Google Workspace / Gmail notice box uses `bg-amber-500/10 text-amber-300`, which is unreadable in Light Mode.
  - In `settings-dashboard.tsx` (lines 2000-2030), LLM Provider model checkboxes use `bg-slate-800` and custom model pills use `bg-amber-950/30 text-amber-300`.
- **Definitive Fix**:
  - Purge all `text-white` from form inputs in `system-admin-hub.tsx`, replacing with `bg-background text-foreground border-border placeholder:text-muted-foreground`.
  - Modernize the Gmail notice box to `bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200`.
  - Update model checkbox inputs to `bg-background border-border text-primary` and custom model tags to `bg-amber-100 dark:bg-amber-950/30 border-amber-300 dark:border-amber-500/20 text-amber-900 dark:text-amber-300`.

---

## 2. File Change Breakdown

### A. Capability Studio Canvas & Node Ergonomics
1. `savazai-console/src/app/globals.css`:
   - Add `.canvas-cursor-grab` and `.canvas-cursor-grabbing` with high-visibility dual-tone SVG cursors (dark `#0f172a` outline with white fill).
2. `savazai-console/src/components/studio/canvas-editor.tsx`:
   - Update canvas container to use `.canvas-cursor-grab`.
   - Modernize `NODE_CUSTOM_COLORS` to dual-theme contrast palettes.
   - Implement node resizing (`handleNodeResizeMouseDown`, `width`, `height`) and collapse/expand toggle on Agent Nodes.
   - Modernize node action buttons (`Settings`, `Trash2`, `Plus`) to high-contrast tokens.
3. `savazai-console/src/components/studio/agent-drawer.tsx`:
   - Modernize `COLOR_PRESETS` and the theme selection grid.
   - Fix 8-Tab bar active/inactive classes.
   - Fix Knowledge tab OKF concepts and Skills catalog text contrast.
4. `savazai-console/src/components/studio/tool-data-table.tsx`:
   - Fix toggle switch colors, server labels, and category/status badges.

### B. Command Center System Admin Hub & Inputs
1. `savazai-console/src/components/admin/system-admin-hub.tsx`:
   - Eradicate `text-white` across all inputs, selects, and textareas.
   - Update Google Workspace notice to high-contrast dark amber text in Light Mode.
   - Modernize sub-tabs to semantic tokens.
2. `savazai-console/src/components/settings-dashboard.tsx`:
   - Fix model checkbox inputs and custom model tags in the LLM Providers section.

---

## 3. Verification & Quality Gates Sequence

1. `npx tsc --noEmit`
2. `npm --prefix savazai-console run lint:theme`
3. `npm --prefix savazai-console run check:contrast`
4. `cd savazai-console && npx next build --webpack`
5. `graphify update .`
6. `docker compose down && docker compose up --build -d && docker compose ps`
7. Document results in `/devplans/WALKTHROUGH_LIGHT_MODE_CONTRAST_AND_STUDIO_ERGONOMICS.md`.
