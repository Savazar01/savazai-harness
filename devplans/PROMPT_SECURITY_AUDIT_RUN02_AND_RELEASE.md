# PROMPT: Execute Full-Codebase Security Audit via `.skills/security-audit`, Remediate Findings & Deploy Production Release

---

## 1. Executive Summary & Objective

The repository contains an internal security audit skill under:
`.skills/security-audit/skills/security-audit/` (with guidelines `SKILL.md`, `AI-AND-LLM.md`, `WEB-PROTOCOL-AND-AUTH.md`, `CLIENT-SIDE.md`, `HUNTING.md`, and validator `validate-findings.cjs`).

A previous audit run exists at `.security/audits/run-01/` (`architecture.md`, `findings.json`, `FINDINGS-DETAIL.md`, `REPORT.md`).

Antigravity must:
1. **Execute the local `security-audit` skill** across the entire codebase (`savazai-console/`, root services, schema, database handlers, Docker Compose configurations, and APIs).
2. **Output the complete audit results into `.security/audits/run-02/`**, adhering strictly to `report-schema.json` and validating them with `validate-findings.cjs`.
3. **Remediate all High and Critical findings** discovered during the audit.
4. **Execute all quality gates**, synchronize documentation (`README.md`, `AGENTS.md`) and the repository knowledge graph (`graphify update .`), and commit/push the verified release to GitHub.

---

## 2. Scope & Target Areas
- `savazai-console/`: Next.js 16 App Router, API routes, Server Actions, middleware, authentication lifecycle, RBAC enforcement, client components.
- Root services (`src/`): Express backend on port 3055 (`src/index.ts`), LangGraph orchestrator (`src/orchestrator/graph.ts`), Python runner sandbox (`src/utils/python-runner.ts`), PII Gateway (`src/utils/privacy-gateway.ts`).
- Database & Schemas: PostgreSQL Drizzle schema (`src/db/schema.ts`), migrations, seed scripts, raw query callers (`pg.Pool`).
- Docker Compose & Infrastructure: `docker-compose.yml`, Dockerfiles, environment variables, network isolation, service boundaries.
