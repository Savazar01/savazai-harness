# TASK SPECIFICATION & AUDIT: Multi-Role User Assignment, Comprehensive Audit Logging, Dedicated Governance Hub, Dynamic SMTP Senders, User Master Merge Tags & Versioned Asset Tracking

---

## 1. Executive Summary & Defect Diagnosis

Based on the latest user requirements and visual evidence (`media_1793150502508_b3a17c5f.png`, `media_1793151269570_959443e9.png`, `media_1793151284656_ccf795a9.png`):

### 🔍 Identified Deficiencies & Scope:
1. **Multi-Role Assignment with Self-Escalation Safeguard (`media_1793150502508_b3a17c5f.png`)**:
   - The "Edit User Profile & Role" modal currently provides a single-select dropdown (`Assigned Role Profile`). Enterprise users require holding multiple roles (e.g., `Studio Flow Architect` + `Business Policy Manager`).
   - **Critical Security Constraint**: Operators holding the `User Administrator` role must **never** be permitted to modify or assign roles to their own account (preventing privilege escalation), but can manage roles for other users.
2. **Comprehensive User Administration Audit Trail**:
   - Every user management operation (assigning/revoking roles, processing invitation approvals, triggering password resets, quarantining, activating, and updating profiles) must be logged into a tamper-evident audit table with complete actor, target, timestamp, and diff snapshots.
3. **Dedicated "Governance" Hub in Primary Navigation**:
   - Introduce a new top-level sidebar module: **"Governance"** (`/admin/governance`), positioned immediately following `User Admin` and above the utility divider.
   - Gate access via a new dedicated permission family: `governance:view`, `governance:export_logs`, etc.
   - House 7 comprehensive, searchable audit reports within this hub:
     1. User Admin Tracking Report
     2. Command Center Tracking Report
     3. Business Center Tracking Report
     4. Agentflows Audit Report
     5. Agents Activity Log
     6. Universal Skills & Concepts Version Audit Report (with diff viewer)
     7. Agent System Prompt Version Audit Report (with prompt diff viewer)
4. **Dynamic SMTP Sender Identity & Zero-Hardcoding Mandate (`media_1793151284656_ccf795a9.png` & `media_1793151269570_959443e9.png`)**:
   - In System Admin $\rightarrow$ System Core $\rightarrow$ Email & SMTP Service, add explicit configuration inputs for **Sender Display Name** and **Sender Email Address (From / Reply-To)**.
   - Remove all hardcoded instances of `security@savazar.com` across template previews, SMTP transporter dispatches, and runtime notification hooks.
5. **User Master Data Merge Tags & Streamlined Tag Interface (`media_1793151269570_959443e9.png`)**:
   - Expand email merge tags to include User Master Data (`{{user_full_name}}`, `{{user_email}}`, `{{user_role}}`, `{{user_region}}`, `{{user_id}}`).
   - Group the pill tags into collapsible/tabbed categories (`⚡ Agentflow Execution`, `👤 User Master Data`, `🏢 Organization & Brand`) with a search filter input to eliminate modal clutter.
6. **Detailed Version Control & Audit Reports**:
   - Track revisions of Skill files and OKF guidelines with semantic versions, change logs, diffs, and actor metadata in `asset_revisions`.
   - Track every update to an Agent's System Directive Prompt in Capability Studio in `prompt_revisions`.
   - Implement an interactive diff comparison modal in the Governance Hub.

---

## 2. Evidence Mapping

- `media_1793150502508_b3a17c5f.png`: Single-select dropdown in "Edit User Profile & Role" requiring multi-role selection and self-assignment safeguards.
- `media_1793151284656_ccf795a9.png`: Email & SMTP Service in System Admin lacking Sender Display Name and Sender Email Address inputs.
- `media_1793151269570_959443e9.png`: Email Template editor showing hardcoded `SavazAI Platform <security@savazar.com>` in preview and sprawling flat merge tags list.
