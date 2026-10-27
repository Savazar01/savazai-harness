import { NextRequest } from "next/server";
import { Pool } from "pg";
import { requirePermission } from "@/lib/auth/rbac";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function GET(req: NextRequest) {
  try {
    const check = await requirePermission("demo_requests", "view");
    if (!check.authorized) return check.response;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const query = searchParams.get("q");

    let sql = `
      SELECT 
        id,
        full_name as "fullName",
        email,
        phone,
        company,
        industry,
        timeline,
        description,
        status,
        notes,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM demo_requests
    `;

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (status && status !== "all") {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    if (query && query.trim()) {
      params.push(`%${query.trim().toLowerCase()}%`);
      conditions.push(`(
        LOWER(full_name) LIKE $${params.length} OR 
        LOWER(email) LIKE $${params.length} OR 
        LOWER(company) LIKE $${params.length} OR 
        LOWER(industry) LIKE $${params.length}
      )`);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ` + conditions.join(" AND ");
    }

    sql += ` ORDER BY created_at DESC`;

    const result = await pool.query(sql, params);

    return Response.json({ demoRequests: result.rows }, { status: 200 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to fetch demo requests.";
    console.error("[GET /api/admin/demo-requests] Error:", err);
    return Response.json({ error: errorMsg }, { status: 500 });
  }
}
