# DEVPLAN PLAN: Unify Agent Workspace with Capability Studio Engine for Published Agentflows & Render Plan-First HITL Approvals

## Architecture Specification

### 1. Unified Execution Flow
```
User Prompt (Agent Workspace /dashboard)
    │
    ▼
fetch('/api/chat', { workflowId: '<uuid>', message: '...', resume?: ... })
    │
    ├── workflowId matches UUID regex -> NextRequest forwarded directly to orchestratorTestPOST
    │       │
    │       ▼
    │   Load Agentflow from DB (CanvasDefinition)
    │   Apply Compliance Masking (PII Gateway)
    │   Supervisor Formulation -> Plan-First Evaluation
    │       │
    │       ├── Needs Approval / Plan-First Mode:
    │       │     Returns JSON: { status: "PAUSED_AWAITING_HUMAN_APPROVAL", executionPlan, planSummary, clarificationPrompt }
    │       │
    │       └── Approved (resume.approved === true):
    │             Execute Teams / Workers -> MCP Tools (Dynamic Context Resolution)
    │             Synthesizer Node -> Live Streaming SSE / NDJSON
    │
    ▼
Client Stream Handler (`streamFromBackend` in `src/lib/stream-client.ts`)
    │
    ├── Checks `res.headers.get("Content-Type")?.includes("application/json")`
    │   Parses `PAUSED_AWAITING_HUMAN_APPROVAL`
    │   Emits `type: "interrupt"` with `plan`, `planSummary`, `clarificationPrompt`, `status`
    │
    ▼
ChatWorkspace (`src/components/chat-workspace.tsx`)
    │
    ├── Populates `pendingInterrupt` with plan, summary, clarification
    ├── Auto-populates `feedbackInput` with template fields and bracketed choices
    ├── Removes empty placeholder assistant bubble so chat doesn't look stalled
    ├── Renders Interactive Plan-First Approval Card (matching Capability Studio)
    │     ├── Step list (node, action verb, target, parameters, warnings)
    │     ├── Plan summary / clarification prompt
    │     ├── Parameters textarea with Ctrl+Enter shortcut
    │     └── Action buttons:
    │           - "✓ Approve & Execute Plan"
    │           - "✨ Submit Details & Execute"
    │           - "📝 Adjust & Re-Plan"
    │           - "❌ Reject & Re-Plan"
    │
    └── On Click: Dispatches `executeStream(null, { approved, plan, feedback })`
```

### 2. File Change Breakdown
1. `savazai-console/src/lib/stream-client.ts`:
   - Enhance non-streaming JSON response inspection. When `/api/chat` returns an `application/json` payload (which happens when `orchestratorTestPOST` immediately returns HTTP 200 with `PAUSED_AWAITING_HUMAN_APPROVAL` before streaming begins), parse the JSON directly and emit the `interrupt` event, rather than only relying on chunked stream line splitting.
   - Also preserve the streaming SSE `data: {"type": "hitl", ...}` and `data: {"status": "PAUSED_AWAITING_HUMAN_APPROVAL", ...}` handling.
2. `savazai-console/src/components/chat-workspace.tsx`:
   - Extend `pendingInterrupt` state interface to include `planSummary?: string | null` and `clarificationPrompt?: string | null`.
   - In `executeStream`, when `event.type === "interrupt"`:
     - Set `pendingInterrupt` with `plan`, `planSummary`, `clarificationPrompt`.
     - Remove the empty placeholder assistant bubble (`content === ""`) if present so the chat view is clean.
     - Auto-populate `feedbackInput` from `clarificationPrompt` lines (template fields, bracketed choices).
   - Add full action button handlers matching Capability Studio:
     - `handleApproveExecute`: resume with `{ approved: true, plan }`
     - `handleRejectReplan`: resume with `{ approved: false, feedback: "REJECT & REPLAN: ..." }`
     - `handleEditReplan`: resume with `{ approved: false, feedback: "REPLAN CLARIFICATION: ..." }`
     - `handleSendFeedback`: resume with `{ approved: true, plan, feedback }`
   - Upgrade Plan Approval Card rendering to match the rich design in Capability Studio (`test-sandbox.tsx`).
3. Zero Hardcoding Verification:
   - Ensure all parameters, actions, and entities remain dynamic and schema-driven.
4. Quality Gates:
   - `npx tsc --noEmit`
   - `cd savazai-console && npm run build`
   - `graphify update .`
   - Test read and mutation flows against `wedplanai-prod` via docker.
