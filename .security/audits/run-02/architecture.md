# Architecture & Attack Surface Map (Audit Run-02)

## 1. System Overview
SavazAI is a sovereign, multi-agent orchestration operating system and enterprise console. It operates across two primary execution tiers:
1. **SavazAI Backend Orchestrator (`src/`)**: Node.js, Express (Port 3055), LangGraph stateful graph execution, Drizzle ORM, pgvector PostgreSQL 17, and isolated Python sub-runners.
2. **SavazAI Console (`savazai-console/src/`)**: Next.js 16 App Router (Port 3056), React 19, Better-Auth, 53-permission RBAC engine, Cloudflare Turnstile bot defense, Universal MCP Aggregator, and Outbound SMTP Transactional Mailer.

## 2. Entrypoints & Surface Analysis
- **Public & Edge Gateways**:
  - `POST /api/demo-request` - Public enterprise demo access requests (guarded by Cloudflare Turnstile / reCAPTCHA and unforgeable `cf-connecting-ip`).
  - `GET /auth/invite/onboard` & `POST /api/auth/invite/verify` - Obfuscated, cryptographic token-gated onboarding entrypoint.
  - `POST /api/auth/otp/send` - 6-digit email OTP generation and dispatch.
  - `POST /api/auth/access-request` - Quarantined onboarding request submission (requires validated `inviteToken` + 6-digit OTP).
  - `POST /api/auth/[...all]` - Better-Auth authentication endpoints (`disableSignUp: true`, strict status quarantine checks).
- **Authenticated Console API Routes (RBAC Protected)**:
  - `GET/POST /api/admin/users`, `PATCH/DELETE /api/admin/users/[id]` - User management, status updates, role assignments (`user_admin`).
  - `GET/POST/PUT/DELETE /api/admin/roles` - Custom role creation and permission matrix management (`user_admin`).
  - `POST /api/admin/invitations` - Cryptographic onboarding token generation and automated mail dispatch (`user_admin: approve_users`).
  - `POST /api/admin/system/test-email` - Outbound SMTP pre-flight handshake verification (`command_center: system_admin_manage`).
  - `GET/POST /api/agentflows`, `GET/PATCH/DELETE /api/agentflows/[id]` - Visual canvas workflow authoring and publishing (`capability_studio`).
  - `POST /api/chat` & `GET /api/chat/threads/[id]` - Agent Workspace multi-agent streaming and execution history (`agent_workspace`).
  - `GET/POST /api/mcp` - Universal MCP tool aggregation, catalog inspection, and JSON-RPC dispatch.
  - `GET /api/tools/registered` - Dynamic tool registry discovery for Studio and Workspace.
- **Backend Orchestrator Endpoints (`src/index.ts` on Port 3055)**:
  - `GET /health` - Liveness health probe.
  - `POST /api/graph/invoke` & `POST /api/graph/invoke/stream` - LangGraph compiled multi-agent pipeline execution.
  - `GET /api/tools/registered` - Backend registered native tool discovery.
  - `GET /api/settings` - LLM provider configurations.
  - `GET/POST/PUT/DELETE /api/agentflows` - Underlying agentflows persistence.

## 3. Trust Boundaries
- **Edge to Console**: Browser traffic crossing Cloudflare reverse proxy. Client IP resolved via `cf-connecting-ip` with fail-closed Turnstile verification.
- **Console Session Boundary**: Authenticated sessions managed via HttpOnly, SameSite cookies validated against database ground truth (`status = 'ACTIVE'`, `mustResetPassword = false`, effective permissions).
- **Console to Backend Orchestrator**: Service-to-service communication across Docker container network (`savazai-backend:3055`). Requires internal secret header (`x-internal-secret: MASTER_VAULT_SECRET`).
- **Engine to Database**: Parameterized Drizzle ORM and `pg.Pool` connection pool (`savazai-db:5432`) with pgvector extensions.
- **Engine to Remote MCP Endpoints**: Outbound JSON-RPC 2.0 calls over streamable HTTP, SSE, and stdio with encrypted Bearer tokens.
- **Engine to Python Runner**: Local child process runner (`python3`) executing within isolated virtual environment boundaries.

## 4. Prior Audit Findings & Current Run Target Gaps
- **Run-01 Baseline**: Resolved raw SQL query injection in `postgres_query_tool`, SSRF in custom webhook tools, unauthenticated compliance policy mutation, and basic script path traversal.
- **Run-02 Focus**:
  1. Backend orchestrator direct endpoint perimeter security (`src/index.ts`).
  2. Strict path normalization in Python runner sandbox (`src/utils/python-runner.ts`).
  3. Session invalidation upon credential modification (`api/auth/change-password`, `api/admin/users/[id]`).
  4. Credential exposure mitigation in application logs (`savazai-console/src/lib/auth/otp.ts`).
  5. Cryptographic master key enforcement in production environments (`savazai-console/src/lib/crypto.ts`).
  6. Immutability guarantees for system predefined roles in RBAC matrix (`api/admin/roles`).
