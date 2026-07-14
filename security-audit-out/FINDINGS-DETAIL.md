# Findings Detail: SavazAI Harness Audit

Detailed descriptions and flow traces for confirmed findings.

---

## SEC-001: SQL Injection Risk via Vulnerable Drizzle ORM Version

### Trace
- **Step 1 (Entrypoint)**: [package.json](file:///c:/Users/AVASA/Downloads/OpenC/savazai-harness/package.json#L22)
  - `drizzle-orm` is defined as a dependency version `^0.38.0`.
- **Step 2 (Sink)**: The backend loads the vulnerable `drizzle-orm` package. If any query uses unescaped identifiers or raw input directly in template strings (e.g. `sql.raw()`), dynamic queries could be hijacked.

### Exploitation Prerequisites
- **Third-Party Dependency**: drizzle-orm is used to interact with database schemas.
- **Data State**: User input must be incorporated into unescaped SQL structures or dynamic SQL templates.

### Remediation Code Changes
Update your backend dependencies:
```diff
-    "drizzle-orm": "^0.38.0",
+    "drizzle-orm": "^0.45.2",
```

---

## SEC-002: Cleartext Default Database Credentials in Version Control

### Trace
- **Step 1 (Entrypoint)**: [.env](file:///c:/Users/AVASA/Downloads/OpenC/savazai-harness/.env#L1) and [seed.ts](file:///c:/Users/AVASA/Downloads/OpenC/savazai-harness/src/db/seed.ts#L34)
  - Default cleartext connection string `postgresql://sz_harness_admin:sz_secure_vault_pass_99@localhost:5622/savazai_harness` is defined.
- **Step 2 (Sink)**: Default secrets are committed to version control and loaded on deployment startup, enabling unauthorized access to the database container if the host interface is exposed.

### Exploitation Prerequisites
- **System Configuration**: No environment overrides are set inside the VPS host environment, causing containers to fall back to the default credentials.

### Remediation Wording
Ensure all database passwords and vault encryption keys are loaded dynamically from environment parameters on startup.

---

## SEC-003: Loose Regular Expression Parsing in PII Privacy Gateway

### Trace
- **Step 1 (Entrypoint)**: [privacy-gateway.ts](file:///c:/Users/AVASA/Downloads/OpenC/savazai-harness/src/utils/privacy-gateway.ts#L1)
  - Simplified regex patterns are declared for email, card, and SSN formats.
- **Step 2 (Sink)**: When `maskPayload` executes, modified PII formats bypass the gateway filters, leaking sensitive data to external LLM providers.

### Exploitation Prerequisites
- **Data State**: User inputs must contain variations in formatting (such as spaces in credit card numbers or non-standard characters in emails).

### Remediation Wording
Use a more robust, compliant regular expression library or a dedicated validator package to ensure exhaustive PII/SPI data masking.

---

## SEC-004: Exposed Database and Backend Container Ports

### Trace
- **Step 1 (Entrypoint)**: [docker-compose.yml](file:///c:/Users/AVASA/Downloads/OpenC/savazai-harness/docker-compose.yml#L6)
  - `ports: - "5622:5432"` maps postgres database publicly.
- **Step 2 (Sink)**: Database container listens publicly on port `5622` and backend API listens publicly on port `3055` of the host VPS interface.

### Exploitation Prerequisites
- **Network Routing**: Host VPS runs without firewall restrictions blocking incoming traffic on ports `5622` and `3055`.

### Remediation Code Changes
Bind mapped ports to `127.0.0.1` inside `docker-compose.yml`:
```diff
   savazai-db:
     image: pgvector/pgvector:pg17
     container_name: savazai-db
     ports:
-      - "5622:5432"
+      - "127.0.0.1:5622:5432"
```
