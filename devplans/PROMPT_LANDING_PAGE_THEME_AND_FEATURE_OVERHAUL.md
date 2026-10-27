# PROMPT: Complete Landing Page Overhaul — Default Dark Mode, Top-Left Theme Switcher, Hero Legibility & Full Feature Synchronization

---

## 1. Problem Statement & User Objectives

Visual inspection of the public landing page at `http://localhost:3056/` (`image_194392.jpg`) revealed critical visibility and ergonomics defects in Light Mode:

1. **Invisible Main Hero Heading (`image_194392.jpg`)**:
   - The primary title line (`Orchestrate Autonomous Agents`) is rendered with pure white text inheriting from `text-slate-100`, making it completely invisible against the light viewport background (`#f8fafc`). Only the colored gradient subtitle `With Absolute Integrity` is visible.
2. **Missing Theme Switcher on Public Header**:
   - The top header navigation lacks a theme toggle switch. Public visitors have no method to toggle between Dark Mode and Light Mode.
3. **Default Theme Enforcement**:
   - The platform landing page must default to **Dark Mode** on initial load (providing an immediate sovereign AI, executive aesthetic), while enabling visitors to toggle to high-contrast Light Mode via a top-left switch adjacent to the branding.
4. **Outdated Feature Showcase**:
   - The landing page content sections do not showcase all capabilities delivered across recent platform sprints:
     - Visual Capability Studio (`TeamNode` collapsible agent teams, orthogonal bus routing).
     - Compiled LangGraph Agentflows with Plan-First Human-in-the-Loop (HITL) approval cards.
     - Universal Dynamic Model Context Protocol (MCP) Gateway (streamable-http, sse, stdio) with live tool schema discovery (e.g. NSE India Bhavcopy).
     - Enterprise Zero-Trust Security & RBAC (53 permissions, 6 system profiles, closed registration, invitation OTP, Cloudflare Turnstile).
     - Command Center & System Admin Hub (native SMTP/Nodemailer engine, live audit logs, Appearance studio).
     - Business Policy & Knowledge Framework (Universal Skills, Google OKF Concepts, regex DLP PII masking).

---

## 2. Core Mandates

- **Hero Heading Contrast**: Dual-mode responsive gradient (`from-slate-950 via-slate-900 to-slate-700` in Light Mode, `from-white via-slate-200 to-slate-400` in Dark Mode), guaranteeing WCAG AAA contrast > 10:1.
- **Top-Left Header Switcher**: Mount `ThemeToggle` directly adjacent to the branding in the header.
- **Default Dark Theme**: Configure `ClientThemeProvider` and `getSystemConfig` default fallback to `"dark"`.
- **Feature Sections Update**: Modernize the 4 feature grids to reflect the complete production capabilities.
- **Docs & Repository Sync**: Update `README.md` and `AGENTS.md`.
