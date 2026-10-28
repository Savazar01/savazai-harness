# PROMPT: Precise Audit Diff Tracking, Governance Analytics & Alerting Engine, Agent Builder Dual-View Modes, RBAC Authorization Matrix Segregation, and Platform Documentation Sweep

## 1. Problem Statement & Incoming Evidence

Based on user inspection and screenshots (`image_8ddb5a.jpg` through `image_8d6e25.jpg`), five core architectural deficiencies must be resolved:

1. **Misattributed & Generic Audit Logs (`image_8ddb5a.jpg`, `image_8dd797.png`, `image_8dd419.jpg`, `image_8dd0b9.jpg`)**:
   - When updating LLM Providers in Command Center (e.g., enabling OpenAI model `gpt-5-nano`), the Governance ledger logs an irrelevant `ORGANIZATIONAL_DATA_UPDATED` entry pointing to `country: "US", companyName: ""` alongside a generic `SETTINGS_UPDATED` entry.
   - Clicking `[ <> Details ]` on `SETTINGS_UPDATED` simply dumps the entire list of configuration keys without showing the actual field mutation (New vs. Old values).
   - Root Cause: Monolithic save handler in Command Center writes the entire form payload to `system_configurations`, triggering all change listeners simultaneously without calculating key-level delta diffs.

2. **Missing Governance Dashboard & Alerting Engine**:
   - The Governance Hub is currently only a raw list of table tabs without an executive overview dashboard or proactive alerting mechanism.
   - Requirement: An executive Governance Dashboard featuring aggregated KPI cards, trend charts, customizable filters (date range, module, actor, severity), and an Alerting Engine allowing administrators to configure automated email alerts for critical events (e.g. model toggled, user permission elevated, API key updated, PII threshold breached) using dynamic SMTP templates.

3. **Agent Builder Hub Display Limitations (`image_8d7624.jpg`)**:
   - Agents are currently displayed strictly in a card/tile grid.
   - Enterprise operators require a Dual-View Switcher (`[ ⊞ Grid ]` / `[ ☰ List ]`) with a rich data table supporting sorting, filtering, bulk actions, and direct access to inspector actions.

4. **User Admin Roles & Authorization Matrix Architecture (`image_8d6e25.jpg`)**:
   - Capability Studio permission scope lacks explicit actions for the Agent Builder Hub (`agent_builder:view`, `agent_builder:create`, `agent_builder:edit`, `agent_builder:delete`, `agent_builder:lock`). Total permissions should expand from 63 to 68.
   - The 68-permission Authorization Matrix sits stacked directly under the role cards, making the page cluttered.
   - Roles need dual-view display (`[ Grid ]` / `[ List ]`), and every role must display its currently assigned active user count and member names with filter shortcuts.

5. **Platform Documentation Staleness**:
   - Platform documentation (`README.md`, `/docs` hub, and landing page) needs updating to cover Agent Builder Hub, Governance Ledger, System Admin extraction, and Dynamic Branding.
