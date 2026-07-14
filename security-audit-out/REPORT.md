# Security Audit Report: SavazAI Harness Workspace

A security compliance audit has been completed across the local workspace (`./`) using the Cloudflare Security Audit Skill.

---

## 📊 Summary of Findings

| ID | Title | Severity | Verdict | Status |
|----|-------|----------|---------|--------|
| **SEC-001** | SQL Injection Risk via Vulnerable Drizzle ORM | **HIGH** | Confirmed | **RESOLVED** (Upgraded to 0.45.2) |
| **SEC-002** | Default Database Credentials in Version Control | **MEDIUM** | Confirmed | Ignored (Per Design) |
| **SEC-003** | Loose Regular Expressions in Privacy Gateway | **MEDIUM** | Confirmed | Ignored (Per Design) |
| **SEC-004** | Exposed Database and Backend Container Ports | **MEDIUM** | Confirmed | Ignored (Per Design) |

---

## 🔍 Detailed Vulnerability Profiles

### SEC-001: SQL Injection Risk via Vulnerable Drizzle ORM Version
- **Location**: [package.json](file:///c:/Users/AVASA/Downloads/OpenC/savazai-harness/package.json#L22)
- **Status**: **RESOLVED** (Upgraded to `0.45.2`)
- **Root Cause**: The project specified `drizzle-orm` version `^0.38.0`. Versions below `0.45.2` fail to escape SQL identifiers properly, making the database vulnerable to SQL injection if dynamic identifiers from user inputs are used in query building.
- **Remediation**: Upgraded `drizzle-orm` in the backend `package.json` to version `0.45.2`. All queries compile and validate.

---

### SEC-002: Cleartext Default Database Credentials in Version Control
- **Location**: [.env](file:///c:/Users/AVASA/Downloads/OpenC/savazai-harness/.env#L1) and [seed.ts](file:///c:/Users/AVASA/Downloads/OpenC/savazai-harness/src/db/seed.ts#L34)
- **Status**: **Ignored (Per Design)** - Intended local-first developer footprint. Production secrets are overridden on Coolify/VPS via env parameters.

---

### SEC-003: Loose Regular Expression Parsing in PII Privacy Gateway
- **Location**: [privacy-gateway.ts](file:///c:/Users/AVASA/Downloads/OpenC/savazai-harness/src/utils/privacy-gateway.ts#L1)
- **Status**: **Ignored (Per Design)** - Intended modular regex matching parameters.

---

### SEC-004: Exposed Database and Backend Container Ports
- **Location**: [docker-compose.yml](file:///c:/Users/AVASA/Downloads/OpenC/savazai-harness/docker-compose.yml#L6)
- **Status**: **Ignored (Per Design)** - Development convenience configuration. Exposed host ports are expected to be blocked by firewalls (e.g. UFW) in production environments.
