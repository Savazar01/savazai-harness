# Detailed Findings & Technical Trace (Audit Run-01)

## SEC-01: Unrestricted Database Modification via `postgres_query_tool`
- **Overall Severity**: HIGH (Likelihood: HIGH, Impact: HIGH)
- **Root Cause**: `executeNativeTool in savazai-console/src/lib/tool-gateway.ts does not validate SQL statements for read-only query operations, allowing arbitrary database mutations including table drop and unauthorized data modification.`
- **Intended Behavior**: The developer intended `postgres_query_tool` to execute safe, read-only analytical SQL queries on external databases.
- **Data Flow Trace**:
  1. Entrypoint: `savazai-console/src/app/api/orchestrator/test/route.ts:4` - `POST` receives tool invocation payload with `query` argument.
  2. Propagation: `savazai-console/src/lib/tool-gateway.ts:828` - `executeNativeTool` routes tool request to `executeDbQuery`.
  3. Sink: `savazai-console/src/lib/tool-gateway.ts:682` - `executeDbQuery` executes raw SQL string directly via `pool.query(query)`.

---

## SEC-02: Outbound SSRF in Custom Webhook Gateway
- **Overall Severity**: HIGH (Likelihood: HIGH, Impact: HIGH)
- **Root Cause**: `callCustomWebhook in savazai-console/src/lib/tool-gateway.ts does not validate destination URLs against private IP and link-local ranges, allowing attackers to access internal intranet infrastructure and cloud metadata services.`
- **Intended Behavior**: The developer intended to allow custom external API integrations and webhooks to third-party SaaS services.
- **Data Flow Trace**:
  1. Entrypoint: `savazai-console/src/app/api/orchestrator/test/route.ts:4` - `POST` accepts webhook URL parameter from tool call.
  2. Propagation: `savazai-console/src/lib/tool-gateway.ts:843` - `executeNativeTool` forwards URL argument to `callCustomWebhook`.
  3. Sink: `savazai-console/src/lib/tool-gateway.ts:711` - `callCustomWebhook` executes `fetch(url)` without IP address / hostname boundary checks.

---

## SEC-03: Unauthenticated Compliance Policy Override in Governance API
- **Overall Severity**: HIGH (Likelihood: HIGH, Impact: HIGH)
- **Root Cause**: `PUT in savazai-console/src/app/api/governance/compliance/route.ts does not authenticate the requesting session, allowing unauthenticated attackers to overwrite or disable data compliance and PII masking configurations.`
- **Intended Behavior**: Only authorized admin users should be able to update corporate compliance policies and PII redaction settings.
- **Data Flow Trace**:
  1. Entrypoint: `savazai-console/src/app/api/governance/compliance/route.ts:105` - `PUT` receives compliance update request.
  2. Propagation: `savazai-console/src/app/api/governance/compliance/route.ts:117` - `PUT` deletes existing compliance rules.
  3. Sink: `savazai-console/src/app/api/governance/compliance/route.ts:118` - `PUT` inserts unvalidated configuration without user auth check.

---

## SEC-04: Unvalidated Script Path in Python Sandbox Runner
- **Overall Severity**: MEDIUM (Likelihood: MEDIUM, Impact: MEDIUM)
- **Root Cause**: `runPython in src/utils/python-runner.ts does not restrict the scriptPath argument to allowed script directories, allowing directory traversal and arbitrary script execution.`
- **Intended Behavior**: The runner should only execute approved local Python scripts in designated directories.
- **Data Flow Trace**:
  1. Entrypoint: `src/index.ts:78` - `POST` accepts tool request requiring python utility.
  2. Propagation: `src/orchestrator/graph.ts:1531` - `executeTool` passes script path parameter.
  3. Sink: `src/utils/python-runner.ts:11` - `runPython` passes script path directly to `child_process.spawn`.
