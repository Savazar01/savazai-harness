# SAVAZAI CONSOLE DESIGN SYSTEM & TOKEN SPECIFICATION (`DESIGN.md`)

---

## 1. Executive Vision & Architectural Invariants

SavazAI Console enforces a strict, semantic **Design Token Contract** modeled after modern Shadcn Slate architecture and Tailwind CSS v4. 

### 🛡️ Core System Invariants:
1. **Zero Hardcoded Colors in Components**: Never use arbitrary hex codes (e.g. `bg-[#14141f]`, `bg-[#0c0c12]`, `text-[#f8fafc]`, `border-[#1e1e2f]`) or hardcoded theme-inflexible Tailwind utilities (e.g. `text-white`, `bg-slate-900`) inside components. All styling MUST consume semantic token classes (`bg-background`, `bg-card`, `text-card-foreground`, `border-border`, `bg-muted`, `text-muted-foreground`, `bg-primary`, `text-primary-foreground`, `bg-popover`).
2. **Zero `!important` Brute-Force Overrides**: Never patch theme contrast issues by declaring global `!important` text or background overrides (e.g., `html.light .text-white { color: #0f172a !important; }`). Brute-force overrides invert white text on primary buttons and dark cards, breaking WCAG compliance.
3. **Flawless Multi-Theme Parity**: Every component, modal, dropdown, table, chat bubble, and code block MUST render with high-contrast legibility in both **Light Mode** (soft slate canvas `#f8fafc`, crisp white surfaces `#ffffff`, deep slate text `#0f172a`) and **Dark Mode** (deep obsidian canvas `#06060b`, slate card surfaces `#0c0c16`, bright slate text `#f8fafc`).
4. **WCAG 2.1 AA/AAA Compliance**: Normal text must achieve at least **4.5:1** contrast ratio against its immediate surface; large headings and user-interface components must achieve at least **3.0:1**.

---

## 2. Design Token Taxonomy & Palette Contract

The design tokens are defined as CSS custom properties under `:root` (light) and `html.dark` (dark), registered directly into Tailwind v4's `@theme` configuration.

| Token Class | Light Mode (Hex / HSL) | Dark Mode (Hex / HSL) | Semantic Intent & Application |
| :--- | :--- | :--- | :--- |
| `bg-background` / `text-background` | `#f8fafc` (Slate 50) | `#06060b` (Deep Obsidian) | Platform root canvas and application viewport |
| `text-foreground` | `#0f172a` (Slate 900) | `#f8fafc` (Slate 50) | Base body copy, default headings, icon strokes |
| `bg-card` / `text-card` | `#ffffff` (Pure White) | `#0c0c16` (Deep Charcoal) | Elevated cards, sidebars, trace panels, modals |
| `text-card-foreground` | `#0f172a` (Slate 900) | `#f8fafc` (Slate 50) | Primary text and headings inside card containers |
| `bg-popover` / `text-popover` | `#ffffff` (Pure White) | `#14141f` (Rich Slate) | Menus, popovers, tooltips, flyout dropdowns |
| `text-popover-foreground` | `#0f172a` (Slate 900) | `#f8fafc` (Slate 50) | Interactive items inside popovers and dropdowns |
| `bg-primary` / `text-primary` | `#4f46e5` (Indigo 600) | `#6366f1` / `#4f46e5` | Primary brand action buttons, active tab indicators |
| `text-primary-foreground` | `#ffffff` | `#ffffff` | Text and icons rendered atop `bg-primary` surfaces |
| `bg-secondary` / `text-secondary` | `#06b6d4` (Cyan 500) | `#06b6d4` (Cyan 500) | Secondary highlights, information badges, accents |
| `text-secondary-foreground` | `#ffffff` | `#ffffff` | Text and icons rendered atop `bg-secondary` surfaces |
| `bg-muted` / `text-muted` | `#f1f5f9` (Slate 100) | `#181926` (Slate 800/900) | Inactive tabs, code inline chips, table headers |
| `text-muted-foreground` | `#64748b` (Slate 500) | `#94a3b8` (Slate 400) | Subtitles, helper text, empty states, input placeholders |
| `bg-accent` / `text-accent` | `#f1f5f9` (Slate 100) | `#1e1e2f` | Hover highlights on rows, lists, and menu items |
| `text-accent-foreground` | `#0f172a` (Slate 900) | `#f8fafc` (Slate 50) | Active text on hover highlights |
| `bg-destructive` | `#ef4444` (Red 500) | `#f87171` (Red 400) | Destructive action buttons, critical error banners |
| `text-destructive-foreground` | `#ffffff` | `#ffffff` | Text and icons atop destructive backgrounds |
| `border-border` | `#e2e8f0` (Slate 200) | `#1e1e2f` (Slate 800) | Dividers, card boundaries, outer rails |
| `border-input` | `#cbd5e1` (Slate 300) | `#1e1e2f` (Slate 800) | Form fields, select triggers, textarea borders |
| `ring-ring` | `#6366f1` (Indigo 500) | `#6366f1` (Indigo 500) | Keyboard focus rings and outline halos |

---

## 3. Typography Scale & Hierarchy

The platform uses **Inter / SF Pro Display** for human-readable content and **JetBrains Mono / SF Mono** for technical telemetry and code.

```
Font Stacks:
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
--font-mono: 'JetBrains Mono', 'SF Mono', 'Fira Code', Menlo, monospace;
```

### Hierarchy Table
| Style | Size | Weight | Line Height | Tracking | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Display Heading (H1)** | `1.875rem` (30px) | `800` (Extrabold) | `1.25` | `-0.025em` | Page Titles (Command Center, Business Center) |
| **Section Heading (H2)** | `1.25rem` (20px) | `700` (Bold) | `1.35` | `-0.015em` | Sub-sections, Drawer titles, Card group headers |
| **Component Title (H3)** | `1.0rem` (16px) | `600` (Semibold) | `1.4` | `normal` | Modal titles, Card titles, Tab labels |
| **Body (Default)** | `0.875rem` (14px) | `400` / `500` | `1.5` | `normal` | Standard prose, form descriptions, chat messages |
| **Small / Helper (SM)** | `0.75rem` (12px) | `400` / `500` | `1.4` | `normal` | Metadata, badges, table row text, input notes |
| **Micro / Telemetry (XS)** | `0.6875rem` (11px) | `600` / `700` | `1.3` | `+0.05em` | Caps tracking badges, status pills, timestamps |
| **Code / JSON (Mono)** | `0.75rem` (12px) | `400` / `500` | `1.6` | `normal` | MCP signatures, raw JSON traces, SQL preview |

---

## 4. Spatial Grid, Border Radii & Elevation

### 4.1 Spatial Rhythm (8pt Grid)
- **Base Grid Unit**: `4px` (`0.25rem` / `p-1`, `gap-1`)
- **Standard Spacing Units**:
  - Compact: `8px` (`gap-2`, `p-2`)
  - Default: `16px` (`gap-4`, `p-4`)
  - Structural: `24px` (`gap-6`, `p-6`)
  - Layout Margin: `32px` (`p-8`, `my-8`)

### 4.2 Border Radii Taxonomy
- **Small Controls (`rounded-lg`)**: `8px` — Action pills, search chips, table action buttons.
- **Medium Elements (`rounded-xl`)**: `12px` — Standard inputs, buttons, menu lists, trace cards.
- **Large Containers (`rounded-2xl`)**: `16px` — Chat bubbles, floating prompt bar, sub-panels.
- **Shell Panels (`rounded-3xl`)**: `24px` — Command Center card wraps, Studio workspace frames.
- **Pill / Badges (`rounded-full`)**: Full radius — Status pills, role tags, notification count badges.

### 4.3 Elevation & Shadows
- **Flat Surface**: `border border-border` without shadow for seamless embedded cards.
- **Floating Controls (Light)**: `shadow-sm shadow-slate-200/50`
- **Dropdowns & Popovers (Light)**: `shadow-xl shadow-slate-300/40 border border-border`
- **Floating Controls (Dark)**: `shadow-lg shadow-black/40`
- **Dropdowns & Popovers (Dark)**: `shadow-2xl shadow-black/80 border border-border`

---

## 5. Responsive Screen Layout Breakpoints

| Breakpoint | Screen Width | Sidebar View | Content & Multi-column Stacking |
| :--- | :--- | :--- | :--- |
| **Mobile** | `< 768px` | Hidden. Replaced by a floating slide-out drawer (`fixed top-4 left-4`). | Form grids, action panels, and sandbox drawers collapse to a single flex column. |
| **Tablet** | `768px - 1024px` | Auto-collapsed to compact icon strip mode (`w-16`). | Double column layouts merge into single scroll stacks where necessary. |
| **Desktop** | `> 1024px` | Fully expanded (`w-60`) or collapsed by choice (persisted to `localStorage`). | Multi-column layouts expand. Left and right panels can be toggled to maximize canvas space. |

---

## 6. Standard Component Patterns

### 6.1 Chat Workspace Architecture
```
+---------------------------------------------------------------------------------+
| Top Header: bg-card/80 backdrop-blur-sm border-b border-border                   |
| Title: text-foreground | Mode Switcher: bg-muted text-muted-foreground          |
+---------------------------------------------------------------------------------+
| Main Canvas: bg-background                                                      |
|                                                                                 |
|   [User Message]                                                                |
|   bg-primary text-primary-foreground rounded-2xl rounded-tr-md shadow-sm        |
|                                                                                 |
|   [Assistant Message]                                                           |
|   bg-card border border-border text-card-foreground rounded-2xl rounded-tl-md   |
|   - Headers: text-foreground font-bold                                          |
|   - Body: text-foreground/90                                                    |
|   - Inline Code: bg-muted text-primary border border-border/50                  |
|   - Table: border border-border, thead bg-muted/50, tr hover:bg-muted/30        |
|                                                                                 |
+---------------------------------------------------------------------------------+
| Input Bar Wrap: px-4 py-3 border-t border-border bg-card/40                     |
| Floating Prompt: bg-card border border-border focus-within:border-primary/50    |
| Textarea: bg-transparent text-foreground placeholder:text-muted-foreground      |
| Action Buttons: bg-muted hover:bg-accent text-muted-foreground border-border   |
+---------------------------------------------------------------------------------+
```

### 6.2 System Trace Rail Architecture
- **Panel Container**: `bg-card border-l border-border text-card-foreground`
- **Header**: `border-b border-border bg-muted/40`
- **Trace Event Card**: `bg-card border border-border hover:bg-muted/30 hover:border-border/80`
- **Payload & Code Inspection**: `bg-muted/50 border border-border text-foreground font-mono`
- **Event Badges**:
  - Routing: `bg-purple-500/10 text-purple-600 dark:text-purple-300 border-purple-500/20`
  - Specialist Node: `bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border-indigo-500/20`
  - Masking: `bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/20`
  - Tool Invocation: `bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/20`
  - Synthesis: `bg-sky-500/10 text-sky-600 dark:text-sky-300 border-sky-500/20`

### 6.3 Command Center Architecture
- **Tab Navigation Bar**: `bg-card border border-border` with inactive buttons `text-muted-foreground hover:text-foreground hover:bg-muted` and active buttons `bg-primary text-primary-foreground shadow-sm`.
- **Form Surface**: `bg-card border border-border text-card-foreground`.
- **Form Action Footer**: `sticky bottom-0 z-10 bg-card/95 backdrop-blur-md py-4 border-t border-border mt-4 -mx-6 px-6 rounded-b-3xl`.
- **Surface Contrast Pills**: Dynamically rendered with light/dark surface preview indicators, never hardcoded dark pills with `text-white`.

### 6.4 Agent Role Palette Specifications
The canvas editor node styles strictly replicate the backgrounds, borders, and badges of the Agent Palette sidebar:

| Role Template | Accent | Background Token | Border Token | Badge Color |
| :--- | :--- | :--- | :--- | :--- |
| **Supervisor Agent** | `indigo` | `bg-indigo-500/10` | `border-indigo-500/30` | `text-indigo-600 dark:text-indigo-300 bg-indigo-500/15` |
| **Worker / Specialist** | `emerald` | `bg-emerald-500/10` | `border-emerald-500/30` | `text-emerald-600 dark:text-emerald-300 bg-emerald-500/15` |
| **Synthesizer Agent** | `amber` | `bg-amber-500/10` | `border-amber-500/30` | `text-amber-600 dark:text-amber-300 bg-amber-500/15` |
| **Scheduled Worker** | `purple` | `bg-purple-500/10` | `border-purple-500/30` | `text-purple-600 dark:text-purple-300 bg-purple-500/15` |

---

## 7. Anti-Patterns & Quality Gate Rules

### ❌ Strictly Prohibited Anti-Patterns:
1. `className="bg-[#14141f] border-[#1f1f2e] text-white"` — Breaks light mode completely.
2. `html.light .text-white { color: #0f172a !important; }` — Destroys white text on primary buttons, user bubbles, and dark badges.
3. `className="bg-slate-900 border-slate-800 text-slate-200"` — Causes inverted contrast or muddy dark blocks in light mode.
4. Hardcoding `#000000` or `#0c0c12` on sticky footers or drawer handles.
5. Missing `suppressHydrationWarning` on `<html>` or neglecting the anti-flicker theme script.

### ✅ Mandatory Conformance:
- Always use `bg-background` for canvases, `bg-card` for cards, `bg-popover` for menus, `bg-muted` for chips/toolbars.
- Always use `text-foreground` for default body text, `text-card-foreground` for cards, `text-muted-foreground` for secondary text.
- Always test every UI view under both `html.light` and `html.dark` before pushing code.
