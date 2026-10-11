# DEVPLAN TASK SPECIFICATION: Fix Agent Workspace Flow Execution (NOT_FOUND Tool Dumps) and Auto-Resolve Technical Context (Wedding ID) in Guest Creation

## 1. Problem Statement & Incoming Evidence

### Issue A: Agent Workspace Flow Execution Emits Raw Tool Dumps & `NOT_FOUND` Strings (Screenshots 1 & 2)
- **User Prompt**: `"Add a new Guest for my wedding"` or `"Provide list of Guests with RSVP Status for my wedding"` in Published Agentflows mode.
- **Observed Behavior**: The chat output displays raw internal prompt dumps:
  ```text
  db-query: NOT_FOUND | get_wedding: NOT_FOUND | create_wedding: NOT_FOUND | update_wedding: NOT_FOUND [Synthesizer:Synthesizer Agent] Aggregated 10 sub-agent outputs | Prompt: "## Role & Goal You are the Master Synthesizer Agent..." [node-worker-...]: [Supervisor:...]
  ```
- **Root Cause**:
  1. In the Agent Workspace execution route (`/api/chat`), when executing a published agentflow, the request was proxied to the backend (`${BACKEND_URL}/api/graph/invoke/stream` on port 3055), which invoked `compileCanvasToGraph` (`src/core/compiler.ts`).
  2. In `src/core/compiler.ts`, `compileCanvasToGraph` used a stub `ToolRegistry` with no MCP client connections or credentials, producing `${toolRef.name}: NOT_FOUND` for all tools.
  3. The synthesizer handler in `src/core/compiler.ts` was an un-sanitized string template that concatenated the raw sub-agent outputs and prompt text into the stream.
  4. In `savazai-console/src/components/chat-workspace.tsx`, trace events were leaking into the assistant message stream if they contained content fields.

### Issue B: "Create a Guest" Requires Manual/Technical `Wedding Id` from End User (Screenshot 3)
- **User Prompt**: Add a new guest in Capability Studio.
- **Observed Behavior**: The HITL parameter card in Test Playground displayed:
  ```text
  Wedding: 
  Name: Rosemary
  Email: rosemary@example.com
  Phone: +11233567891
  Rsvp Status: pending
  Plus One Count: 2
  Dietary Restrictions: 
  Invited Ceremonies: Mehendi
  ```
  The `Wedding:` field was blank and editable, blocking or expecting the user to manually enter an internal UUID.
- **Root Cause**:
  1. In `buildClarificationFromSchema` (`savazai-console/src/app/api/orchestrator/test/route.ts`), `isPrimaryScopeSystemId` only checked a restricted list of substrings (`tenant`, `workspace`, `organization`, `scope`, `app`, `project`), omitting `weddingId` or any dynamic root context key ending with `Id`.
  2. `weddingId` had `Id` stripped, rendering as `Wedding:` in the parameter questionnaire.
  3. `autoResolveMissingSystemIds` had code to resolve foreign entity IDs, but it was never invoked prior to MCP tool execution in the worker loop.
  4. Furthermore, `autoResolveMissingSystemIds` expected `refList` from query tools to be an `Array`, but root entity getters like `get_wedding` return a single JSON object `{ id: "...", ... }`.

## 2. Requirements & Constraints
- **Application Purity & Decoupling (AGENTS.md Mandate)**: No hardcoding domain-specific fields or tools (`wedding`, `ceremony`, `list_tasks`) in core engine files. All context resolution must be dynamic, generic, and schema-driven.
- **System Prompt / Instruction-Driven Actions**: Direct workers via generic system prompts and instructions on how to resolve root context via assigned getters (such as `get_<entity>`) prior to mutating actions.
- **Unified Execution**: Agent Workspace must execute published agentflows using the exact same robust execution pipeline as Capability Studio (`/api/orchestrator/test/route.ts`).
- **Stream Sanitization**: System traces, node transitions, and raw MCP receipts belong strictly in the System Trace sidebar; only final markdown is streamed to the chat bubble.
