# PLAN: Execute Full-Codebase Security Audit via `.skills/security-audit`, Remediate Findings & Deploy Production Release

---

## 1. Audit Scope & Run-02 Inventory

We are conducting `run-02` of the security audit across `savazai-harness` using the guidelines from `.skills/security-audit/skills/security-audit/`.
Previous findings from `run-01` (Unrestricted Database Modification via `postgres_query_tool`, SSRF in Webhook Gateway, Unauthenticated Compliance Override, and Insecure Script Path in Python Runner) have been verified as remediated in `run-01`.

### Run-02 Vulnerability Inventory & Attack Scenarios

| Finding ID | Title | Severity | Component / Path | Attack Scenario & Impact |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | Unauthenticated Direct API Access on Backend Orchestrator Service | **HIGH** | `src/index.ts` | An adversary reaching port 3055 directly bypasses console RBAC and directly invokes `/api/agentflows`, `/api/graph/invoke`, and `/api/settings` without authentication. |
| **SEC-02** | Path Traversal via Weak Prefix Matching in Python Runner Sandbox | **HIGH** | `src/utils/python-runner.ts` | `resolvedPath.startsWith(dir)` allows partial directory name matches (e.g. `scripts_malicious/`), breaking directory containment. |
| **SEC-03** | Missing Session Revocation on Password Change and Admin Reset | **MEDIUM** | `savazai-console/src/app/api/auth/change-password/route.ts`, `api/admin/users/[id]/route.ts` | When user or admin changes or resets account password, existing sessions in `"session"` table are not revoked, permitting compromised sessions to remain active. |
| **SEC-04** | Plaintext Authentication OTP Credential Exposure in Server Logs | **MEDIUM** | `savazai-console/src/lib/auth/otp.ts` | `generateAndSendEmailOtp` writes the unmasked 6-digit OTP code to container stdout in production environments. |
| **SEC-05** | Insecure Static Master Vault Key Fallback in Production Crypto | **MEDIUM** | `savazai-console/src/lib/crypto.ts` | Falling back to a hardcoded string (`fallback_secret_key_long_enough_32`) when `MASTER_VAULT_SECRET` is unset allows secret encryption with a static key. |

---

## 2. Remediation Strategy

### SEC-01: Backend Orchestrator Internal Service Secret Enforcement
- In `src/index.ts`:
  - Add internal service verification middleware for non-health routes (`/api/*`).
  - Accept requests if caller has `x-internal-secret` matching `MASTER_VAULT_SECRET` or is coming from internal loopback/Docker network.
- In `savazai-console`:
  - Ensure all server-side proxy calls to `BACKEND_URL` pass `x-internal-secret: process.env.MASTER_VAULT_SECRET || ""`.

### SEC-02: Path Traversal Fix in `runPython`
- In `src/utils/python-runner.ts`:
  - Use `path.relative(dir, resolvedPath)`: check `!relative.startsWith("..") && !path.isAbsolute(relative)`.

### SEC-03: Session Revocation on Password Change & Reset
- In `savazai-console/src/app/api/auth/change-password/route.ts` & `reset-password/route.ts`:
  - Add `DELETE FROM "session" WHERE "userId" = $1` upon password update.
- In `savazai-console/src/app/api/admin/users/[id]/route.ts`:
  - Revoke sessions when password is reset by admin.

### SEC-04: Suppress Plaintext OTP Code in Production Logs
- In `savazai-console/src/lib/auth/otp.ts`:
  - If `process.env.NODE_ENV === "production"`, mask the OTP code (`******`) in log statements.

### SEC-05: Require `MASTER_VAULT_SECRET` in Production
- In `savazai-console/src/lib/crypto.ts`:
  - If `NODE_ENV === "production"` and `MASTER_VAULT_SECRET` is not provided or under 32 chars, throw a descriptive initialization error rather than falling back to a static key.

---

## 3. Execution & Verification Steps

1. Generate `.security/audits/run-02/`:
   - `architecture.md`
   - `REPORT.md`
   - `FINDINGS-DETAIL.md`
   - `findings.json`
2. Run validator:
   ```bash
   node .skills/security-audit/skills/security-audit/validate-findings.cjs .security/audits/run-02/findings.json
   ```
3. Implement source code remediations for SEC-01 through SEC-05.
4. Execute Quality Gates:
   - `npx tsc --noEmit`
   - `npx --prefix savazai-console tsc --noEmit`
   - Rebuild Docker containers: `docker compose down && docker compose up --build -d`
   - Container health check: `docker compose ps`
5. Synchronize documentation (`README.md`, `AGENTS.md`) and knowledge graph (`graphify update .`).
6. Stage, commit, and push release to GitHub (`main`).
