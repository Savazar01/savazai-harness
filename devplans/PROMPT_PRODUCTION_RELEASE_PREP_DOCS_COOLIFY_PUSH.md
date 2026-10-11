# PROMPT: Production Release Preparation, Landing Page & Docs Update, Knowledge Base Sync, and Coolify Git Push

## 1. Context & Objectives
We are preparing the production release for SavazAI Business Harness platform. The release consolidates 4 major core enhancements:
1. **Agent Workspace Decoupling**:
   - Clean separation of **Published Agentflows** (compiled LangGraph multi-agent orchestration with Plan-First Human-in-the-Loop approval cards, step breakdowns, and adjustments) from **Direct MCP Chat** (direct conversational AI with function tool calling, no supervisor graph, zero dummy cards, zero domain prompt leaks).
2. **Universal Dynamic MCP Tool Discovery**:
   - Resilient discovery across `streamable-http`, `sse`, and `stdio` transports.
   - Live granular schema hydration (e.g. 21 tools for NSE Bhavcopy, 15 tools for CM Market).
   - Authoritative fallback catalogs eliminating fake single-tool summaries (`<serverId>_query` or fallback dummy strings).
   - Invariant protecting against caching empty tool sets on network blips.
   - `workspaceEnabled` visibility control ensuring internal tools stay in Capability Studio while customer/general tools appear in Agent Workspace.
3. **Domain Auto-Context Resolution**:
   - Complete elimination of technical UUID prompts (such as `weddingId`, `tenantId`, `workspaceId`) in HITL cards.
   - Automated runtime resolution via single-object and array getter tools (`get_<entity>`, `list_<entity>`) or ambient system parameters.
4. **Resilient Canvas Serialization & Quality Invariants**:
   - Dynamic Zod validation schemas supporting open string tool categories (`"custom"`, `"open"`, `"builtin"`, `"api"`, etc.) with safe fallbacks.
   - Permissive LLM model configurations on structural container nodes (e.g., Agent Teams).

## 2. Deliverables
1. **Landing Page (`/`)**:
   - Update `savazai-console/src/app/page.tsx` to showcase the unified architecture:
     - Agent Workspace with dual execution modes (Published Agentflows with Plan-First HITL vs Direct MCP Chat).
     - Universal Dynamic MCP Integration (`streamable-http`, `sse`, `stdio`, live granular schemas).
     - Automated Technical Context Resolution (Zero UUID prompts).
     - Open Tool Ecosystem & Custom Extensions.
2. **In-App Documentation (`/docs`)**:
   - Update `savazai-console/src/app/docs/page.tsx` with comprehensive operational guides:
     - Detailed breakdown of Published Agentflows vs Direct MCP Chat modes in Agent Workspace.
     - Guide to configuring and toggling MCP servers with `workspaceEnabled`.
     - Explanation of Plan-First HITL Approval Cards and 4 action buttons (`Approve & Execute`, `Submit Details`, `Adjust & Re-Plan`, `Reject & Re-Plan`).
     - Automated Context Resolution overview.
3. **Repository README (`README.md`)**:
   - Align architecture documentation, deployment instructions, environment variables, and feature matrix with Coolify production readiness.
4. **Knowledge Graph & Invariants**:
   - Run type checks (`npx tsc --noEmit`), build verification (`npm run build`).
   - Run `graphify update .` to synchronize knowledge graph.
   - Stage, commit, and push changes to GitHub (`origin/main`).
