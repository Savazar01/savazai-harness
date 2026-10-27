# DEVPLAN WALKTHROUGH: Unify Agent Workspace with Capability Studio Engine for Published Agentflows & Render Plan-First HITL Approvals

## Executive Summary
This walkthrough documents the resolution for the Agent Workspace flow execution freeze when running published agentflows (such as "Wedding Planning with Local Search"). 

### Root Cause Verified
1. When running published agentflows under Plan-First mode (`executionMode === "plan_first"` or default), the supervisor formulates an execution plan and halts at the HITL boundary (`status: "PAUSED_AWAITING_HUMAN_APPROVAL"`).
2. The endpoint `/api/chat` immediately returned the JSON payload `{ status: "PAUSED_AWAITING_HUMAN_APPROVAL", executionPlan, planSummary, clarificationPrompt }`.
3. In `stream-client.ts`, non-streaming JSON responses were not parsed prior to body reader invocation, and `chat-workspace.tsx` lacked the full interactive HITL Plan-First Approval Card (including `planSummary`, `clarificationPrompt` parsing, and action buttons). As a result, the UI displayed a blank assistant bubble while waiting for an approval button click that was never rendered.

---

## Changes Implemented

### 1. `savazai-console/src/lib/stream-client.ts`
- **Enriched `StreamEvent` interface**: Added `planSummary?: string | null` and `clarificationPrompt?: string | null` to the `interrupt` event object.
- **Immediate JSON Response Detection**: Checked `response.headers.get("content-type")?.includes("application/json")` before streaming reader initialization. When `PAUSED_AWAITING_HUMAN_APPROVAL` is received, immediately invokes `onEvent({ type: "interrupt", ... })` and returns cleanly.

### 2. `savazai-console/src/components/chat-workspace.tsx`
- **Updated `pendingInterrupt` State**:
  ```typescript
  const [pendingInterrupt, setPendingInterrupt] = useState<{
    node: string;
    plan: PlanItem[];
    status: string;
    planSummary?: string | null;
    clarificationPrompt?: string | null;
  } | null>(null);
  ```
- **Interrupt Handling & Auto-Population**:
  - Populates `planSummary` and `clarificationPrompt`.
  - Automatically parses template fields and bracketed choices from `clarificationPrompt` into `feedbackInput` (e.g. `Name: Rosemary`, `Rsvp Status: [attending]`).
  - Removes the blank assistant placeholder message upon interrupt so the chat does not look stalled.
- **Comprehensive Plan Approval Card UI**:
  - Step breakdown with target nodes, action verbs, target entities, parameters, and warnings.
  - Implementation strategy summary (`planSummary`).
  - Clarification warning banner with monospace template.
  - Interactive parameters adjustment textarea with `Ctrl+Enter` shortcut.
  - 4 action buttons:
    - `❌ Reject & Re-Plan` (`handleRejectReplan`)
    - `📝 Adjust & Re-Plan` (`handleEditReplan`)
    - `✨ Submit Details & Execute` (`handleSendFeedback`)
    - `✓ Approve & Execute Plan` (`handleApproveExecute`)

### 3. `savazai-console/src/components/chat-message.tsx`
- Added distinct styling for `role === "system"` messages to display resumption and re-planning status notifications cleanly as system banners rather than assistant messages.

### 4. Documentation
- Updated `AGENTS.md` (Section 11.C: Client-Side HITL Plan-First Approval Card & Resumption Protocol).
- Updated `README.md` (Unified Plan-First HITL Approval Card).

---

## Verification & Test Proofs

### 1. Read Flow Test (Guest List RSVP Status)
**Request**: `"Provide list of guests for my wedding and the RSVP Status"` against published agentflow `c845b1ae-1352-4a4e-95e6-3d2f41de2948`:
- **Initial Request**:
  ```json
  {
    "status": "PAUSED_AWAITING_HUMAN_APPROVAL",
    "executionPlan": [{ "targetNode": "Wedding Guest Worker", "actionVerb": "LIST" }],
    "planSummary": "### 📋 Proposed Execution Plan..."
  }
  ```
- **Resume Dispatch**:
  ```json
  {
    "workflowId": "c845b1ae-1352-4a4e-95e6-3d2f41de2948",
    "resume": { "approved": true, "plan": [...] }
  }
  ```
- **Execution Proof**: HTTP 200 `text/event-stream` received, guest records ("Karan Johar", "Rohan Malhotra", "Amit Sharma", etc.) retrieved from live WedPlanAI MCP and synthesized into markdown table.

### 2. Mutation Flow Test (Add Guest "Rosemary")
**Request**: `"Add a new Guest named Rosemary for my wedding"`
- **Initial Request**: Paused with Plan-First clarification card detailing required fields (`Name`, `Rsvp Status`, `Plus One Count`, etc.).
- **Resume with Parameters**:
  ```json
  {
    "workflowId": "c845b1ae-1352-4a4e-95e6-3d2f41de2948",
    "resume": {
      "approved": true,
      "plan": [{ "targetNode": "Wedding Guest Worker", "actionVerb": "CREATE", "parameters": { "name": "Rosemary" } }],
      "feedback": "Name: Rosemary\nRsvp Status: attending"
    }
  }
  ```
- **Execution Proof**: HTTP 200 stream completed, `create_guest` invoked with automatic `weddingId` context resolution, and confirmation synthesized.

### 3. Quality Gates
```bash
# Typecheck
npx tsc --noEmit (Exit code 0)

# Build
cd savazai-console && npm run build (Exit code 0, 28/28 routes compiled)

# Knowledge Graph Sync
graphify update . (Rebuilt 5316 nodes, 6858 edges)

# Containers Healthy
docker compose ps:
savazai-backend: Up (healthy)
savazai-console: Up (healthy)
savazai-db: Up (healthy)
```
