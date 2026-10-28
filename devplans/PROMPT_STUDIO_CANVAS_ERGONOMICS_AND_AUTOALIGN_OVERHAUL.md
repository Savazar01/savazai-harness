# TASK PROMPT: Landing Page Threat Surface Hardening, Studio Canvas Ergonomics, Zoom State Persistence & Deterministic Auto-Align Layout Engine

**Date**: October 28, 2026  
**Status**: ACTIVE  
**Reference Visuals**: `image_ab027f.jpg` through `image_aa1926.jpg` (uploaded UI screenshots)

---

## 1. Problem Statement & Diagnosed Deficiencies

User feedback and UI diagnostic artifacts demonstrate 5 major functional and ergonomic defects:

### Defect 1: Public Threat Surface on Landing Page (`/`)
- Landing page header provides a public `<Link href="/signin">Sign In</Link>` button and the hero section includes `<Link href="/signin">Operator Sign In →</Link>`.
- **Requirement**: Strip out both public sign-in links to prevent rogue endpoint scanning and brute-force bot assaults. Public visitors must only access the enterprise "Request Demo" workflow.

### Defect 2: Capability Studio Test Playground Contrast Inversions
- In Light Mode, typing in "Type a test prompt" displays white text on white background (`text-white` hardcoded or unresolved text color).
- The Execution Strategy selector (`Inherit Agent Default`, `Plan First`, `Direct Execution`) is washed out with low contrast in Light Mode.

### Defect 3: Infinite Matrix Ergonomics, Cursors, Resizing & Magnification
- Cursor disappearing or turning white/invisible when hovering empty interior space inside Team containers.
- Agent nodes (Supervisor, Specialist, Synthesizer) lack resize handles.
- Hovering agent cards does not provide an expanded/magnified detail view for navigating complex flows.
- Connecting orthogonal edges cannot be adjusted and overlap node boundaries.
- Action buttons (collapse, delete, add worker) on Team cards wash out with low contrast in Light Mode.
- "Save Draft" toast notification displays washed-out unreadable light green styling.

### Defect 4: Viewport State Persistence
- Navigating away from Capability Studio (e.g. to Business Center or Command Center) and returning resets the zoom and pan coordinates, disrupting the operator's spatial context.
- Viewport `{ x, y, zoom }` must be stored per agentflow in `localStorage` and persisted to database.

### Defect 5: Deterministic Auto-Align Layout Engine
- Clicking "Auto Align" places the supervisor and synthesizer at arbitrary vertical coordinates and creates misaligned or cramped layouts.
- Auto Align must enforce a clean, deterministic architecture:
  - Left column: Supervisor Node (centered vertically relative to teams stack).
  - Center column: Vertically stacked Team Containers with specialists arranged in balanced grids (2-3 columns) with uniform margins.
  - Right column: Synthesizer Node (centered on the same horizontal axis as the supervisor).
  - Smooth animation + auto-fit view.
