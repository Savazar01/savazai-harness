# PROMPT: Enterprise UI/UX Overhaul via shadcn & ui-ux-pro-max Skills

## Problem Statement
Switching to Light Mode produces a fractured hybrid interface:
- image_286615.png (Agent Workspace): sidebar and System Trace turn white while the central canvas stays pitch-black with an orphaned bottom bar and low-contrast grey text.
- image_2865d3.png (Capability Studio): sidebar is white while canvas, toolbar and Agent Teams remain dark.
- image_284ad5.jpg (Business Center): sidebar is white while Universal Skills / OKF / Compliance tables remain pitch-black.

Cause (reported): components use ad-hoc hardcoded classes (bg-[#...], bg-slate-900, text-white) instead of semantic tokens.

## Mandate
1. Install/execute skills:
   - shadcn: https://www.skills.sh/shadcn-ui/ui/shadcn
   - ui-ux-pro-max: https://www.skills.sh/nextlevelbuilder/ui-ux-pro-max-skill/ui-ux-pro-max
2. Produce an enterprise-grade DESIGN.md (principles, semantic token contract for light+dark, surface elevation hierarchy, typography & 4/8px spacing, Shadcn component standards, theme transition contract).
3. Global theme engine: CSS variables + Tailwind semantic mapping, purge hardcoded colors, next-themes provider without FOUC/hydration mismatch.
4. Overhaul every screen: Agent Workspace, Capability Studio, Business Center, Command Center (9 tabs), Docs, User Admin, Landing, Sign-in, Onboarding.
5. Appearance tab: easy Light/Dark switching plus selectable standard colors that work in both modes.
6. Update AGENTS.md (Design System & UI Conformance) and README.md; graphify update .
7. Quality gates: npx tsc --noEmit; savazai-console npm run build; graphify update .; docker compose down / up --build -d / ps.
8. User request: perform full, thorough analysis and present a plan for review and approval BEFORE implementation.
