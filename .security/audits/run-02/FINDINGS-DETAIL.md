# Detailed Findings & Technical Trace (Audit Run-02)

## SEC-01: Unauthenticated Direct Endpoint Access on Backend Orchestrator Service
- **Overall Severity**: HIGH (Likelihood: HIGH, Impact: HIGH)
- **Root Cause**: `app router in src/index.ts does not verify internal service secret headers, allowing unauthenticated remote clients to invoke backend orchestration and modify agentflows`
- **Intended Behavior**: Enforce that all incoming requests on backend orchestrator endpoints require a shared internal service secret (`x-internal-secret: MASTER_VAULT_SECRET`) unless originating from loopback or internal trusted networks.
- **Data Flow Trace**:
  1. Entrypoint: `src/index.ts:665` - `post` receives unauthenticated HTTP POST request on `/api/agentflows`.
  2. Sink: `src/index.ts:672` - `post` executes database insert into `agentflows` table without verifying authorization or internal secret.
- **Threat Scenario**: If container port 3055 is bound to `0.0.0.0` or reachable directly via reverse proxy, an external attacker bypasses the Next.js console authentication perimeter and can create, read, update, or delete agentflows, inspect LLM configurations, and trigger arbitrary agent graph executions.
- **Remediation**: Add an internal service secret validation middleware in `src/index.ts` that enforces `x-internal-secret: process.env.MASTER_VAULT_SECRET` on non-health `/api/*` routes, and ensure console proxy routes send this header.

---

## SEC-02: Path Traversal via Partial Prefix Matching in Python Runner Sandbox
- **Overall Severity**: HIGH (Likelihood: MEDIUM, Impact: HIGH)
- **Root Cause**: `runPython in src/utils/python-runner.ts does not enforce boundary-delimited path containment, allowing arbitrary python script execution outside authorized directories via prefix matching`
- **Intended Behavior**: Enforce strict directory containment using `path.relative` or explicit path separators to ensure scripts only execute within `scripts/`, `src/skills/`, or `dist/skills/`.
- **Data Flow Trace**:
  1. Entrypoint: `src/utils/python-runner.ts:6` - `runPython` receives user-specified `scriptPath` parameter for execution.
  2. Propagation: `src/utils/python-runner.ts:17` - `runPython` validates `resolvedPath` using `startsWith` against allowed directory paths without path separator.
  3. Sink: `src/utils/python-runner.ts:25` - `runPython` spawns `python3` process executing the script at `resolvedPath` outside authorized directories.
- **Threat Scenario**: An attacker supplying a script path such as `scripts_evil/malicious.py` bypasses the check because `/app/scripts_evil` starts with `/app/scripts`, executing untrusted code outside the intended script sandbox.
- **Remediation**: Use `path.relative(dir, resolvedPath)`: verify `!rel.startsWith('..') && !path.isAbsolute(rel)`.

---

## SEC-03: Missing Concurrent Session Invalidation on Password Modification
- **Overall Severity**: MEDIUM (Likelihood: MEDIUM, Impact: MEDIUM)
- **Root Cause**: `POST in savazai-console/src/app/api/auth/change-password/route.ts does not delete active session tokens upon password update, allowing compromised sessions to remain active indefinitely`
- **Intended Behavior**: Immediately delete all existing session records for the user from the `session` table when a password is changed or reset.
- **Data Flow Trace**:
  1. Entrypoint: `savazai-console/src/app/api/auth/change-password/route.ts:6` - `POST` receives password change request with verified current password.
  2. Sink: `savazai-console/src/app/api/auth/change-password/route.ts:73` - `POST` updates password hash in database but leaves existing session tokens active in the `session` table.
- **Threat Scenario**: When an account credential is compromised and the operator updates their password via `/profile` or an administrator resets it, any existing hijacked session cookie on an attacker device remains active and authenticated.
- **Remediation**: Add `DELETE FROM "session" WHERE "userId" = $1` in `change-password/route.ts`, `reset-password/route.ts`, and `admin/users/[id]/route.ts`.

---

## SEC-04: Plaintext Authentication OTP Code Exposure in Server Logs
- **Overall Severity**: MEDIUM (Likelihood: MEDIUM, Impact: MEDIUM)
- **Root Cause**: `generateAndSendEmailOtp in savazai-console/src/lib/auth/otp.ts does not suppress sensitive credentials in production stdout logs, allowing unauthorized log consumers to view one-time authentication codes`
- **Intended Behavior**: Mask OTP values in log outputs in production environments, displaying only masked placeholders.
- **Data Flow Trace**:
  1. Entrypoint: `savazai-console/src/lib/auth/otp.ts:13` - `generateAndSendEmailOtp` generates 6-digit numeric OTP code for user email verification.
  2. Sink: `savazai-console/src/lib/auth/otp.ts:80` - `generateAndSendEmailOtp` prints unmasked raw OTP code directly to server `console.log`.
- **Threat Scenario**: Anyone with read access to container logs, CloudWatch/Datadog streams, or local docker logs can intercept one-time authentication tokens and complete unauthorized onboarding.
- **Remediation**: In production (`NODE_ENV === "production"`), log only `******` instead of the raw OTP.

---

## SEC-05: Insecure Static Master Vault Secret Fallback in Console Cryptography
- **Overall Severity**: MEDIUM (Likelihood: LOW, Impact: HIGH)
- **Root Cause**: `encrypt in savazai-console/src/lib/crypto.ts does not enforce a mandatory encryption key in production environments, allowing credentials to be encrypted with a static hardcoded key`
- **Intended Behavior**: Enforce that `MASTER_VAULT_SECRET` must be explicitly configured and at least 32 characters long in production environments, refusing to start or encrypt with a static fallback.
- **Data Flow Trace**:
  1. Entrypoint: `savazai-console/src/lib/crypto.ts:5` - `encrypt` receives sensitive secret for encryption at rest.
  2. Sink: `savazai-console/src/lib/crypto.ts:7` - `encrypt` derives encryption key using hardcoded fallback string when `MASTER_VAULT_SECRET` is absent.
- **Threat Scenario**: If a production deployment omits `MASTER_VAULT_SECRET`, all stored passwords and tokens in `system_configurations` are encrypted using the public fallback key found in source code.
- **Remediation**: Throw an explicit initialization error in production if `MASTER_VAULT_SECRET` is missing or shorter than 32 characters.
