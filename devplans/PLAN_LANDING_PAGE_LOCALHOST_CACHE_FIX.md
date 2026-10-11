# PLAN: Diagnose & Render Landing Page Updates on localhost:3056, Invalidate Container Cache, and Verify Live HTML

## 1. Root Cause Identified
- **Target File Verification**: Verified that `savazai-console/src/app/page.tsx` is indeed the active Next.js root route serving `GET /`.
- **Diagnostic Proof via `fetch('http://localhost:3056/')`**:
  - `Contains Decoupled Dual-Mode: false`
  - `Contains Role-Based Node Orchestration: true`
- **Root Cause**:
  `savazai-console` is running inside Docker container `savazai-harness-savazai-console-1`, built from `savazai-console/Dockerfile` as a production standalone multi-stage image.
  When changes were made to `savazai-console/src/app/page.tsx` and built locally on the host machine (`npm run build` on Windows), Docker container files were untouched because the container image runs an internal pre-compiled standalone Next.js server (`server.js` from `/app/.next/standalone`).
  The container was started ~40 minutes ago prior to the landing page edits and requires a Docker build to refresh the container image.

## 2. Remediation & Verification Plan
1. **Rebuild the Console Docker Container**:
   Execute:
   ```bash
   docker compose build savazai-console
   docker compose up -d savazai-console
   ```
2. **Verify Container Health & Logs**:
   Wait for `savazai-harness-savazai-console-1` to transition to healthy.
3. **Verify Live HTML on `localhost:3056`**:
   Execute Node fetch/curl against `http://localhost:3056/` and confirm:
   - Contains: `"Decoupled Dual-Mode Agent Workspace"`
   - Contains: `"Universal Dynamic MCP Transports"`
   - Contains: `"Automated Technical Context Resolution"`
   - Does NOT contain old text `"Role-Based Node Orchestration"`.
4. **DevPlans Documentation**:
   - Write `/devplans/WALKTHROUGH_LANDING_PAGE_LOCALHOST_CACHE_FIX.md` capturing diagnostic trace, docker rebuild commands, and live HTML verification snippets.
5. **Knowledge Graph Synchronization**:
   - Run `graphify update .` to finalize.
