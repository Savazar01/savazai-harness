import { NextRequest } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function ensureOkfConceptsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS okf_concepts (
        id UUID PRIMARY KEY,
        category VARCHAR(50) NOT NULL,
        concept_key VARCHAR(255) NOT NULL UNIQUE,
        yaml_frontmatter TEXT NOT NULL,
        markdown_body TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (err) {
    console.error("[ensureOkfConceptsTable] Failed to initialize table:", err);
  }
}

export async function GET() {
  try {
    await ensureOkfConceptsTable();
    const res = await pool.query(
      'SELECT id, category, concept_key as "conceptKey", yaml_frontmatter as "yamlFrontmatter", markdown_body as "markdownBody", updated_at as "updatedAt" FROM okf_concepts ORDER BY updated_at DESC'
    );
    return new Response(JSON.stringify({ concepts: res.rows }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[api-okf-get] Failed:", err);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureOkfConceptsTable();
    const { category, conceptKey, yamlFrontmatter, markdownBody } = await req.json();

    if (!category || !conceptKey || !yamlFrontmatter || !markdownBody) {
      return new Response(JSON.stringify({ error: "Missing required fields: category, conceptKey, yamlFrontmatter, markdownBody" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const id = crypto.randomUUID();
    await pool.query(
      'INSERT INTO okf_concepts (id, category, concept_key, yaml_frontmatter, markdown_body, updated_at) VALUES ($1, $2, $3, $4, $5, NOW()) ON CONFLICT (concept_key) DO UPDATE SET category = EXCLUDED.category, yaml_frontmatter = EXCLUDED.yaml_frontmatter, markdown_body = EXCLUDED.markdown_body, updated_at = NOW()',
      [id, category, conceptKey, yamlFrontmatter, markdownBody]
    );

    return new Response(JSON.stringify({ success: true, id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[api-okf-post] Failed:", err);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function PUT(req: NextRequest) {
  try {
    await ensureOkfConceptsTable();
    const { id, category, conceptKey, yamlFrontmatter, markdownBody } = await req.json();

    if (!id || !category || !conceptKey || !yamlFrontmatter || !markdownBody) {
      return new Response(JSON.stringify({ error: "Missing required fields: id, category, conceptKey, yamlFrontmatter, markdownBody" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    await pool.query(
      'UPDATE okf_concepts SET category = $1, concept_key = $2, yaml_frontmatter = $3, markdown_body = $4, updated_at = NOW() WHERE id = $5',
      [category, conceptKey, yamlFrontmatter, markdownBody, id]
    );

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[api-okf-put] Failed:", err);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await ensureOkfConceptsTable();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return new Response(JSON.stringify({ error: "Missing required parameter: id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    await pool.query("DELETE FROM okf_concepts WHERE id = $1", [id]);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[api-okf-delete] Failed:", err);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
