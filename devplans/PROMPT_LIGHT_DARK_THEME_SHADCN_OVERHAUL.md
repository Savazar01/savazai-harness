# TASK SPECIFICATION: Comprehensive Light/Dark Theme Engine Overhaul, Design System Architecture (`DESIGN.md`), and UI-UX Pro Max Standards

---

## 1. Executive Summary & Problem Analysis

Switching to **Light Mode** currently produces severe contrast, legibility, and layout defects across platform pages (observed in `media_1793077807803_9dec8db8.png` and `media_1793077959987_5a4b5069.png`):

### 🔍 Identified Theme Defects:
1. **Agent Workspace Contrast Collisions**:
   - **Main Chat Canvas**: Harsh `#ffffff` canvas abruptly clashes with dark `#1e2029` chat bubbles and an orphaned dark input prompt container (`#14141f` / `#1f1f2e`).
   - **Assistant Chat Bubble Legibility**: Dark gray/charcoal text rendered inside dark-tinted bubble backgrounds, making agent responses unreadable.
   - **System Trace Rail**: Dark cards on a white sidebar background with washed-out gray badges.
   - **Chat Input Bar**: Hardcoded dark background `#14141f` with dark borders and white text floats out of place on the light canvas.
2. **Command Center Inverted Contrast & Layout**:
   - Form action footer hardcoded pitch black (`#0c0c12`), appearing as an aggressive black block at the bottom of the light settings page.
   - Appearance tab surface contrast preview pills hardcoded with dark slate backgrounds and `text-white`.
   - Electric purple / dark blue badges and tabs clashing without subtle muted backgrounds.
3. **Sidebar Low Contrast**:
   - Low-contrast gray text on white/gray backgrounds failing WCAG AA (4.5:1 ratio).
   - Inactive items have low contrast; icons and text don't adapt to semantic muted states.
4. **Root Cause of Text Inversion Bugs**:
   - In `savazai-console/src/app/globals.css`, brute-force rules like `html.light .text-white { color: #0f172a !important; }` corrupted contrast everywhere (e.g. converting white text on primary purple buttons into dark charcoal, or clashing with dark containers).
   - Tailwind v4 `@theme` lacked standard semantic token mappings (`--color-card`, `--color-card-foreground`, `--color-muted`, `--color-border`, `--color-popover`, etc.).
   - Hardcoded utility classes (`bg-[#14141f]`, `bg-[#0c0c14]`, `bg-slate-900`, `text-white`, `border-slate-800`) were scattered across components instead of semantic tokens (`bg-card`, `text-card-foreground`, `border-border`, `bg-muted`, `text-muted-foreground`, `bg-primary`, `text-primary-foreground`).

---

## 2. DevPlans & Architecture Deliverables

1. **`DESIGN.md` in Repository Root**: Complete design system contract specifying token taxonomy, typography scale, 8pt spatial grid, component patterns, contrast rules (WCAG AA/AAA), and light/dark theme mappings.
2. **Global Semantic Token Engine in `globals.css`**: Full Shadcn Slate HSL/OKLCH token definitions mapped to Tailwind v4 `@theme`. Eradication of brute-force `!important` text overrides.
3. **Component Refactoring**:
   - `sidebar.tsx`: Semantic cards, borders, text, active/inactive states.
   - `chat-workspace.tsx`: Header, mode toggles, MCP dropdown, canvas, and chat input box refactored to semantic tokens.
   - `chat-message.tsx`: Assistant bubble (`bg-card border border-border text-card-foreground`), user bubble (`bg-primary text-primary-foreground`), Markdown headers/paragraphs/tables/code blocks using semantic tokens.
   - `system-trace.tsx`: Rail container, trace cards, event badges, and payloads cleanly adapting to light and dark themes.
   - `settings-dashboard.tsx`: Command Center appearance tab, surface contrast pills, tab navigation, and sticky form action footer refactored to semantic tokens.
   - `theme-provider.tsx`: Scoping custom background overrides strictly to dark mode so light mode is never stomped.
4. **Governance Updates**: Update `AGENTS.md` and `README.md` to reference `DESIGN.md`.
5. **Quality Verification Loop**: Clean build, TypeScript checks, Docker container rebuild, and `graphify update .`.
