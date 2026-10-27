# SavazAI Security Audit Report (Run-02)

## Executive Summary
A comprehensive security audit was executed across the **SavazAI Harness** multi-agent orchestration engine and **SavazAI Console** web application using `.skills/security-audit/skills/security-audit/`. Building upon the baseline established in `run-01`, this audit examined backend service perimeter isolation, directory containment in script execution sandboxes, session revocation lifecycle on credential changes, log masking defenses, and cryptographic key enforcement.

A total of 5 confirmed findings were identified (2 High, 3 Medium, 0 Critical, 0 Low). All 5 findings have been validated against live source traces, documented according to `report-schema.json`, and systematically remediated.

## Risk Summary Matrix

| Finding ID | Severity | Category | Title | Status |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | **HIGH** | Authentication / Perimeter | Unauthenticated Direct Endpoint Access on Backend Orchestrator Service | **REMEDIATED** |
| **SEC-02** | **HIGH** | Sandbox / Path Traversal | Path Traversal via Partial Prefix Matching in Python Runner Sandbox | **REMEDIATED** |
| **SEC-03** | **MEDIUM** | Session Management | Missing Concurrent Session Invalidation on Password Modification | **REMEDIATED** |
| **SEC-04** | **MEDIUM** | Information Disclosure | Plaintext Authentication OTP Code Exposure in Server Logs | **REMEDIATED** |
| **SEC-05** | **MEDIUM** | Cryptography / Key Management | Insecure Static Master Vault Secret Fallback in Console Cryptography | **REMEDIATED** |

---

## Detailed Audit Results & Remediations

### 1. SEC-01: Unauthenticated Direct Endpoint Access on Backend Orchestrator Service (HIGH)
- **Vulnerability**: Express backend (`src/index.ts`) exposed workflow persistence and graph execution endpoints (`/api/agentflows`, `/api/graph/invoke`, `/api/tools/registered`) without verifying caller credentials or internal service tokens. If container port 3055 is reached directly, callers bypassed console RBAC.
- **Remediation**: Injected an internal service authentication middleware across all `/api/*` endpoints in `src/index.ts` requiring `x-internal-secret: MASTER_VAULT_SECRET`. Updated `savazai-console` server-side fetch proxies to supply this header.

### 2. SEC-02: Path Traversal via Partial Prefix Matching in Python Runner Sandbox (HIGH)
- **Vulnerability**: `runPython` in `src/utils/python-runner.ts` checked directory boundaries using `resolvedPath.startsWith(dir)`. Without directory separators, paths sharing prefixes (e.g. `scripts_malicious/`) were permitted.
- **Remediation**: Implemented strict containment checking with `path.relative` to ensure paths resolve strictly within authorized directory subtrees (`!rel.startsWith('..') && !path.isAbsolute(rel)`).

### 3. SEC-03: Missing Concurrent Session Invalidation on Password Modification (MEDIUM)
- **Vulnerability**: When users updated passwords via `/api/auth/change-password` or `/api/auth/reset-password`, or admins reset user credentials, existing records in the `session` table were not deleted, allowing hijacked sessions to persist.
- **Remediation**: Added explicit session purging (`DELETE FROM "session" WHERE "userId" = $1`) upon all password modification and admin reset events.

### 4. SEC-04: Plaintext Authentication OTP Code Exposure in Server Logs (MEDIUM)
- **Vulnerability**: `generateAndSendEmailOtp` in `savazai-console/src/lib/auth/otp.ts` logged the raw 6-digit numeric OTP to `console.log`, exposing authentication credentials in container stdout and log management tools.
- **Remediation**: Masked OTP values in `console.log` during production runtime (`process.env.NODE_ENV === "production"`), logging only masked indicators.

### 5. SEC-05: Insecure Static Master Vault Secret Fallback in Console Cryptography (MEDIUM)
- **Vulnerability**: `encrypt` and `decrypt` in `savazai-console/src/lib/crypto.ts` fell back to a hardcoded string when `MASTER_VAULT_SECRET` was missing.
- **Remediation**: Enforced that in `production` mode, `MASTER_VAULT_SECRET` must be set and at least 32 characters long, throwing a startup error if missing.
