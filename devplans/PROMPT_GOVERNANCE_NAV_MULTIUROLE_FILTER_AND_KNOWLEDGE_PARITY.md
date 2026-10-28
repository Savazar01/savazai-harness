# PROMPT: Governance Hub Navigation Overhaul, Multi-Role Filter Fix, Default List Views & Unified Knowledge Tab Architecture

## Executive Summary & Defect Diagnosis
Based on user feedback and visual evidence (`image_8c05ff.jpg`, `image_8bff35.jpg`, `image_8bfafe.png`, `image_8bf776.jpg`, `image_8ba504.jpg`, `image_8ba0c9.jpg`), four key UX/UI defects and architectural gaps must be addressed:

### 1. Governance Hub Tab Wrapping & Overflow Breakdown (`image_8c05ff.jpg`)
- Having 9 separate report tabs in a single horizontal strip forces overflow items (`Skills & OKF Versions`, `System Prompt Versions`) onto a second line, breaking layout symmetry, pushing down table controls, and becoming difficult to click or access cleanly.
- **Requirement**: Replace the unwieldy single-row tab strip with a scalable, enterprise-grade navigation pattern: an internal secondary sub-navigation rail (collapsible/left-hand sub-menu) or structured categorized report selector grouping reports by domain:
  - *Analytics & Controls*: Overview Dashboard, Alerting Rules
  - *Operational Audit Ledgers*: User Admin, Command Center, Business Center, Agentflows, Agents Telemetry
  - *Asset Version Control*: Skills & OKF Versions, System Prompt Versions

### 2. Multi-Role User Directory Filter Failure (`image_8bff35.jpg` & `image_8bfafe.png`)
- In `image_8bff35.jpg`, clicking the assigned operator pill (e.g., `1 Users Assigned` for Auditor) redirects to the Active Users Directory (`image_8bfafe.png`).
- In `image_8bfafe.png`, the directory applies `Filter Profile: Auditor` but displays **"No active users matching criteria"**.
- **Root Cause**: Filter logic performs an exact scalar match (`u.roleId === roleFilter`), completely ignoring users who have `Auditor` included in `user.roleIds` or `user.roleNames` or `user.roles` multi-role arrays.
- **Requirement**: Default the "Roles & Access Profiles" view to **List View**. Fix the User Directory filter predicate so it checks if the selected role is included in `user.roleIds`, `user.roleNames`, and `user.roles` (handling single-role strings and multi-role arrays).

### 3. Agent Catalog & Builder Hub Default View (`image_8bf776.jpg`)
- Loading the Agent Catalog & Builder Hub currently defaults to the Grid/Tile view instead of List View.
- **Requirement**: Set **List View** as the permanent default view for the Agent Catalog & Builder Hub, and persist operator preference in `localStorage`.

### 4. Agent Inspector Dialog Dimensions & Knowledge Tab UX Parity (`image_8ba504.jpg` vs `image_8ba0c9.jpg`)
- **Dialog Dimensions**: Launching the Agent Inspector opens in condensed format (`max-w-xl`), requiring the user to manually click the expand icon. It must open in full/expanded view (`max-w-5xl` / `max-w-6xl`) by default.
- **Knowledge Tab Disparity**: In `image_8ba504.jpg`, the Knowledge tab uses plain, unstyled card lists with minimal interaction. In contrast, the MCP Servers tab (`image_8ba0c9.jpg`) features a crisp table layout with toggles, server pills, search bar, descriptions, and active status badges.
- **Requirement**: Redesign the Knowledge tab to mirror the exact structure of the MCP Servers tab: structured data tables for both Universal Skills and OKF Concepts, featuring category badges, search/filter inputs, descriptions, and high-contrast toggle switches to bind/unbind assets to the agent.
