import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function GET() {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS agentflow_pii_audit_logs (
      id UUID PRIMARY KEY,
      thread_id VARCHAR(255) NOT NULL,
      node_label VARCHAR(255) NOT NULL DEFAULT '',
      pii_mode VARCHAR(50) NOT NULL,
      categories JSONB NOT NULL DEFAULT '[]',
      total_masked INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`).catch(() => {});

    const res = await pool.query(
      `SELECT id, thread_id, node_label, pii_mode, framework_triggered, entities_masked, categories, total_masked, created_at
       FROM agentflow_pii_audit_logs
       ORDER BY created_at DESC
       LIMIT 100`
    );

    const logs = res.rows.map(r => ({
      timestamp: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      operation: "mask" as const,
      categories: r.categories || [],
      totalMasked: r.total_masked || 0,
      nodeLabel: r.node_label || "",
      piiMode: r.pii_mode || "",
      frameworkTriggered: r.framework_triggered || undefined,
      entitiesMasked: r.entities_masked || [],
    }));

    return new Response(JSON.stringify({ logs }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[api-governance-logs] Failed:", err);
    return new Response(
      JSON.stringify({ error: errMsg || "Failed to read PII audit logs." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
