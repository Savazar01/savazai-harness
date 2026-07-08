\# CRITICAL RULES - SAVAZAI AGENT HARNESS ENGINEERING

\## 0. SKILLS.SH ECOSYSTEM INTEGRATION

\- This project is linked to the [skills.sh](https://skills.sh) ecosystem for domain-specific procedural knowledge.
\- Four ecosystem skills are registered locally in `.agents/skills/`:
  - `playwright-cli` (microsoft/playwright-cli) — Browser automation, resilient selectors, auto-waiting, request mocking
  - `shadcn` (shadcn/ui) — Component parsing, registry authoring, Radix/Tailwind composition
  - `vercel-react-best-practices` (vercel-labs/agent-skills) — React/Next.js performance optimization, server/client boundaries
  - `better-auth-best-practices` (better-auth/skills) — Type-safe auth, session management, plugin architecture
\- All agents (OpenCode, Antigravity) must load these skills from `.agents/skills/` before generating or reviewing code.
\- Code generated for harness features must not conflict with these skill design parameters.



\## 1. APPLICATION PURITY \& DECOUPLING (CRITICAL)

\- This repository is an APPLICATION-AGNOSTIC multi-agent orchestration service container ("SavazAI").

\- NEVER hardcode domain-specific fields, layout variables, or tables (such as weddings, ceremonies, or corporate events) into this engine's packages or core modules.

\- All target application context must be resolved dynamically at runtime by communicating over registered JSON-RPC 2.0 MCP endpoints using explicit tool schemas.



\## 2. RESPONSES \& PLANNING

\- Keep code generation and architectural explanations concise and to the point.

\- Always ask clarifying questions before altering the underlying graph layout or changing container settings.

\- Never assume a connected app's API version or capabilities; use deep-dive discovery sub-agents to inspect dynamic schemas if necessary.



\## 3. CHANGE / EDIT MODE

\- Coordinate complex feature sets using isolated, task-focused modular sub-agents.

\- Use premium frontier LLMs for code transformations, and mid-tier models for static documentation generation.

\- After implementing or modifying any code block, always run the validation suite: `npm run lint`, `npx tsc --noEmit`, and verify compilation.



\## 4. DATABASE \& DATA INTEGRITY

\- Whenever making schema modifications in `src/db/schema.ts`, ALWAYS generate and run standard migrations using `npm run db:generate` and `npm run db:migrate`.

\- NEVER run direct schema push commands (like `drizzle-kit push`).

\- All primary or indexing identifiers must utilize randomly generated UUID structures.



\## 5. REUSABLE SKILLS ENGINE (Markdown Structure)

\- All functional harness capabilities live inside the `src/skills/` directory as individual Markdown files.

\- Each skill file uses clean YAML frontmatter to register schemas. 

\- NEVER bypass the `skills-loader.ts` middleware by hardcoding raw function parameters into the main supervisor. Always load schemas dynamically from disk so that the suite stays modular.



\## 6. SYSTEM PRIVACY \& SECURITY GUARDRAILS

\- Every incoming record payload must execute through the Data Masking Gateway. Replace sensitive PII, SPI, PHI, or identifier text rows with unique, hashed reference tokens prior to dispatching queries to non-local external LLMs.

\- Re-hydrate strings to their original parameters only within protected internal boundaries when calling authenticated, target application database layers.

\- Under no circumstances allow hardcoded database credentials or tokens inside the active workspace files. Force references to resolve out of the local `.env` environment.



\## 7. HUMAN-IN-THE-LOOP (HITL) \& INTERCEPTORS

\- If any autonomous sub-agent executes an destructive mutating action string (specifically any endpoint payload starting with `delete\_`), the graph state thread must be immediately frozen and updated to `PENDING\_APPROVAL`.

\- Halt processing operations and surface a structured JSON indicator badge down to the embedded UI chat component to ensure the user provides explicit manual confirmation.



\## 8. BUILD, RUN \& LOCAL-FIRST TESTING COMMANDS

```bash

\# Build and serve the isolated app and db stack locally

docker compose up --build -d


\# Check TypeScript engine compiler integrity

npx tsc --noEmit


\# Check code syntax and lint alignments

npm run lint



\# Generate and apply database migrations

npm run db:generate

npm run db:migrate

\# Local port configuration
Local port configuration is set strictly to localhost:3055 for the core harness service and host port 5622 for the isolated PostgreSQL 17 container to prevent environment conflicts.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
