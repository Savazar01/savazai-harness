# DEVPLAN PROMPT: Unify Agent Workspace with Capability Studio Engine for Published Agentflows & Render Plan-First HITL Approvals

## Problem Statement & Context
When running published agentflows (such as "Wedding Planning with Local Search") in Agent Workspace (`/dashboard`), queries like:
- `"Provide list of guests for my wedding and the RSVP Status"`
- `"Add a new Guest named Rosemary for my wedding"`

stall or freeze with an empty assistant bubble.

### Live UI & Screenshot Analysis
1. **Capability Studio (`/studio`) Works**:
   - `image_a906d7.png`: Submitting `"Provide list of guests for my wedding and the RSVP Status"` triggers the Human-in-the-Loop (HITL) Plan-First approval card with step details, parameters, and action buttons (`Approve & Execute Plan`, `Adjust & Re-Plan`, `Reject & Re-Plan`, `Submit Details & Execute`).
   - `image_a90a21.png`: The user clicks **"Approve & Execute Plan"**, execution resumes, and the guest table renders cleanly.
   - `image_a90e5d.png`: Adding a guest ("John Dude") also renders cleanly after approval.

2. **Agent Workspace (`/dashboard`) Freezes**:
   - `image_a90243.png`: Submitting the exact same query in Published Agentflows mode pauses. The System Trace logs:
     - `[NODE] Supervisor Node: Routing message through agent graph`
     - `[MASKING] PII Gateway Active`
   - No interactive Plan-First card or "Approve & Execute" action button is rendered in the chat window.
   - Because the stream pauses awaiting user approval (`PAUSED_AWAITING_HUMAN_APPROVAL`), and the UI was not handling or rendering the approval interface cleanly (or clearing the empty placeholder assistant message upon pause), the user is left with a blank, frozen chat bubble.

## Architectural Mandates
1. **Zero Duplicate Execution Logic**: Do NOT build a separate execution engine or redundant LLM routing logic for Agent Workspace. Published Agentflows in `/dashboard` must execute against the exact same engine pipeline (`/api/orchestrator/test/route.ts`) using the canvas definition loaded from the database.
2. **Unified HITL Plan-First Approval Protocol**:
   - Support `plan_approval_required` / `PAUSED_AWAITING_HUMAN_APPROVAL` in the chat workspace stream consumer.
   - Render the interactive Plan-First Approval Card with plan steps, clarification prompts, parameters, and the four standard action buttons:
     - `Approve & Execute Plan`
     - `Submit Details & Execute`
     - `Adjust & Re-Plan`
     - `Reject & Re-Plan`
   - Auto-populate feedback input from template fields and bracketed choices when clarification prompt is provided.
   - Remove empty placeholder assistant bubbles when pausing for approval.
3. **Resumption Dispatch**:
   - On approval or adjustment, dispatch the resumption payload back to the orchestrator with `{ resume: { approved: true, plan } }` or `{ resume: { approved: false, feedback } }`.
