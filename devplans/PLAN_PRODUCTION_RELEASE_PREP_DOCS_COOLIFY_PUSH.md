# PLAN: Production Release Preparation, Landing Page & Docs Update, Knowledge Base Sync, and Coolify Git Push

## 1. Scope of Changes
1. **Landing Page (`savazai-console/src/app/page.tsx`)**:
   - Modernize visual feature showcase to highlight:
     - **Dual Execution Engine in Agent Workspace**: Published Agentflows (LangGraph Supervisor multi-agent orchestration with Plan-First HITL cards) alongside Direct MCP Chat (direct tool-calling with zero prompt leaks).
     - **Dynamic Model Context Protocol (MCP) Integration**: Real-time tool discovery across `streamable-http`, `sse`, and `stdio` transports with granular tool hydration and workspace exposure switches (`workspaceEnabled`).
     - **Automated Technical Context Resolution**: Zero technical UUIDs or database IDs requested from users; smart single-object & array resolution before tool execution.
     - **Enterprise PII Gateway & Governance**: Zero-knowledge masking gateways, real-time telemetry ledger, and custom open-tool validation.

2. **In-App Documentation (`savazai-console/src/app/docs/page.tsx`)**:
   - Add/expand dedicated sections in Module 2 (Agent Workspace) and Module 3 (Capability Studio):
     - Section explaining **Execution Modes**: Mode 1 (Published Agentflows with Plan-First HITL Approval Cards, Parameter Submission, and Re-planning) vs Mode 2 (Direct MCP Chat with Function Calling).
     - Section on **MCP Server Management & Workspace Exposure**: Configuring transports, adding custom headers (e.g. for NSE / financial providers), and toggling the `workspaceEnabled` flag.
     - Section on **Context Resolution**: How the system automatically resolves target entity IDs without requiring UUIDs.

3. **Repository Documentation (`README.md`)**:
   - Update architecture diagrams and descriptions to accurately reflect the unified LangGraph orchestrator and direct MCP execution modes.
   - Document Coolify multi-container deployment instructions, environment variables, healthchecks, and production bootstrap steps.

4. **Verification & Deployment Gates**:
   - Root workspace verification: `npx tsc --noEmit`.
   - Console workspace verification: `npm run build` in `savazai-console`.
   - Knowledge base synchronization: `graphify update .`.
   - Git operations: Review git status, stage files, commit with descriptive conventional commit message, and push to `origin/main` for Coolify automated deployment.
