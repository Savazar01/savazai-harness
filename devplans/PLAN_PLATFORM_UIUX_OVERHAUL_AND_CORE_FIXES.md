# DEVPLAN: Platform UI/UX Overhaul, System Trace & Memory Resolution, Theme Engine, Markdown WYSIWYG & Documentation Sync

## 1. Executive Architecture Specification

### Workstream 1: Agent Workspace System Trace Panel & Deduplication
- **Collapsible Floating Toggle**:
  - In `savazai-console/src/components/system-trace.tsx` and `chat-workspace.tsx`:
    - Persist `system_trace_open` state in `localStorage` (`true` by default).
    - When collapsed (`!traceOpen`): Render a docked vertical floating icon tab on the right screen edge (`Activity` icon with label *"Open System Trace"*, tooltip, keyboard shortcut indicator).
    - When expanded: Smooth slide-in panel with `PanelRightClose` header button and clear event count.
- **Event Deduplication & Stream Aggregation**:
  - In `chat-workspace.tsx`:
    - Track streaming content length in a ref or in-place accumulator.
    - Instead of appending dozens of `completion` trace cards on each chunk (`addTrace("completion", "LLM Chunk", ...)`), aggregate chunks into a single dynamic entry: `LLM Chunk Streaming (X total chars received)`.
    - Provide clean, categorized trace headers: `[ROUTING]`, `[MASKING]`, `[TOOL_INVOCATION]`, `[TOOL_OUTPUT]`, `[SYNTHESIS]`.

### Workstream 2: Chat History & Thread Memory Fix
- **Resolve "Failed to load thread: 404"**:
  - In `savazai-console/src/app/api/chat/threads/[threadId]/route.ts`:
    - First query PostgreSQL `agentflow_thread_memory` for `threadId`.
    - If records exist, return `{ threadId, messages: [...] }`.
    - If not found in database, check backend proxy with fallback.
    - If neither has messages, return `{ threadId, messages: [] }` with `status: 200` (NOT 404), ensuring sidebar clicks on fresh/empty threads load cleanly without triggering error banners.
  - In `savazai-console/src/app/api/chat/route.ts`:
    - When Direct MCP completes, persist user message and assistant reply to `agentflow_thread_memory` so subsequent turns remember context.
    - Load prior turns for that thread when starting a direct MCP query.
  - In `chat-workspace.tsx`:
    - Gracefully handle empty message lists without throwing uncaught UI errors.

### Workstream 3: Direct MCP Dropdown Auto-Close & Multi-Select Fix
- **Click-Outside & Done Action**:
  - Wrap MCP dropdown with a ref and outside-click detector (`useEffect` on `mousedown`).
  - Add `Escape` key listener to close popover.
  - Add explicit bottom actions bar: **[ Select All ]**, **[ Clear ]**, and **[ Apply & Close ]** / **[ Done ]**.
- **Multi-Server Badge Sync**:
  - Show active server count: e.g. `MCP: 2 Active (wedplanai-prod, nse-bhavcopy)`.
  - Checkbox toggles next to each server in the popover.

### Workstream 4: Global Light & Dark Theme Engine + Appearance Customizer
- **Theme Engine Architecture**:
  - In `savazai-console/src/app/layout.tsx`:
    - Add inline anti-flicker script to read `savazai_theme_mode` from localStorage (defaults to dark or system).
    - Set `<html class="dark">` or `<html class="light">`.
  - In `savazai-console/src/app/globals.css`:
    - Support `.light` mode tokens with pure white / soft cream backgrounds, dark slate text, crisp high-contrast borders (`#e2e8f0`), and solid card backgrounds (`#ffffff`, `#f8fafc`).
    - Support `.dark` mode tokens with onyx / slate surfaces.
  - In `savazai-console/src/components/sidebar.tsx` and top navigation:
    - Add Theme Quick-Toggle (Sun / Moon icon).
  - In `savazai-console/src/components/settings-dashboard.tsx`:
    - In Appearance tab:
      - Theme Mode: `System Default` | `Dark Mode` | `Light Mode`.
      - Typography / Font Family: `Modern Sans (Inter)`, `Roboto (Google Clean)`, `Geist Sans`, `Fira Code (Monospace)`.
      - Font Size Scale: `Compact (14px)`, `Default (16px)`, `Large (18px)`.
      - Brand Accent Color: Preset palette (Indigo, Amber, Emerald, Sky, Rose) + Custom Hex.
      - Canvas Background Shades: Onyx, Slate, Midnight / Pure White, Neutral Gray, Soft Cream.

### Workstream 5: Universal Markdown WYSIWYG Editor Component
- **Component Design (`savazai-console/src/components/shared/markdown-editor.tsx`)**:
  - Toolbar with formatting actions: H1, H2, H3, Bold, Italic, Strikethrough, Bullet List, Number List, Code Block, Blockquote, Table, Link, HR.
  - Mode selector: `[ Edit ]` | `[ Preview ]` | `[ Split View ]`.
  - Variable tag detection (e.g. `{weddingId}`) with distinct visual pill styling.
  - Seamless replacement in `agent-drawer.tsx` (System Directive Prompt Editor, Guardrails, Description), `skills-registry.tsx` (Skill code/prompt), and `okf-registry.tsx`.

### Workstream 6: Tabular Selector Overhaul for Tools & Knowledge
- **Component Design (`savazai-console/src/components/studio/tool-data-table.tsx`)**:
  - Search bar + Category filter pills (All, Native, MCP, Custom).
  - Bulk actions: "Enable All Filtered", "Disable All Filtered".
  - Columns: Toggle Switch, Tool Name & Server, Category Badge, Description, Parameters Summary, Status Badge (`Active` / `Disabled`).
  - Integrated into Agent Inspector (`agent-drawer.tsx` Native & Custom Tools, MCP Server Tools, Knowledge & RAG).

### Workstream 7: Business Center Agent-to-Skill & OKF Mapping Hub
- **Interactive Agent Assignment**:
  - In `savazai-console/src/components/business/skills-registry.tsx`:
    - Make `ACTIVE IN AGENTS` column badges clickable.
    - Render **"Assign to Agents"** modal displaying all available agents across published and draft Agentflows.
    - Checkbox list allowing operators to bind/unbind agents to the selected skill.
    - Persists updates directly to `agentflows` canvas definitions in the database via `/api/agentflows/[id]`.

### Workstream 8: Documentation Hub Overhaul
- Update `savazai-console/src/app/docs/page.tsx`:
  - Module 1: Zero-Trust Governance & Quarantined Approval Lifecycle.
  - Module 2: Agent Workspace Operations (Dual Execution Modes & System Trace).
  - Module 3: Capability Studio & Collapsible Agent Teams.
  - Module 4: Business Center Governance & Agent-Skill Assignment.
  - Module 5: Command Center & Multi-Transport MCP.
  - Module 6: Enterprise RBAC & 53-Permission Profiles Matrix.

### Workstream 9: Product Landing Page Synchronization
- Update `savazai-console/src/app/page.tsx`:
  - Hero with Agentflows & LangGraph orchestration.
  - Collapsible Agent Teams & visual bus routing.
  - Universal MCP connectivity (e.g. NSE India financial tools).
  - Zero-Trust RBAC & granular 53-permission matrix.
  - Full Dark/Light theme adaptability.

---

## 2. File Change Plan

| File | Changes |
| :--- | :--- |
| `savazai-console/src/components/system-trace.tsx` | Add collapsible floating tab, right dock toggle, localStorage persistence |
| `savazai-console/src/components/chat-workspace.tsx` | Chunk stream deduplication, dynamic accumulator, MCP click-outside, multi-select badges |
| `savazai-console/src/app/api/chat/threads/[threadId]/route.ts` | Query `agentflow_thread_memory`, return 200 with empty messages instead of 404 |
| `savazai-console/src/app/api/chat/route.ts` | Persist Direct MCP turns to `agentflow_thread_memory` and load history |
| `savazai-console/src/app/layout.tsx` & `globals.css` | Light/Dark theme tokens, high-contrast styles, anti-flicker script |
| `savazai-console/src/components/sidebar.tsx` | Add Theme Quick Toggle button, handle thread activation gracefully |
| `savazai-console/src/components/settings-dashboard.tsx` | Appearance customizer (theme mode, font family, font size, accent color, background) |
| `savazai-console/src/components/shared/markdown-editor.tsx` | New rich dual-mode WYSIWYG Markdown editor component |
| `savazai-console/src/components/studio/agent-drawer.tsx` | Replace raw textarea with `MarkdownEditor`, replace card stacks with `ToolDataTable` |
| `savazai-console/src/components/studio/tool-data-table.tsx` | New tabular tool selector with search, filters, bulk toggle |
| `savazai-console/src/components/business/skills-registry.tsx` | Clickable `ACTIVE IN AGENTS` badge, "Assign to Agents" modal |
| `savazai-console/src/app/docs/page.tsx` | Comprehensive updates to all 6 modules reflecting latest architecture |
| `savazai-console/src/app/page.tsx` | Landing page copy and theme styling updates |

---

## 3. Verification Sequence
1. `npx tsc --noEmit`
2. `cd savazai-console && npm run build && cd ..`
3. `graphify update .`
4. Container restart & live browser testing.
