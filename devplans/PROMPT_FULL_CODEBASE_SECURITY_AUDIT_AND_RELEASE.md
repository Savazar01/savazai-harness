# PROMPT: Comprehensive Codebase Security Audit, Remediation & Production Release to GitHub

---

## 1. Context & Objectives

Before pushing the platform release to GitHub and deploying to Coolify, Antigravity must execute a comprehensive security audit across the entire codebase (`savazai-console/`, backend services, Docker infrastructure, and shared libraries).

### Core Directives:
1. **Full-Spectrum Codebase Audit**:
   - Audit Cloudflare Edge, Network & Bot Defense Architecture (Turnstile verification, `CF-Connecting-IP`, fail-closed defenses).
   - Audit Complete API Route & Server Action Perimeter (RBAC enforcement with `requirePermission`, eradication of public registration, tokenized onboarding security).
   - Audit HTTP Response Headers & Content Security Policy (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy).
   - Audit Data Protection, Encryption-at-Rest & Secret Management (AES-256 vault encryption, secret leakage checks, zero client-side credential exposure).
   - Audit Session Management, Cookies & Injection Prevention (HttpOnly/Secure cookies, 100% parameterized SQL queries, PII Gateway masking).

2. **Systematic Remediation & Defensive Hardening**:
   - Remediate all discovered vulnerabilities categorized into Critical, High, Medium, and Low.
   - Validate that no functional regressions occur across Capability Studio, Business Center, Command Center, or Agent Workspace.

3. **Documentation, Synchronization & Production Push**:
   - Update `README.md` and `AGENTS.md`.
   - Synchronize codebase knowledge graph (`graphify update .`).
   - Execute all quality gates (`npx tsc --noEmit`, `npm run build`, container health check).
   - Stage, commit, and push the release to GitHub (`main` branch) for Coolify production deployment.
