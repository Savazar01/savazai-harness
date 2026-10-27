# PLAN: Universal Light Mode Contrast Hardening, Metric & Badge Remediation, and Typography Legibility Sweep

---

## 1. Architectural Strategy

We will systematically eliminate all washed-out pastel text, hardcoded dark fills (`bg-slate-800`), unreadable alert text (`text-amber-200`/`text-amber-300`), and low-contrast table headers/labels across the four diagnosed screens:
1. `Demo Requests` (`savazai-console/src/components/admin/demo-request-management.tsx`)
2. `User Administration` (`savazai-console/src/components/admin/user-management.tsx`)
3. `User Profile Hub` (`savazai-console/src/components/profile/profile-hub.tsx`)
4. Global Semantic Token Hardening (`savazai-console/src/app/globals.css`)

---

## 2. File Change Breakdown

### A. Demo Requests Management (`demo-request-management.tsx`)
1. **KPI Metric Cards Overhaul**:
   - Background: `bg-card border border-border shadow-xs rounded-xl p-5`
   - Label: `text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5`
   - Metric Number: `text-3xl font-extrabold text-foreground` (crisp `#0f172a` in Light, `#f8fafc` in Dark)
   - Accent Icons:
     - Total Inquiries: `text-foreground/70`
     - Pending Review: `text-amber-600 dark:text-amber-400`
     - Scheduled Demos: `text-indigo-600 dark:text-indigo-400`
     - Completed / Won: `text-emerald-600 dark:text-emerald-400`
2. **Status Badges (`STATUS_CONFIG`)**:
   - `pending`: `bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/30 font-medium`
   - `contacted`: `bg-sky-500/10 text-sky-800 dark:text-sky-300 border border-sky-500/30 font-medium`
   - `scheduled`: `bg-indigo-500/10 text-indigo-800 dark:text-indigo-300 border border-indigo-500/30 font-medium`
   - `completed`: `bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30 font-medium`
   - `archived`: `bg-muted text-muted-foreground border border-border font-medium`
3. **Filter Tabs & Action Buttons**:
   - Active Tab: `bg-primary text-primary-foreground shadow-xs font-semibold`
   - Inactive Tab: `text-muted-foreground hover:text-foreground hover:bg-muted font-medium`
   - Table Action "Manage" Button: `px-2.5 py-1 rounded-lg bg-card border border-border text-foreground hover:bg-muted text-xs font-semibold transition-all shadow-xs`
   - Table Action "Delete" Button: `p-1 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors`
   - Modal container: eliminate `text-slate-100`, use `text-foreground`. Replace `hover:bg-slate-800` with `hover:bg-muted`.

### B. User Administration (`user-management.tsx`)
1. **Active Users Table Typography & Badges**:
   - Table header row: `border-b border-border bg-muted/40 text-foreground/80 font-bold tracking-wider uppercase text-[11px]`
   - User row names: `font-semibold text-foreground group-hover:text-primary transition-colors`
   - User row emails: `text-muted-foreground font-mono text-[11px]`
   - SuperAdmin avatar: `bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30`
   - Operator avatar: `bg-muted text-foreground border border-border`
   - Role badges:
     - Super Admin: `bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/30 font-semibold`
     - Operator/Custom: `bg-indigo-500/10 text-indigo-800 dark:text-indigo-300 border border-indigo-500/30 font-semibold`
   - Status badge:
     - ACTIVE: `bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30 font-bold`
     - PENDING/SUSPENDED: `bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/30 font-bold`
   - Action buttons: replace `hover:bg-slate-800` with `hover:bg-muted text-muted-foreground hover:text-foreground`.
2. **Pending Approvals Queue**:
   - Quarantine Alert Container: `p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 flex items-start gap-3`
   - Quarantine Title: `font-bold text-amber-900 dark:text-amber-200 text-sm`
   - Quarantine Description: `text-amber-800/90 dark:text-amber-300/90 mt-1 leading-relaxed text-xs`
   - Table headers: `border-b border-border bg-muted/40 text-foreground/80 font-bold tracking-wider uppercase text-[11px]`
   - Applicant avatar: `bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/30`
   - "Email OTP Verified" badge: `bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30 font-semibold`
   - "Approve & Assign Profile" button: `bg-emerald-600 hover:bg-emerald-500 text-white font-semibold`
3. **Roles & Access Profiles Matrix**:
   - Role Card container: `rounded-2xl border border-border bg-card p-5 hover:border-border transition-all flex flex-col justify-between shadow-xs`
   - Role Card Title: `text-sm font-bold text-foreground tracking-wide`
   - Role Card Description: `text-xs text-muted-foreground line-clamp-2 leading-relaxed`
   - Badges (`SYSTEM PROFILE`, `CUSTOM`):
     - System Profile: `bg-indigo-500/10 text-indigo-800 dark:text-indigo-300 border border-indigo-500/30 font-semibold`
     - Custom: `bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30 font-semibold`
   - Authorized Capabilities Bar: `text-muted-foreground text-xs font-medium`, capability count pill: `font-bold text-foreground bg-muted border border-border px-2 py-0.5 rounded-md`
   - Permission table: Module header `font-bold text-xs text-primary uppercase tracking-wider`

### C. User Profile Hub (`profile-hub.tsx`)
1. **Labels & Descriptions**:
   - "Location / Operational Region" label: `block text-xs font-semibold text-foreground mb-1.5` (eliminate `text-slate-300`)
   - Password labels ("Current Password", "New Password", "Confirm New Password"): `block text-xs font-semibold text-foreground mb-1.5`
   - Input fields: `bg-background text-foreground border border-border placeholder:text-muted-foreground` (eliminate `bg-muted/30` and `placeholder-slate-500`)
   - Save Buttons: `bg-primary hover:bg-primary/90 text-primary-foreground` (eliminate `text-foreground` on primary)
2. **Badges & Lists**:
   - "ACTIVE ACCOUNT" badge: `bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30`
   - "Verified" email badge: `bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30`
   - Profile summary pill: `bg-primary/10 text-primary border border-primary/20`
   - My Access Profile module count pills: `bg-indigo-500/10 text-indigo-800 dark:text-indigo-300 border border-indigo-500/30`
   - Permission item cards: `bg-emerald-500/5 border border-emerald-500/20 text-foreground` (eliminate `text-slate-200`)

### D. Systemic Token Hardening (`globals.css`)
- `--muted-foreground`: `#334155` (slate-700 for high-contrast ~7.0:1 text legibility in light mode).

---

## 3. Quality Gates
1. `npx tsc --noEmit`
2. `npm --prefix savazai-console run lint:theme`
3. `npm --prefix savazai-console run check:contrast`
4. `npm --prefix savazai-console run build`
5. `graphify update .`
6. `docker compose up --build -d savazai-console`
7. Git commit & push.
