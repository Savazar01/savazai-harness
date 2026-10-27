# PROMPT: Universal Light Mode Contrast Hardening, Metric & Badge Remediation, and Typography Legibility Sweep

---

## 1. Problem Statement & User Objectives

Visual evidence across the platform (`image_1a3390.png`, `image_1a2c69.png`, `image_19da58.jpg`, `image_19da14.jpg`, `image_19d93f.png`) revealed acute contrast degradation, washed-out typography, and unreadable UI elements in Light Mode:

1. **Demo Requests Metric Cards & Tables (Ref: `image_1a3390.png`)**:
   - The 4 KPI metric cards ("Total Inquiries", "Pending Review", "Scheduled Demos", "Completed / Won") render counter numbers in washed-out faint yellow (`#fef08a`), faint purple (`#e9d5ff`), and pale mint green on pale-tinted backgrounds. Large metric numbers are virtually invisible.
   - Status badges such as "Demo Scheduled" and "Pending Review" render low-contrast text on pastel backgrounds (faint violet and pale yellow pills).
   - "Manage" button renders with a dark gray fill (`bg-slate-800`), and "All Leads" renders with dark brown/olive fill (`bg-primary text-foreground`), breaking component hierarchy and text contrast.
2. **User Administration Roster & Pending Approvals (Ref: `image_1a2c69.png` & `image_19da58.jpg`)**:
   - Table column headers (`USER`, `ASSIGNED PROFILE`, `STATUS`, `CREATED DATE`, `ACTIONS`) and body text render with low-opacity gray (`text-slate-400` / `#94a3b8`) instead of readable dark charcoal.
   - Quarantine State Enforced alert box renders faint yellow text (`text-amber-200` / `text-amber-300`) on a pale beige surface, making the disclaimer completely illegible.
   - "Email OTP Verified" pills and profile badge text wash out against light card backgrounds.
3. **Roles & Access Profiles Matrix (Ref: `image_19da14.jpg`)**:
   - System profile cards (Auditor, Business Policy Manager, Infrastructure Lead, etc.) render card descriptions and authorized capability labels in excessively faint, low-contrast gray.
   - Pill tags (e.g. `SYSTEM PROFILE`, `CUSTOM`) lack structural border contrast and use light mode text washed out on pastel backgrounds.
4. **User Profile Hub (Ref: `image_19d93f.png`)**:
   - Secondary labels ("Location / Operational Region", field helper text "Update your public profile display name...", and placeholder text) use ultra-faint gray (`text-slate-300` / `placeholder-slate-500`) with insufficient contrast ratios against white card surfaces.

---

## 2. Core Mandates

- Enforce **universal text readability** in Light Mode:
  - Body copy, headers, input text, and table values must resolve to high-contrast deep charcoal / slate (`#0f172a` or `#334155`).
  - Pastel text (faint yellow, faint purple, mint green) is strictly prohibited on light surfaces.
  - All badges, action buttons, and metric cards must adhere to WCAG 2.1 AA standards (minimum 4.5:1 contrast ratio).
- Maintain 100% theme adaptability: In Dark Mode, all surfaces adapt to dark backgrounds with crisp illuminated foregrounds (`dark:text-amber-300`, `dark:text-indigo-300`, `dark:text-emerald-300`).
