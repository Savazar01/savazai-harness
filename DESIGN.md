# Design System Standards & UX Architecture

This document maps the layout specifications, design tokens, and components used inside the SavazAI Console.

## 1. Dynamic Design System & Brand Hydration

The system uses a CSS-in-JS style injection at the Server-Side Rendering (SSR) boundary in [theme-provider.tsx](file:///c:/Users/AVASA/Downloads/OpenC/savazai-harness/savazai-console/src/components/theme-provider.tsx).

### Hydrated Variable Tokens
- `--primary`: Dynamically resolves to the RGB components of the primary brand color override (e.g. `bg-primary`, `text-primary`).
- `--secondary`: Resolves to the RGB components of the secondary color (e.g. `bg-secondary`, `text-secondary`).
- `--brand-logo-url`: Holds the brand image URL fetched from the `system_configurations` schema table.

> [!IMPORTANT]
> DO NOT hardcode dynamic brand colors (like hex overrides) directly in utility classes. Always delegate highlights to `bg-primary`, `text-primary`, or Tailwind variable utilities.

---

## 2. Global Accessibility & WCAG AA Contrast Mandate

Every dialog, dropdown, input field, and list element must maintain readable contrast boundaries on dark surfaces:

- **Modals & Dialogs**: Subtexts and helper paragraphs must use high-contrast slate or zinc text classes (e.g. `text-slate-200`, `text-slate-300`). Muted slate tags (`text-slate-500` / `text-slate-600`) are prohibited on body text or titles.
- **Input Placeholders**: Input placeholders must use `placeholder-slate-400` to guarantee visibility on dark input backgrounds.

---

## 3. Responsive Screen Layout Breakpoints

All components must render natively across the following three responsive layout configurations:

| Breakpoint | Screen Width | Sidebar View | Content & Multi-column Stacking |
| :--- | :--- | :--- | :--- |
| **Mobile** | `< 768px` | Hidden. Replaced by a floating slide-out drawer (`fixed top-4 left-4`). | Form grids, action panels, and sandbox drawers collapse to a single flex column. |
| **Tablet** | `768px - 1024px` | Auto-collapsed to compact icon strip mode (`w-16`). | Double column layouts merge into single scroll stacks where necessary. |
| **Desktop** | `> 1024px` | Fully expanded (`w-60`) or collapsed by choice (persisted to `localStorage`). | Multi-column layouts expand. Left and right panels can be toggled to maximize canvas space. |

---

## 4. Collapsible Panels & Canvas Space Optimization

To support large, complex visual agentflows, panels surrounding the canvas can be collapsed:

- **Left Navigation Sidebar**: Toggleable chevron at the top header controls expansion. State is persisted in `localStorage` under `savazai_sidebar_collapsed`.
- **Left Agent Palette**: A collapse button next to the header hides the drawer completely, leaving a floating, absolute-positioned `Palette` handle in the top-left corner of the canvas. State is persisted in `localStorage` under `savazai_palette_collapsed`.

---

## 5. Agent Role Palette Specifications

The canvas editor node styles strictly replicate the backgrounds, borders, and badges of the Agent Palette sidebar:

| Role Template | Accent | Background Token | Border Token | Badge Color |
| :--- | :--- | :--- | :--- | :--- |
| **Supervisor Agent** | `indigo` | `bg-indigo-500/10` | `border-indigo-500/30` | `text-indigo-300 bg-indigo-500/15` |
| **Worker / Specialist** | `emerald` | `bg-emerald-500/10` | `border-emerald-500/30` | `text-emerald-300 bg-emerald-500/15` |
| **Synthesizer Agent** | `amber` | `bg-amber-500/10` | `border-amber-500/30` | `text-amber-300 bg-amber-500/15` |
| **Scheduled Worker** | `purple` | `bg-purple-500/10` | `border-purple-500/30` | `text-purple-300 bg-purple-500/15` |
