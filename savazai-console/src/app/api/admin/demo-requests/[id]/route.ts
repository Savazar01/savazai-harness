import { NextRequest } from "next/server";
import { Pool } from "pg";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session || session.user.role !== "admin") {
      return Response.json(
        { error: "Forbidden: Admin privileges required." },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json();
    const { status, notes } = body;

    const updates: string[] = [];
    const values: (string | null)[] = [];

    if (status !== undefined) {
      values.push(status);
      updates.push(`status = $${values.length}`);
    }

    if (notes !== undefined) {
      values.push(notes);
      updates.push(`notes = $${values.length}`);
    }

    if (updates.length === 0) {
      return Response.json(
        { error: "No fields provided to update." },
        { status: 400 }
      );
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const updateSql = `
      UPDATE demo_requests
      SET ${updates.join(", ")}
      WHERE id = $${values.length}
      RETURNING 
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
    `;

    const result = await pool.query(updateSql, values);

    if (result.rowCount === 0) {
      return Response.json(
        { error: "Demo request not found." },
        { status: 404 }
      );
    }

    return Response.json(
      { success: true, demoRequest: result.rows[0] },
      { status: 200 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to update demo request.";
    console.error("[PATCH /api/admin/demo-requests/[id]] Error:", err);
    return Response.json({ error: errorMsg }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session || session.user.role !== "admin") {
      return Response.json(
        { error: "Forbidden: Admin privileges required." },
        { status: 403 }
      );
    }

    const { id } = await params;

    const result = await pool.query(
      "DELETE FROM demo_requests WHERE id = $1 RETURNING id",
      [id]
    );

    if (result.rowCount === 0) {
      return Response.json(
        { error: "Demo request not found." },
        { status: 404 }
      );
    }

    return Response.json(
      { success: true, message: "Demo request deleted successfully." },
      { status: 200 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to delete demo request.";
    console.error("[DELETE /api/admin/demo-requests/[id]] Error:", err);
    return Response.json({ error: errorMsg }, { status: 500 });
  }
}
