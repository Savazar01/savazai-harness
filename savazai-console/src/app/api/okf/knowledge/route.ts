import { NextRequest } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Helper to initialize table if missing
async function ensureOkfTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS okf_knowledge_facts (
        id UUID PRIMARY KEY,
        category VARCHAR(50) NOT NULL,
        fact_key VARCHAR(255) NOT NULL UNIQUE,
        fact_value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (err) {
    console.error("[ensureOkfTable] Failed to initialize table:", err);
  }
}

export async function GET() {
  try {
    await ensureOkfTable();

    const res = await pool.query(
      'SELECT id, category, fact_key as "factKey", fact_value as "factValue", updated_at as "updatedAt" FROM okf_knowledge_facts ORDER BY updated_at DESC'
    );

    return new Response(JSON.stringify({ facts: res.rows }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[okf-knowledge-get] Failed:", err);
    return new Response(
      JSON.stringify({ error: errMsg || "Failed to retrieve OKF facts." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureOkfTable();
    const { category, factKey, factValue } = await req.json();

    if (!category || !factKey || !factValue) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: category, factKey, factValue" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const id = crypto.randomUUID();
    await pool.query(
      'INSERT INTO okf_knowledge_facts (id, category, fact_key, fact_value, updated_at) VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT (fact_key) DO UPDATE SET category = EXCLUDED.category, fact_value = EXCLUDED.fact_value, updated_at = NOW()',
      [id, category, factKey, factValue]
    );

    return new Response(JSON.stringify({ success: true, id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[okf-knowledge-post] Failed:", err);
    return new Response(
      JSON.stringify({ error: errMsg || "Failed to persist OKF fact." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await ensureOkfTable();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return new Response(
        JSON.stringify({ error: "Missing required query parameter: id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    await pool.query("DELETE FROM okf_knowledge_facts WHERE id = $1", [id]);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[okf-knowledge-delete] Failed:", err);
    return new Response(
      JSON.stringify({ error: errMsg || "Failed to delete OKF fact." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
