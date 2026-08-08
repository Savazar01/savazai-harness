import { NextRequest } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function ensureSkillsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS skills (
        id UUID PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        description TEXT NOT NULL,
        instructions TEXT NOT NULL,
        category VARCHAR(50) DEFAULT 'custom',
        mcp_server_id VARCHAR(255),
        version VARCHAR(50) DEFAULT '1.0.0',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (err) {
    console.error("[ensureSkillsTable] Failed to initialize table:", err);
  }
}

export async function GET() {
  try {
    await ensureSkillsTable();
    const res = await pool.query(
      'SELECT id, name, description, instructions, category, mcp_server_id as "mcpServerId", version, created_at as "createdAt", updated_at as "updatedAt" FROM skills ORDER BY updated_at DESC'
    );
    return new Response(JSON.stringify({ skills: res.rows }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[api-skills-get] Failed:", err);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSkillsTable();
    const { name, description, instructions, category, mcpServerId, version } = await req.json();

    if (!name || !description || !instructions) {
      return new Response(JSON.stringify({ error: "Missing required fields: name, description, instructions" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const id = crypto.randomUUID();
    await pool.query(
      'INSERT INTO skills (id, name, description, instructions, category, mcp_server_id, version, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description, instructions = EXCLUDED.instructions, category = EXCLUDED.category, mcp_server_id = EXCLUDED.mcp_server_id, version = EXCLUDED.version, updated_at = NOW()',
      [id, name, description, instructions, category || "custom", mcpServerId || null, version || "1.0.0"]
    );

    return new Response(JSON.stringify({ success: true, id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[api-skills-post] Failed:", err);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function PUT(req: NextRequest) {
  try {
    await ensureSkillsTable();
    const { id, name, description, instructions, category, mcpServerId, version } = await req.json();

    if (!id || !name || !description || !instructions) {
      return new Response(JSON.stringify({ error: "Missing required fields: id, name, description, instructions" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    await pool.query(
      'UPDATE skills SET name = $1, description = $2, instructions = $3, category = $4, mcp_server_id = $5, version = $6, updated_at = NOW() WHERE id = $7',
      [name, description, instructions, category || "custom", mcpServerId || null, version || "1.0.0", id]
    );

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[api-skills-put] Failed:", err);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await ensureSkillsTable();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return new Response(JSON.stringify({ error: "Missing required parameter: id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    await pool.query("DELETE FROM skills WHERE id = $1", [id]);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[api-skills-delete] Failed:", err);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
