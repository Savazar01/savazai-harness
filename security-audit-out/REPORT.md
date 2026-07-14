# Security Audit Report: SavazAI Harness Workspace

A security compliance audit has been completed across the local workspace (`./`) using the Cloudflare Security Audit Skill.

---

## 📊 Summary of Findings

| ID | Title | Severity | Verdict | Status |
|----|-------|----------|---------|--------|
| **SEC-001** | SQL Injection Risk via Vulnerable Drizzle ORM | **HIGH** | Confirmed | Action Required |
| **SEC-002** | Default Database Credentials in Version Control | **MEDIUM** | Confirmed | Action Required |
| **SEC-003** | Loose Regular Expressions in Privacy Gateway | **MEDIUM** | Confirmed | Action Required |
| **SEC-004** | Exposed Database and Backend Container Ports | **MEDIUM** | Confirmed | Action Required |

---

## 🔍 Detailed Vulnerability Profiles

### SEC-001: SQL Injection Risk via Vulnerable Drizzle ORM Version
- **Location**: [package.json](file:///c:/Users/AVASA/Downloads/OpenC/savazai-harness/package.json#L22)
- **Root Cause**: The project specifies `drizzle-orm` version `^0.38.0`. Versions below `0.45.2` fail to escape SQL identifiers properly, making the database vulnerable to SQL injection if dynamic identifiers from user inputs are used in query building.
- **Remediation**: Upgrade `drizzle-orm` in the backend `package.json` to version `0.45.2` or newer. Run `npm install` and verify queries.
```json
"dependencies": {
  "drizzle-orm": "^0.45.2"
}
```

---

### SEC-002: Cleartext Default Database Credentials in Version Control
- **Location**: [.env](file:///c:/Users/AVASA/Downloads/OpenC/savazai-harness/.env#L1) and [seed.ts](file:///c:/Users/AVASA/Downloads/OpenC/savazai-harness/src/db/seed.ts#L34)
- **Root Cause**: Default cleartext database passwords (`sz_secure_vault_pass_99`) and bearer tokens are hardcoded within files stored under version control.
- **Remediation**: Remove cleartext passwords from the codebase. Bind production variables using host environment parameters (e.g. VPS environment values) and ensure they are dynamically loaded on startup.

---

### SEC-003: Loose Regular Expression Parsing in PII Privacy Gateway
- **Location**: [privacy-gateway.ts](file:///c:/Users/AVASA/Downloads/OpenC/savazai-harness/src/utils/privacy-gateway.ts#L1)
- **Root Cause**: The PII masking gateway uses simplified regex patterns for email, card, and SSN formats. This allows non-standard user inputs (e.g. card numbers with spaces or hyphens) to bypass the masking gate and leak to external LLM providers.
- **Remediation**: Use compliant, comprehensive regex patterns for credit cards and other PII, or deploy a dedicated parsing library to sanitize inputs exhaustively.

---

### SEC-004: Exposed Database and Backend Container Ports
- **Location**: [docker-compose.yml](file:///c:/Users/AVASA/Downloads/OpenC/savazai-harness/docker-compose.yml#L6)
- **Root Cause**: Container ports for the postgres database (`5622`) and backend API (`3055`) are mapped directly to host network interfaces. Without local firewall restrictions, these ports are publicly exposed.
- **Remediation**: Bind mapped ports to localhost (`127.0.0.1`) inside `docker-compose.yml`:
```yaml
ports:
  - "127.0.0.1:5622:5432"
ports:
  - "127.0.0.1:3055:3055"
```
This forces ports to only bind locally, requiring secure reverse proxies (like Nginx or Caddy) to handle external requests.
