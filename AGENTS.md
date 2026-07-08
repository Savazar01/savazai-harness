# CRITICAL RULES - SAVAZAI AGENT HARNESS ENGINEERING

## 0. SKILLS.SH ECOSYSTEM INTEGRATION

- This project is linked to the skills.sh ecosystem for domain-specific procedural knowledge.
- Four ecosystem skills are registered locally in .agents/skills/:
- playwright-cli (microsoft/playwright-cli) — Browser automation, resilient selectors, auto-waiting, request mocking
- shadcn (shadcn/ui) — Component parsing, registry authoring, Radix/Tailwind composition
- vercel-react-best-practices (vercel-labs/agent-skills) — React/Next.js performance optimization, server/client boundaries
- better-auth-best-practices (better-auth/skills) — Type-safe auth, session management, plugin architecture
- All agents (OpenCode, Antigravity) must load these skills from .agents/skills/ before generating or reviewing code.
- Code generated for harness or frontend features must not conflict with these skill design parameters.

## 1. APPLICATION PURITY & DECOUPLING (CRITICAL)

- This repository is an APPLICATION-AGNOSTIC multi-agent orchestration service container ("SavazAI").

- NEVER hardcode domain-specific fields, layout variables, or tables (such as weddings, ceremonies, or corporate events) into this engine's packages or core modules.

- All target application context must be resolved dynamically at runtime by communicating over registered JSON-RPC 2.0 MCP endpoints using explicit tool schemas.

## 2. DECOUPLED MONOREPO DIRECTORY PATHS

- We operate under a strict, physical separation of concerns at the folder level. Maintain clear logical boundaries:
- ./ (Root Workspace): The SavazAI Engine Backend (Node.js, Express, LangGraph, Drizzle ORM, pgvector) listening on primary host port 3055.
- ./savazai-console (Sub-Folder Workspace): The SavazAI Console Frontend (Next.js 16.2 App Router, React 19.2+, Better-Auth, Tailwind CSS, Shadcn UI) listening on primary host port 3056.

## 3. CORE NETWORK PORT & DOCKER INTRA-COMMUNICATION

- To prevent port collision crashes and ensure seamless container routing, adhere to this strict network allocation scheme:
- Database (pgvector): Host Port 5622 / Internal Docker Port 5432
- Backend API Engine: Host Port 3055 / Internal DNS: http://savazai-backend:3055
- Frontend Console UI: Host Port 3056 / Mapped Next.js development/standalone boundary
- ZERO-HARDCODING RULE: NEVER hardcode raw domain names (savazar.com), local IPs, or local ports directly inside code components. ALWAYS dynamically ingest endpoints via Environment Variables:
- Backend API references inside frontend: process.env.NEXT_PUBLIC_HARNESS_API_URL (Defaults internally to http://savazai-backend:3055 inside the Docker Compose bridge)
- Authentication host path: process.env.BETTER_AUTH_URL
- Database credentials: process.env.DATABASE_URL

## 4. RESPONSES & PLANNING

- Keep code generation and architectural explanations concise and to the point.

- Always ask clarifying questions before altering the underlying graph layout or changing container settings.

- Never assume a connected app's API version or capabilities; use deep-dive discovery sub-agents to inspect dynamic schemas if necessary.

## 5. CHANGE / EDIT MODE & TESTING STANDARDS

- Coordinate complex feature sets using isolated, task-focused modular sub-agents.

- Use premium frontier LLMs for code transformations, and mid-tier models for static documentation generation.

- TARGET DIRECTORY CHECK: Every command and development task must explicitly check and state the target folder context path prior to file operations.

- THE VALIDATION LOOP: After editing files in any package, execute the validation loop within that specific subdirectory:
- For ./savazai-console: npm run lint and next build --experimental-turbopack
- For ./ (Root Backend): npm run lint and npx tsc --noEmit

## 6. DATABASE & DATA INTEGRITY

- Whenever making schema modifications in src/db/schema.ts, ALWAYS generate and run standard migrations using npm run db:generate and npm run db:migrate.

- NEVER run direct schema push commands (like drizzle-kit push).

- All primary or indexing identifiers must utilize randomly generated UUID structures.

- System configurations, custom branding assets, and CSS variable parameters are dynamically persisted within the system_configurations table. Update transactions must write safely back to this entity.

## 7. REUSABLE SKILLS ENGINE (Markdown Structure)

- All functional harness capabilities live inside the src/skills/ directory as individual Markdown files.

- Each skill file uses clean YAML frontmatter to register schemas.

- NEVER bypass the skills-loader.ts middleware by hardcoding raw function parameters into the main supervisor. Always load schemas dynamically from disk so that the suite stays modular.

## 8. SYSTEM PRIVACY & SECURITY GUARDRAILS

- Every incoming record payload must execute through the Data Masking Gateway. Replace sensitive PII, SPI, PHI, or identifier text rows with unique, hashed reference tokens prior to dispatching queries to non-local external LLMs.

- Re-hydrate strings to their original parameters only within protected internal boundaries when calling authenticated, target application database layers.

- Under no circumstances allow hardcoded database credentials or tokens inside active workspace files. Force references to resolve out of the local .env environment.

## 9. HUMAN-IN-THE-LOOP (HITL) & INTERCEPTORS

- If any autonomous sub-agent executes an destructive mutating action string (specifically any endpoint payload starting with delete\_), the graph state thread must be immediately frozen and updated to PENDING\_APPROVAL.

- Halt processing operations and surface a structured JSON indicator badge down to the embedded UI chat component to ensure the user provides explicit manual confirmation.

## 10. UI/UX PRO-MAX DESIGN SYSTEM GUIDELINES

- Any layouts, pages, or components written inside ./savazai-console must strictly adhere to the guidelines of our loaded git repository design skill: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- Theme Hydration (SSR Boundary): Ensure look-and-feel theme variable compilation resides strictly at the Server-Side Rendering (SSR) layout boundary inside ./savazai-console/src/components/theme-provider.tsx to prevent flashing theme states.
- CSS Variable Purity: Never use loose hardcoded hex codes. Map styles natively to standard tailwind variables (--primary, --secondary, --background) derived from the system_configurations database entity.
- Premium Typography & Layout Pairing: Enforce visual contrast metrics, spacious layouts, unified border radius bounds (rounded-xl / rounded-2xl), and balanced grid alignment patterns.

## 11. CONTEXT, GRAPHIFY & MCP INTEGRATION PROTOCOLS

- When executing complex changes across monorepo boundaries, developers must leverage both graphify and the context7 MCP server to index types and prevent code regressions:
- Read Before Write: Before implementing schema updates or route expansions, run a context7 lookup to extract current TypeScript types from ./src/db/schema.ts and verify they align with ./savazai-console/src/lib/auth.ts.
- Verify Cross-Boundary Typing: Always inspect database schema exports using context7 to make sure fields dynamically bound to theme configurations match the properties of the Next.js system_configurations schema.

graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types /graphify, invoke the skill tool with skill: "graphify" before doing anything else.

Rules:

For codebase questions, first run graphify query "<question>" when graphify-out/graph.json exists. Use graphify path "<A>" "<B>" for relationships and graphify explain "<concept>" for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.

Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.

If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.

Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.

After modifying code, run graphify update . to keep the graph current (AST-only, no API cost).

## 12. BUILD, RUN & LOCAL-FIRST TESTING COMMANDS

# Run Both Apps and DB Locally (Root Directory)
docker compose up --build -d

# Complete Code Quality Testing Loops
# Backend Execution Verification (Root Workspace)
npx tsc --noEmit
npm run lint

# Frontend Compilation Verification (./savazai-console Folder)
cd savazai-console
npm run lint
next build --experimental-turbopack

# Generate and Apply Database Migrations
npm run db:generate
npm run db:migrate


- Local port configuration is set strictly to localhost:3055 for the core harness service, port 3056 for the Next.js frontend console boundary, and host port 5622 for the isolated PostgreSQL 17 container to prevent environment conflicts.