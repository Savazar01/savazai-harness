# DEVPLAN WALKTHROUGH: Fix Agent Workspace Flow Execution (NOT_FOUND Tool Dumps) and Auto-Resolve Technical Context (Wedding ID) in Guest Creation

## 1. Summary of Changes

This task addressed two key functional bugs highlighted in user screenshots:

1. **Issue A (Agent Workspace Flow Execution Leaked `NOT_FOUND` & Internal Dumps)**:
   - When executing published agentflows (e.g. `"Wedding Planning with Local Search"`), `/api/chat` was bypassing the live LangGraph/MCP pipeline and routing to a stub backend compiler (`src/core/compiler.ts`) with empty tool registries, outputting `NOT_FOUND` for all tools and dumping raw prompt templates into the chat bubble.
   - **Resolution**:
     - `savazai-console/src/app/api/chat/route.ts`: Updated to unify published agentflow execution with Capability Studio's robust pipeline (`/api/orchestrator/test/route.ts`).
     - `savazai-console/src/app/api/orchestrator/test/route.ts`: Added dynamic canvas definition lookup from the database when `workflowId` or `agentflowId` is provided.
     - `savazai-console/src/components/chat-workspace.tsx` & `src/lib/stream-client.ts`: Sanitized the event stream so node transitions, PII audits, and traces (`event.type === "trace"`) route cleanly into the **System Trace** sidebar rather than leaking into the chat message bubble.

2. **Issue B (Manual `Wedding:` Technical UUID in Guest Creation HITL Card)**:
   - In Capability Studio, asking to create or invite a guest triggered a Plan-First HITL parameter card with a blank `Wedding:` input field, requiring the user to know and provide internal database UUIDs.
   - **Resolution**:
     - `savazai-console/src/app/api/orchestrator/test/route.ts` (`buildClarificationFromSchema`): Enhanced `isPrimaryScopeSystemId` so root context keys ending with `Id` (such as `weddingId`, `tenantId`, etc.) or keys that match available getter tools (`get_<entity>`) are recognized as system-resolved and omitted from user-facing questionnaires.
     - `autoResolveMissingSystemIds`: Upgraded to support single-object root getters (such as `get_wedding` returning `{ id: "...", partnerA: "Rahul", ... }` in addition to array getters). Wired directly into the worker MCP tool execution loop right before `runMcpToolWithResilience`.
     - Injected generic system prompt instructions directing workers to resolve missing root context via assigned getters (`get_<entity>`) without hardcoding any domain terms.

---

## 2. File Change Details

| File | Nature of Change |
| :--- | :--- |
| `savazai-console/src/app/api/chat/route.ts` | Delegates published agentflow chat requests directly to `orchestratorTestPOST`, passing `workflowId`, `message`, `threadId`, `executionMode`, and parsed plan approvals (`resume`). |
| `savazai-console/src/app/api/orchestrator/test/route.ts` | 1) Dynamic canvas definition DB fallback for `workflowId`/`agentflowId`; 2) Generic `isPrimaryScopeSystemId` filter for HITL forms; 3) Upgraded `autoResolveMissingSystemIds` with single-object getter extraction and wired into tool execution loop; 4) Generic context resolution prompt directives. |
| `savazai-console/src/components/chat-workspace.tsx` | Sanitized SSE handling to route `trace`, `audit`, and internal transitions to System Trace sidebar and keep chat bubble clean. |
| `savazai-console/src/lib/stream-client.ts` | Added `PAUSED_AWAITING_HUMAN_APPROVAL` interrupt event mapping. |
| `src/core/compiler.ts` | Cleaned up fallback synthesizer and worker handlers to prevent leaking raw debug dumps. |
| `AGENTS.md` | Documented Section 11: Unified Execution Engine & Automated Technical Context Resolution. |
| `README.md` | Documented automated context resolution and unified execution pipeline. |

---

## 3. End-to-End Verification Evidence

### Test 1: Capability Studio Plan-First HITL Form (Issue B)
- **Request**:
  ```json
  POST http://localhost:3056/api/orchestrator/test
  {
    "workflowId": "c845b1ae-1352-4a4e-95e6-3d2f41de2948",
    "message": "Add a new Guest named Rosemary with email rosemary@example.com for my wedding",
    "executionMode": "plan_first"
  }
  ```
- **Response**:
  ```json
  {
    "status": "PAUSED_AWAITING_HUMAN_APPROVAL",
    "executionPlan": [{
      "nodeId": "node-worker-ab232f7a-f158-4b17-9d02-75cb1b01e700",
      "targetNode": "Wedding Guest Worker",
      "actionVerb": "CLARIFY",
      "allowedVerbs": ["CLARIFY", "CREATE"],
      "targetEntity": "Wedding Guest Worker",
      "requiresClarification": true,
      "clarificationPrompt": "To complete your request for Wedding Guest, please provide the following details:\n\n• Name [REQUIRED] (Full name of the guest)\n• Email [OPTIONAL] (Email address)\n• Phone [OPTIONAL] (Phone number)\n• Rsvp Status [OPTIONAL] [Keep one: pending / attending / declined / partial] (RSVP response status)\n• Plus One Count [OPTIONAL] (Number of plus-ones allowed/attending)\n• Dietary Restrictions [OPTIONAL] (Any dietary restrictions)\n• Invited Ceremonies [OPTIONAL] [e.g. 'all' or comma-separated IDs]"
    }]
  }
  ```
- **Result**: `Wedding:` blank field is completely removed. Only human domain attributes are requested.

### Test 2: Execution with Auto-Resolved Context
- **Execution**: Approved plan dispatched to `create_guest` with `{ name: "Rosemary", email: "rosemary@example.com", rsvpStatus: "pending" }`.
- **Server Trace**:
  ```text
  [Auto-Resolution] Resolved weddingId -> UUID "be5badd9-0cb2-4d5d-9acf-2412406b9cae" via assigned tool "get_wedding"
  [MCP Tool Execute] Calling tool "create_guest" with arguments: {
    "weddingId": "be5badd9-0cb2-4d5d-9acf-2412406b9cae",
    "name": "Rosemary",
    "email": "rosemary@example.com",
    "rsvpStatus": "pending"
  }
  [MCP RESPONSE]: tool=create_guest ...
  ```
- **Synthesizer Markdown Output**:
  ```text
  A new guest, Rosemary, was successfully added to the guest list.
  ```

### Test 3: Agent Workspace Flow Execution (Issue A)
- **Request**:
  ```json
  POST http://localhost:3056/api/chat
  {
    "workflowId": "c845b1ae-1352-4a4e-95e6-3d2f41de2948",
    "message": "Provide list of Guests with RSVP Status for my wedding",
    "executionMode": "direct"
  }
  ```
- **Verification**:
  - `Contains NOT_FOUND: false`
  - `Contains Aggregated prompt debug dump: false`
  - Total SSE stream length: 5,314 chars
  - Clean markdown table output listing all active guests and RSVP statuses streamed to client.

---

## 4. Quality Gates Checklist

- [x] `npx tsc --noEmit` executed with 0 errors.
- [x] `cd savazai-console && npm run build` completed successfully with standalone output.
- [x] `graphify update .` completed with code 0 (5,304 nodes, 6,848 edges, 447 communities).
- [x] `docker compose up --build -d` recreated and started all services (`savazai-backend`, `savazai-console`, `savazai-db`).
- [x] `docker compose ps` shows all containers healthy.
- [x] Zero domain-specific hardcoding in engine core; generic schema-driven context resolution verified.
