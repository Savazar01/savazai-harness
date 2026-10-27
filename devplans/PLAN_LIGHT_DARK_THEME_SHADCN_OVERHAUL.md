# IMPLEMENTATION PLAN: Comprehensive Light/Dark Theme Engine Overhaul, Design System Architecture (`DESIGN.md`), and UI-UX Pro Max Standards

---

## 1. Architecture Overview & Strategy

The objective is to establish an enterprise-grade, WCAG AA/AAA compliant semantic theme engine across SavazAI Console. This replaces ad-hoc dark classes and fragile `!important` CSS overrides with a unified Shadcn Slate design token contract.

### Core Architectural Pillars:
1. **Single Source of Truth (`DESIGN.md`)**: Defines tokens, typography, surfaces, elevations, and layout rules.
2. **Tailwind v4 Semantic Mapping (`globals.css`)**: Defines CSS custom properties under `:root` (light) and `html.dark` (dark), registered directly into Tailwind v4's `@theme` block.
3. **No Brute-Force Overrides**: Remove `html.light .text-white { color: #0f172a !important; }` and similar rules that invert contrast inappropriately.
4. **Pure Semantic Utilities in Components**: Convert all hardcoded colors (`bg-[#14141f]`, `bg-slate-900`, `text-white`, `border-slate-800`, `bg-[#0c0c12]`) to semantic tokens (`bg-background`, `bg-card`, `text-card-foreground`, `border-border`, `bg-muted`, `text-muted-foreground`, `bg-primary`, `text-primary-foreground`, `bg-popover`).

---

## 2. Token Contract Specification

| Token | Light Mode Value | Dark Mode Value | Usage |
| :--- | :--- | :--- | :--- |
| `--background` | `#f8fafc` (Slate 50) | `#06060b` (Obsidian) | Root canvas background |
| `--foreground` | `#0f172a` (Slate 900) | `#f8fafc` (Slate 50) | Primary body text |
| `--card` | `#ffffff` (Pure White) | `#0c0c16` (Deep Slate) | Cards, panels, sidebars, modals |
| `--card-foreground` | `#0f172a` (Slate 900) | `#f8fafc` (Slate 50) | Card header & body text |
| `--popover` | `#ffffff` (Pure White) | `#14141f` (Deep Obsidian) | Dropdowns, menus, tooltips |
| `--popover-foreground`| `#0f172a` (Slate 900) | `#f8fafc` (Slate 50) | Popover menu item text |
| `--primary` | `#4f46e5` (Indigo 600) | `#6366f1` / `#4f46e5` | Primary buttons, active tabs |
| `--primary-foreground`| `#ffffff` | `#ffffff` | Text on primary elements |
| `--secondary` | `#06b6d4` (Cyan 500) | `#06b6d4` (Cyan 500) | Secondary badges, accents |
| `--secondary-foreground`| `#ffffff` | `#ffffff` | Text on secondary elements |
| `--muted` | `#f1f5f9` (Slate 100) | `#181926` (Slate 800/900) | Inactive tabs, code blocks, hovered rows |
| `--muted-foreground` | `#64748b` (Slate 500) | `#94a3b8` (Slate 400) | Subtitles, placeholders, captions |
| `--accent` | `#f1f5f9` (Slate 100) | `#1e1e2f` | Hover highlights |
| `--accent-foreground` | `#0f172a` (Slate 900) | `#f8fafc` (Slate 50) | Text on hover highlights |
| `--destructive` | `#ef4444` (Red 500) | `#f87171` (Red 400) | Errors, delete actions |
| `--destructive-foreground`| `#ffffff` | `#ffffff` | Text on destructive buttons |
| `--border` | `#e2e8f0` (Slate 200) | `#1e1e2f` (Slate 800) | Dividers, borders, card outlines |
| `--input` | `#ffffff` / `#cbd5e1` | `#12121e` / `#1e1e2f` | Input backgrounds and borders |
| `--ring` | `#6366f1` (Indigo 500) | `#6366f1` (Indigo 500) | Focus rings |

---

## 3. Step-by-Step Implementation Sequence

### Phase 1: Design System Architecture (`DESIGN.md`)
- Create `DESIGN.md` in repository root.
- Document token taxonomy, typography scale, spatial grid, component patterns, contrast guarantees (WCAG AA compliant), light/dark mode mappings, and anti-patterns.

### Phase 2: Theme Engine Tokens in `globals.css` & `theme-provider.tsx`
- In `savazai-console/src/app/globals.css`:
  - Define `:root` (light) and `html.dark` (dark) token variables.
  - Map variables under `@theme` so Tailwind generates utility classes (`bg-background`, `bg-card`, `text-card-foreground`, `bg-popover`, `text-popover-foreground`, `bg-muted`, `text-muted-foreground`, `border-border`, `bg-primary`, `text-primary-foreground`, etc.).
  - Purge brute-force `!important` text color and background overrides.
  - Standardize base styles for `input`, `select`, `textarea` using semantic tokens.
- In `savazai-console/src/components/theme-provider.tsx`:
  - Ensure custom background from database applies strictly to `html.dark` so it never stomps light mode.
  - Set `--primary` and `--secondary` cleanly.

### Phase 3: Core Workspace Components Refactor
1. **`sidebar.tsx`**:
   - Container: `bg-card border-r border-border text-card-foreground`.
   - Header & brand: `text-foreground`.
   - Active item: `bg-primary text-primary-foreground shadow-sm`.
   - Inactive item: `text-muted-foreground hover:text-foreground hover:bg-muted/60`.
   - Thread list: `text-muted-foreground hover:text-foreground hover:bg-muted/50`.
   - Profile link: `text-foreground hover:bg-muted/60`.
   - Collapse button: `text-muted-foreground hover:text-foreground hover:bg-muted/60`.
2. **`chat-workspace.tsx`**:
   - Header: `border-b border-border bg-card/80 backdrop-blur-sm text-card-foreground`.
   - Workspace title: `text-foreground`.
   - Mode switcher tabs: active `bg-primary text-primary-foreground`, inactive `text-muted-foreground hover:text-foreground hover:bg-muted`.
   - MCP selector button: `bg-card border border-border text-foreground hover:bg-muted`.
   - MCP dropdown menu: `bg-popover text-popover-foreground border border-border shadow-2xl divide-border`.
   - Chat input box: `bg-card border border-border focus-within:border-primary/50 rounded-2xl shadow-lg`.
   - Textarea: `text-foreground placeholder:text-muted-foreground bg-transparent`.
   - Input toolbar pills: `bg-muted text-muted-foreground border border-border`.
3. **`chat-message.tsx`**:
   - User message: `bg-primary text-primary-foreground rounded-2xl rounded-tr-md shadow-sm`.
   - Assistant message: `bg-card border border-border text-card-foreground rounded-2xl rounded-tl-md shadow-xs`.
   - Markdown elements:
     - `h1`, `h2`, `h3`: `text-card-foreground font-bold`.
     - `p`, `li`, `td`: `text-card-foreground/90`.
     - `th`: `text-muted-foreground font-semibold`.
     - `thead`: `bg-muted/50 border-b border-border`.
     - `tbody`: `divide-y divide-border`.
     - `code`: `bg-muted text-primary border border-border/50 rounded px-1.5 py-0.5`.
     - `blockquote`: `border-l-2 border-primary/50 text-muted-foreground`.
     - `img`: `border border-border bg-muted/20`.
     - Toolbar buttons: semantic borders and text.
4. **`system-trace.tsx`**:
   - Container: `bg-card border-l border-border text-card-foreground`.
   - Header: `border-b border-border bg-muted/40`.
   - Event cards: `bg-card border border-border hover:bg-muted/30 hover:border-border/80`.
   - Code blocks / PII blocks: `bg-muted/50 border border-border text-foreground font-mono`.
   - Vertical docked tab: `bg-card hover:bg-muted border-l border-y border-border text-foreground shadow-lg`.
5. **`settings-dashboard.tsx`**:
   - Navigation tabs: semantic inactive/active styles.
   - Container card: `bg-card border border-border text-card-foreground`.
   - Surface contrast preview buttons: dynamic light/dark preview states adapting cleanly.
   - Sticky form action footer: replace hardcoded `#0c0c12` with `bg-card/95 border-t border-border`.

### Phase 4: Policy & Governance Synchronization
- Update `AGENTS.md` and `README.md` to reference `DESIGN.md` as mandatory UI conformance law.

### Phase 5: Verification & Production Release
- TypeScript compile: `npx tsc --noEmit`.
- Next.js build: `npm --prefix savazai-console run build`.
- Knowledge graph update: `graphify update .`.
- Docker container rebuild: `docker compose down && docker compose up --build -d`.
- Create `/devplans/WALKTHROUGH_LIGHT_DARK_THEME_SHADCN_OVERHAUL.md`.
- Git commit and push.
