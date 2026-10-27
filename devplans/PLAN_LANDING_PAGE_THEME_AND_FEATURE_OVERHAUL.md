# PLAN: Complete Landing Page Overhaul — Default Dark Mode, Top-Left Theme Switcher, Hero Legibility & Full Feature Synchronization

---

## 1. Executive Summary & Architectural Goals

The public landing page (`savazai-console/src/app/page.tsx`) requires visual, structural, and theme engine upgrades to address defects shown in `image_194392.jpg`:
1. **Default Dark Mode**: Fresh browser visits (incognito / first-time visitors) must render in **Dark Mode** (`html.dark`) by default to align with the sovereign, executive AI identity of SavazAI, while honoring user preferences stored in `localStorage`.
2. **Top-Left Theme Switcher**: An interactive `ThemeToggle` component mounted in the header immediately adjacent to the platform logo/branding.
3. **Hero Title Contrast**: Eliminate `text-slate-100` inheritance on the root container and implement a dual-mode high-contrast gradient (`from-slate-950 via-slate-900 to-slate-700` in Light Mode, `from-white via-slate-200 to-slate-400` in Dark Mode) ensuring > 12:1 WCAG AAA contrast on both surfaces.
4. **Header Navigation & Dual CTAs**: Provide clear paths for both authenticated operators (`Open Workspace` -> `/dashboard` or `/studio`) and public visitors (`Sign In` -> `/signin` + `Request Enterprise Demo` interactive modal trigger).
5. **Feature Synchronization (4 Complete Architectural Pillars)**:
   - **Pillar 1: Visual Agentflow Builder & Execution Engine** (LangGraph runtime, collapsible TeamNodes, Plan-First HITL approval cards).
   - **Pillar 2: Universal Model Context Protocol (MCP) Gateway** (streamable-http, sse, stdio, dynamic discovery, dual runtime workspace).
   - **Pillar 3: Enterprise Zero-Trust Security & RBAC** (53 permissions, 6 system profiles, closed registration, invitation OTP, Cloudflare Turnstile).
   - **Pillar 4: Business Policy & Knowledge Framework** (Universal Skills, Google OKF, DLP/PII masking).
6. **Documentation Synchronization**: Keep `README.md` and `AGENTS.md` synchronized with the new landing page defaults and architecture.

---

## 2. File Change Breakdown

### A. Theme Engine Configuration
- `savazai-console/src/components/theme/client-theme-provider.tsx`:
  - Set `defaultTheme = "dark"`.
  - Set `enableSystem = false` so visitors default to Dark Mode without relying on OS defaults, but manual toggles to `"light"` are persisted in `localStorage` by `next-themes`.
- `savazai-console/src/components/theme-provider.tsx`:
  - Fallback in `getSystemConfig()`: set `themeMode: "dark"`.
  - In `ThemeProvider`: default to `tokens.themeMode || "dark"`.

### B. Landing Page Refactor
- `savazai-console/src/app/page.tsx`:
  - Import `ThemeToggle` from `@/components/theme-toggle`.
  - Header: Mount `<ThemeToggle compact={true} className="ml-2" />` immediately adjacent to the brand title.
  - Header Navigation: Add `Sign In` (`/signin`) and `RequestDemoTrigger` (or `Open Workspace` if session exists).
  - Root container: Replace `text-slate-100` with `text-foreground`.
  - Hero Section:
    - Primary headline: Apply `bg-clip-text text-transparent bg-gradient-to-b from-slate-950 via-slate-900 to-slate-700 dark:from-white dark:via-slate-200 dark:to-slate-400`.
    - Secondary accent: `bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 via-primary to-cyan-500`.
    - Feature pills: Semantic styling with `bg-card/80 border border-border text-foreground shadow-xs`.
    - Hero CTAs: Dual action buttons: `[ Open Workspace ]` (`/dashboard`) or `[ Request Enterprise Demo ]` with secondary `[ Explore Agentflows ]`.
  - Feature Sections:
    - Update Pillar 1: Visual Agentflow Builder (TeamNode, LangGraph, Plan-First HITL).
    - Update Pillar 2: Universal MCP Gateway (streamable-http, sse, stdio, dynamic discovery like NSE India Bhavcopy).
    - Update Pillar 3: Enterprise Zero-Trust Security & RBAC (53 permissions, 6 system profiles, closed registration, invitation OTP, Cloudflare Turnstile).
    - Update Pillar 4: Business Policy & Knowledge Framework (Universal Skills, Google OKF, DLP/PII masking).

### C. Documentation Synchronization
- `README.md`: Document default dark mode, public landing page theme toggle, and updated feature showcase.
- `AGENTS.md`: Note landing page dual-theme contrast verification requirement.

---

## 3. Verification & Quality Gates

1. **TypeScript Typecheck**: `npx tsc --noEmit` in both workspaces.
2. **Theme Linting**: `npm --prefix savazai-console run lint:theme`.
3. **Contrast Verification**: `npm --prefix savazai-console run check:contrast`.
4. **Next.js Production Build**: `npm --prefix savazai-console run build`.
5. **Knowledge Graph Synchronization**: `graphify update .`.
6. **Docker Services Verification**: `docker compose up --build -d savazai-console` and health check.
