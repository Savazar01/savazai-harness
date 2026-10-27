import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { pool, ensureAdminProvisioned } from "@/lib/auth";
import { requirePermission } from "@/lib/auth/rbac";

export async function GET() {
  try {
    await ensureAdminProvisioned();
    const check = await requirePermission("user_admin", "view");
    if (!check.authorized) return check.response;

    const result = await pool.query(`
      SELECT 
        u."id",
        u."name",
        u."email",
        u."role",
        u."status",
        u."mustResetPassword",
        u."roleId",
        r."name" as "roleName",
        u."emailVerified",
        u."createdAt",
        u."updatedAt"
      FROM "user" u
      LEFT JOIN "role" r ON u."roleId" = r."id"
      ORDER BY 
        CASE WHEN u."status" = 'PENDING_APPROVAL' THEN 0 ELSE 1 END,
        u."createdAt" DESC
    `);

    const userPermsRes = await pool.query(
      'SELECT "userId", "resource", "action", "granted" FROM "user_permission"'
    );

    const overridesByUser: Record<string, { resource: string; action: string; granted: boolean }[]> = {};
    for (const row of userPermsRes.rows) {
      if (!overridesByUser[row.userId]) overridesByUser[row.userId] = [];
      overridesByUser[row.userId].push({
        resource: row.resource,
        action: row.action,
        granted: Boolean(row.granted),
      });
    }

    const users = result.rows.map((u) => ({
      ...u,
      status: u.status || "PENDING_APPROVAL",
      mustResetPassword: Boolean(u.mustResetPassword),
      customPermissions: overridesByUser[u.id] || [],
    }));

    return Response.json({ users }, { status: 200 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to fetch users.";
    console.error("[GET /api/admin/users] Error:", err);
    return Response.json({ error: errorMsg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureAdminProvisioned();
    const check = await requirePermission("user_admin", ["approve_users", "manage_roles"]);
    if (!check.authorized) return check.response;

    const body = await req.json();
    const {
      name,
      email,
      password,
      status = "PENDING_APPROVAL",
      roleId = null,
      mustResetPassword = true,
      customPermissions = [],
    } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return Response.json({ error: "Full name is required." }, { status: 400 });
    }
    if (!email || typeof email !== "string" || !email.trim() || !email.includes("@")) {
      return Response.json({ error: "Valid email address is required." }, { status: 400 });
    }
    if (!password || typeof password !== "string" || password.length < 6) {
      return Response.json(
        { error: "Password must be at least 6 characters long." },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    const existing = await pool.query(
      'SELECT id FROM "user" WHERE LOWER(email) = $1 LIMIT 1',
      [cleanEmail]
    );
    if (existing.rows.length > 0) {
      return Response.json(
        { error: `A user with email '${cleanEmail}' already exists.` },
        { status: 409 }
      );
    }

    const userId = randomUUID();
    const accountId = randomUUID();
    const hashedPassword = await hashPassword(password);

    const effectiveStatus = ["PENDING_APPROVAL", "ACTIVE", "SUSPENDED", "REJECTED"].includes(status)
      ? status
      : "PENDING_APPROVAL";
    const effectiveRoleId = effectiveStatus === "PENDING_APPROVAL" ? null : (roleId || null);
    const targetLegacyRole = effectiveRoleId === "role_super_admin" ? "admin" : "user";

    const userRes = await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", role, "status", "mustResetPassword", "roleId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, true, $4, $5, $6, $7, now(), now())
       RETURNING id, name, email, role, "status", "mustResetPassword", "roleId", "emailVerified", "createdAt", "updatedAt"`,
      [userId, cleanName, cleanEmail, targetLegacyRole, effectiveStatus, Boolean(mustResetPassword), effectiveRoleId]
    );

    await pool.query(
      `INSERT INTO "account" (id, "userId", "accountId", "providerId", "issuer", password, "createdAt", "updatedAt")
       VALUES ($1, $2, $2, 'credential', 'local:credential', $3, now(), now())`,
      [accountId, userId, hashedPassword]
    );

    if (Array.isArray(customPermissions) && customPermissions.length > 0) {
      for (const cp of customPermissions) {
        if (cp?.resource && cp?.action) {
          const cpId = randomUUID();
          await pool.query(
            `INSERT INTO "user_permission" ("id", "userId", "resource", "action", "granted")
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT ("userId", "resource", "action") DO UPDATE SET "granted" = EXCLUDED."granted"`,
            [cpId, userId, String(cp.resource), String(cp.action), cp.granted !== false]
          );
        }
      }
    }

    return Response.json({ user: userRes.rows[0] }, { status: 201 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to create user.";
    console.error("[POST /api/admin/users] Error:", err);
    return Response.json({ error: errorMsg }, { status: 500 });
  }
}
