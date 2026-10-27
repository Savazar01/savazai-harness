# PROMPT: Comprehensive High-Contrast Light Mode Overhaul, Studio Ergonomics & Universal Text Contrast Remediation

---

## 1. Problem Statement & Incoming Evidence

Visual evidence from the latest platform inspection (`image_251914.jpg` through `image_24ac3e.jpg`) demonstrates critical ergonomics and contrast failures in Light Mode:

### Visual Defects Identified:
1. **Capability Studio Canvas & Cursor Ergonomics (`image_251914.jpg`)**:
   - **Invisible / Low-Contrast Canvas Cursor**: The canvas uses default or white SVG hand cursors (`cursor: grab` / `cursor: grabbing`) that disappear against the `#f8fafc` canvas background.
   - **Fixed Node Dimensions & Missing Resizing**: Agent node cards have locked widths/heights without interactive corner resize handles (unlike Team containers).
   - **Washed-Out Node Text & Action Controls**: Specialist and Supervisor titles, badges, and status lines use faint green/teal (`text-emerald-300`, `text-teal-300`) or faint grey on white cards. Node action buttons (Edit, Duplicate, Delete) have low opacity and are hard to spot.
   - **Static Color Themes**: The "Node Color & Visual Theme" selector applies fixed dark metallic gradients (e.g. Amber rendering dark brown/black with white text) instead of theme-adaptive styles.

2. **Agent Inspector Drawer Active States & Legibility (`image_24bf5d.jpg`, `image_24bedf.jpg`, `image_24b7dc.jpg`)**:
   - **Active Tab Bleed**: Active tabs (`IDENTITY`, `MCP SERVERS`, etc.) lose text legibility (white text on light background or faint purple/grey text).
   - **MCP Tool List Inversion**: Tool names, server labels, and parameter descriptions render in low-contrast light purple/grey on a white drawer background.
   - **Knowledge Tab Unreadable State**: Selected OKF concepts and skill search items render in low-contrast faint text inside white card boundaries.

3. **Command Center System Admin & Form Input Inversions (`image_24ac3e.jpg`, `image_24b059.jpg`)**:
   - **White-on-White / Faint Inputs in System Admin Hub**: The SMTP username, password, sender display name, and sender email inputs in `system-admin-hub.tsx` render faint or white text on white input fields.
   - **Low-Contrast Yellow Callout Notice**: The Google Workspace / Gmail notice box renders yellow text on a faint yellow background.
   - **LLM Providers Checkbox Grids & Custom Model Pills**: Faint grey text on checkboxes and clashing yellow-on-purple pills.

---

## 2. Requirements & Deliverables

1. **DevPlans Tracking**:
   - Create `devplans/PROMPT_LIGHT_MODE_CONTRAST_AND_STUDIO_ERGONOMICS.md`.
   - Create `devplans/PLAN_LIGHT_MODE_CONTRAST_AND_STUDIO_ERGONOMICS.md`.
   - Create `devplans/WALKTHROUGH_LIGHT_MODE_CONTRAST_AND_STUDIO_ERGONOMICS.md`.
2. **Capability Studio Ergonomics & Agent Node Enhancements**:
   - Custom high-contrast SVG hand cursor with dark outlines in Light Mode and luminous outlines in Dark Mode.
   - Expandable & Resizable Agent Node cards (`<NodeResizeControl />` or `@reactflow/node-resizer` with minWidth: 260, minHeight: 140, corner handles on selection, and expand/collapse toggle).
   - High-contrast node titles, role badges, provider tags, and prominent action buttons (`Edit`, `Duplicate`, `Delete`).
   - Adaptive "Node Color & Visual Theme" palette (`Default`, `Emerald`, `Cyan`, `Indigo`, `Purple`, `Amber`, `Rose`, `Slate`) adapting to Light (soft tinted bg, solid border, `#0f172a` text) and Dark (obsidian bg, luminous border).
3. **Agent Inspector Drawer Remediation**:
   - High-contrast drawer tabs with active indicator (`bg-primary text-primary-foreground` or clean active pill).
   - High-contrast MCP tool list items (`text-foreground`, `text-muted-foreground`, clear server badge, visible toggle switch).
   - Legible Knowledge tab OKF and skill items.
4. **Command Center System Admin Hub & Inputs**:
   - Fix all form inputs in `system-admin-hub.tsx` to `bg-background text-foreground border-border placeholder:text-muted-foreground`.
   - Modernize notice boxes to semantic tokens (`bg-amber-500/10 text-amber-800 dark:text-amber-200 border-amber-500/30`).
   - Clean sub-tab active/inactive styling.
5. **Quality Gates**:
   - `npx tsc --noEmit`
   - `npm run lint:theme`
   - `npm run check:contrast`
   - `npm run build`
   - `graphify update .`
   - Docker container restart & health verification.
