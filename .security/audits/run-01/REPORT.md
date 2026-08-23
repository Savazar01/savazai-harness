# SavazAI Security Audit Report (Run-01)

## Executive Summary
A comprehensive 6-phase security audit was performed across the **SavazAI Harness** multi-agent orchestration engine and **SavazAI Console** codebase. The audit evaluated attack surfaces across authentication, input validation, SQL query execution, SSRF in webhook gateways, and sandbox confinement in script execution utilities.

All findings have been validated against actual source code traces and confirmed. Full remediations have been implemented following graph-agnostic, schema-driven architectural guidelines.

## Risk Summary Matrix

| Finding ID | Severity | Category | Title | Status |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | **HIGH** | SQL Injection / DML Mutation | Unrestricted Database Modification via `postgres_query_tool` | **REMEDIATED** |
| **SEC-02** | **HIGH** | Server-Side Request Forgery | Outbound SSRF in Custom Webhook Gateway | **REMEDIATED** |
| **SEC-03** | **HIGH** | Broken Authentication | Unauthenticated Compliance Policy Override in Governance API | **REMEDIATED** |
| **SEC-04** | **MEDIUM** | Path Traversal | Unvalidated Script Path in Python Sandbox Runner | **REMEDIATED** |

---

## Detailed Audit Results

### 1. SEC-01: Unrestricted Database Modification via `postgres_query_tool` (HIGH)
- **Vulnerability**: `postgres_query_tool` claimed to be a read-only database inspection tool, but executed unvalidated arbitrary SQL statements (`pool.query` / `sqlClient.unsafe`).
- **Remediation**: Implemented strict read-only AST/statement validation ensuring only non-destructive `SELECT` / `EXPLAIN` / `SHOW` / `WITH` queries are permitted, while blocking `DROP`, `DELETE`, `UPDATE`, `INSERT`, `TRUNCATE`, `ALTER`, and file access commands.

### 2. SEC-02: Outbound SSRF in Custom Webhook Gateway (HIGH)
- **Vulnerability**: `callCustomWebhook` allowed outbound requests to arbitrary URLs, enabling SSRF targeting internal loopback endpoints (`127.0.0.1`, `localhost`), private subnets (`10.0.0.0/8`, `192.168.0.0/16`, `172.16.0.0/12`), and cloud metadata APIs (`169.254.169.254`).
- **Remediation**: Implemented strict URL validation preventing requests to loopback addresses, private IP ranges, cloud metadata IPs, and non-HTTP(S) protocols.

### 3. SEC-03: Unauthenticated Compliance Policy Override in Governance API (HIGH)
- **Vulnerability**: The `PUT /api/governance/compliance` endpoint allowed unauthenticated clients to overwrite and disable PII masking and data tokenization rules.
- **Remediation**: Added session verification and input schema validation ensuring only authenticated administrators can modify compliance rulesets.

### 4. SEC-04: Unvalidated Script Path in Python Sandbox Runner (MEDIUM)
- **Vulnerability**: `runPython` accepted arbitrary path strings without verifying containment within trusted script directories.
- **Remediation**: Enforced path containment validation ensuring all script paths resolve within authorized `scripts/` or `src/skills/` directories.
