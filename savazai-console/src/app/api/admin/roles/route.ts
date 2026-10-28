import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { pool, ensureAdminProvisioned } from "@/lib/auth";
import { requirePermission } from "@/lib/auth/rbac";
import { PERMISSION_REGISTRY } from "@/lib/auth/permissions-registry";

export async function GET() {
  try {
    await ensureAdminProvisioned();
    const check = await requirePermission("user_admin", "view");
    if (!check.authorized) return check.response;

    const rolesRes = await pool.query(
      'SELECT "id", "name", "description", "isSystem", "createdAt", "updatedAt" FROM "role" ORDER BY "isSystem" DESC, "name" ASC'
    );

    const permsRes = await pool.query(
      'SELECT "roleId", "resource", "action" FROM "role_permission"'
    );

    const permsByRole: Record<string, { resource: string; action: string }[]> = {};
    for (const row of permsRes.rows) {
      if (!permsByRole[row.roleId]) permsByRole[row.roleId] = [];
      permsByRole[row.roleId].push({ resource: row.resource, action: row.action });
    }

    const roles = rolesRes.rows.map((r) => ({
      ...r,
      permissions: permsByRole[r.id] || [],
    }));

    return Response.json(
      {
        roles,
        registry: PERMISSION_REGISTRY,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch roles.";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureAdminProvisioned();
    const check = await requirePermission("user_admin", "manage_roles");
    if (!check.authorized) return check.response;

    const body = await req.json();
    const { name, description, permissions = [] } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return Response.json({ error: "Role name is required." }, { status: 400 });
    }

    const cleanName = name.trim();
    const existing = await pool.query(
      'SELECT "id" FROM "role" WHERE LOWER("name") = $1 LIMIT 1',
      [cleanName.toLowerCase()]
    );
    if (existing.rows.length > 0) {
      return Response.json(
        { error: `A role named '${cleanName}' already exists.` },
        { status: 409 }
      );
    }

    const roleId = `role_custom_${randomUUID().slice(0, 8)}`;
    await pool.query(
      `INSERT INTO "role" ("id", "name", "description", "isSystem", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, false, now(), now())`,
      [roleId, cleanName, description ? String(description).trim() : ""]
    );

    if (Array.isArray(permissions)) {
      for (const p of permissions) {
        if (p?.resource && p?.action) {
          const permId = `rp_${roleId}_${p.resource}_${p.action}`;
          await pool.query(
            `INSERT INTO "role_permission" ("id", "roleId", "resource", "action")
             VALUES ($1, $2, $3, $4)
             ON CONFLICT ("roleId", "resource", "action") DO NOTHING`,
            [permId, roleId, String(p.resource), String(p.action)]
          );
        }
      }
    }

    return Response.json({ success: true, roleId }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create role.";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    await ensureAdminProvisioned();
    const check = await requirePermission("user_admin", "manage_roles");
    if (!check.authorized) return check.response;

    const body = await req.json();
    const { roleId, name, description, permissions } = body;

    if (!roleId || typeof roleId !== "string") {
      return Response.json({ error: "roleId is required." }, { status: 400 });
    }

    const roleRes = await pool.query('SELECT "id", "name", "isSystem" FROM "role" WHERE "id" = $1 LIMIT 1', [
      roleId,
    ]);
    if (roleRes.rows.length === 0) {
      return Response.json({ error: "Role not found." }, { status: 404 });
    }

    const currentRole = roleRes.rows[0];
    const isSuperAdmin = currentRole.id === "role_super_admin" || currentRole.name === "Super Administrator";

    // Safety guardrail: Super Administrator must keep minimum essential administrative permissions
    if (isSuperAdmin && Array.isArray(permissions) && permissions.length === 0) {
      return Response.json(
        { error: "Super Administrator must retain platform management permissions to prevent administrative lockout." },
        { status: 400 }
      );
    }

    // Update name if provided and not duplicating another role
    if (name && typeof name === "string" && name.trim() && name.trim() !== currentRole.name) {
      if (isSuperAdmin) {
        return Response.json(
          { error: "The Super Administrator role name is immutable for platform security." },
          { status: 400 }
        );
      }
      const existing = await pool.query(
        'SELECT "id" FROM "role" WHERE LOWER("name") = $1 AND "id" != $2 LIMIT 1',
        [name.trim().toLowerCase(), roleId]
      );
      if (existing.rows.length > 0) {
        return Response.json(
          { error: `Another role named '${name.trim()}' already exists.` },
          { status: 409 }
        );
      }
      await pool.query(
        'UPDATE "role" SET "name" = $1, "updatedAt" = now() WHERE "id" = $2',
        [name.trim(), roleId]
      );
    }

    if (description !== undefined) {
      await pool.query(
        'UPDATE "role" SET "description" = $1, "updatedAt" = now() WHERE "id" = $2',
        [String(description), roleId]
      );
    }

    if (Array.isArray(permissions)) {
      await pool.query('DELETE FROM "role_permission" WHERE "roleId" = $1', [roleId]);
      for (const p of permissions) {
        if (p?.resource && p?.action) {
          const permId = `rp_${roleId}_${p.resource}_${p.action}`;
          await pool.query(
            `INSERT INTO "role_permission" ("id", "roleId", "resource", "action")
             VALUES ($1, $2, $3, $4)
             ON CONFLICT ("roleId", "resource", "action") DO NOTHING`,
            [permId, roleId, String(p.resource), String(p.action)]
          );
        }
      }
    }

    return Response.json({ success: true }, { status: 200 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update role permissions.";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await ensureAdminProvisioned();
    const check = await requirePermission("user_admin", "manage_roles");
    if (!check.authorized) return check.response;

    const { searchParams } = new URL(req.url);
    const roleId = searchParams.get("roleId");
    if (!roleId) {
      return Response.json({ error: "Missing roleId parameter." }, { status: 400 });
    }

    const roleRes = await pool.query('SELECT "id", "name", "isSystem" FROM "role" WHERE "id" = $1 LIMIT 1', [
      roleId,
    ]);
    if (roleRes.rows.length === 0) {
      return Response.json({ error: "Role not found." }, { status: 404 });
    }

    const targetRole = roleRes.rows[0];
    if (targetRole.id === "role_super_admin" || targetRole.name === "Super Administrator") {
      return Response.json(
        { error: "The Super Administrator role cannot be deleted to prevent platform lockout." },
        { status: 400 }
      );
    }

    // Check if any users currently have this role
    const usersWithRole = await pool.query(
      'SELECT "id", "name", "email" FROM "user" WHERE "roleId" = $1 LIMIT 5',
      [roleId]
    );
    if (usersWithRole.rows.length > 0) {
      return Response.json(
        { error: `Cannot delete role '${targetRole.name}' because it is assigned to active user(s). Reassign them first.` },
        { status: 400 }
      );
    }

    await pool.query('DELETE FROM "role_permission" WHERE "roleId" = $1', [roleId]);
    await pool.query('DELETE FROM "role" WHERE "id" = $1', [roleId]);
    return Response.json({ success: true }, { status: 200 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to delete role.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
