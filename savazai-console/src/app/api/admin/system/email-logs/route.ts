import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/rbac";
import { pool, ensureAdminProvisioned } from "@/lib/auth";

export async function GET() {
  const permCheck = await requirePermission("command_center", "system_admin_view");
  if (!permCheck.authorized) {
    return permCheck.response;
  }

  await ensureAdminProvisioned();

  try {
    const res = await pool.query(
      `SELECT id, recipient, subject, purpose, status, error, metadata, created_at as "createdAt"
       FROM "email_audit_logs"
       ORDER BY "created_at" DESC
       LIMIT 50`
    );

    return NextResponse.json({ logs: res.rows });
  } catch (err: unknown) {
    console.error("[Email Logs API Error]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to retrieve email audit logs." },
      { status: 500 }
    );
  }
}
