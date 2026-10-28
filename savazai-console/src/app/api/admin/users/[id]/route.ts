import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { pool, ensureAdminProvisioned } from "@/lib/auth";
import { requirePermission } from "@/lib/auth/rbac";
import { logAuditEvent } from "@/lib/audit/audit-logger";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    await ensureAdminProvisioned();
    const { id: targetUserId } = await params;

    if (!targetUserId) {
      return Response.json({ error: "Target user ID is required." }, { status: 400 });
    }

    const body = await req.json();
    const {
      name,
      email,
      role,
      roleId,
      roleIds,
      status,
      mustResetPassword,
      password,
      customPermissions,
    } = body;

    // Determine required permission based on operation
    if (password !== undefined || mustResetPassword !== undefined) {
      const check = await requirePermission("user_admin", ["force_password_reset", "approve_users"]);
      if (!check.authorized) return check.response;
    } else if (roleId !== undefined || roleIds !== undefined || customPermissions !== undefined) {
      const check = await requirePermission("user_admin", ["manage_roles", "approve_users"]);
      if (!check.authorized) return check.response;
    } else {
      const check = await requirePermission("user_admin", ["approve_users", "manage_roles"]);
      if (!check.authorized) return check.response;
    }

    const check = await requirePermission("user_admin", [
      "approve_users",
      "manage_roles",
      "force_password_reset",
    ]);
    if (!check.authorized) return check.response;

    const existing = await pool.query(
      'SELECT id, name, email, role, "status", "mustResetPassword", "roleId" FROM "user" WHERE id = $1 LIMIT 1',
      [targetUserId]
    );
    if (existing.rows.length === 0) {
      return Response.json({ error: "User not found." }, { status: 404 });
    }

    const currentUser = existing.rows[0];

    // Self-demotion / self-lockout safeguard for Super Admin
    if (targetUserId === check.context.userId) {
      if (status && status !== "ACTIVE") {
        return Response.json(
          { error: "Self-lockout safeguard: You cannot suspend or reject your own active administrator account." },
          { status: 400 }
        );
      }
      if (
        (roleId !== undefined && roleId !== "role_super_admin") ||
        (Array.isArray(roleIds) && !roleIds.includes("role_super_admin"))
      ) {
        if (currentUser.role === "admin" || check.context.roleIds.includes("role_super_admin")) {
          return Response.json(
            { error: "Self-demotion safeguard: You cannot remove Super Administrator privileges from your own account." },
            { status: 400 }
          );
        }
      }
    }

    // Critical Security Constraint: User Administrators cannot modify their own roles
    const actorIsSelf = targetUserId === check.context.userId;
    const actorIsUserAdmin =
      check.context.roleNames.includes("User Administrator") ||
      check.context.roleIds.includes("role_user_admin");
    const actorIsSuperAdmin =
      check.context.roleNames.includes("Super Administrator") ||
      check.context.roleIds.includes("role_super_admin") ||
      check.context.role === "admin";

    if (actorIsSelf && actorIsUserAdmin && !actorIsSuperAdmin) {
      if (roleIds !== undefined || roleId !== undefined) {
        return Response.json(
          { error: "User Administrators cannot modify their own assigned roles. Contact a Super Administrator for role adjustments." },
          { status: 403 }
        );
      }
    }

    // Handle Multi-Role Updates
    let updatedRoleIds: string[] | null = null;
    if (Array.isArray(roleIds)) {
      updatedRoleIds = roleIds.filter(Boolean);
    } else if (roleId !== undefined) {
      updatedRoleIds = roleId ? [roleId] : [];
    }

    if (updatedRoleIds !== null) {
      const prevRolesRes = await pool.query(
        'SELECT "roleId" FROM "user_assigned_role" WHERE "userId" = $1',
        [targetUserId]
      );
      const prevRoleIds = prevRolesRes.rows.map((r) => r.roleId);

      await pool.query('DELETE FROM "user_assigned_role" WHERE "userId" = $1', [targetUserId]);
      for (const rId of updatedRoleIds) {
        await pool.query(
          `INSERT INTO "user_assigned_role" ("id", "userId", "roleId")
           VALUES ($1, $2, $3)
           ON CONFLICT ("userId", "roleId") DO NOTHING`,
          [randomUUID(), targetUserId, rId]
        );
      }

      await logAuditEvent({
        category: "USER_ADMIN",
        action: "USER_ROLES_UPDATED",
        resource: "user_directory",
        actorId: check.context.userId,
        actorEmail: check.context.email,
        targetId: targetUserId,
        targetName: currentUser.name || currentUser.email,
        details: {
          previousRoleIds: prevRoleIds,
          newRoleIds: updatedRoleIds,
        },
      });
    }

    const newName = name ? name.trim() : currentUser.name;
    const newEmail = email ? email.trim().toLowerCase() : currentUser.email;
    const newStatus = status || currentUser.status || "ACTIVE";
    const primaryRoleId = updatedRoleIds !== null ? (updatedRoleIds[0] || null) : currentUser.roleId;
    const newLegacyRole =
      (updatedRoleIds && updatedRoleIds.includes("role_super_admin")) ||
      primaryRoleId === "role_super_admin" ||
      role === "admin"
        ? "admin"
        : "user";
    const newMustReset =
      mustResetPassword !== undefined
        ? Boolean(mustResetPassword)
        : currentUser.status === "PENDING_APPROVAL" && newStatus === "ACTIVE"
        ? true
        : Boolean(currentUser.mustResetPassword);

    if (email && newEmail !== currentUser.email) {
      const emailConflict = await pool.query(
        'SELECT id FROM "user" WHERE LOWER(email) = $1 AND id != $2 LIMIT 1',
        [newEmail, targetUserId]
      );
      if (emailConflict.rows.length > 0) {
        return Response.json(
          { error: `A user with email '${newEmail}' already exists.` },
          { status: 409 }
        );
      }
    }

    const updateRes = await pool.query(
      `UPDATE "user"
       SET name = $1,
           email = $2,
           role = $3,
           "status" = $4,
           "mustResetPassword" = $5,
           "roleId" = $6,
           "updatedAt" = now()
       WHERE id = $7
       RETURNING id, name, email, role, "status", "mustResetPassword", "roleId", "emailVerified", "createdAt", "updatedAt"`,
      [newName, newEmail, newLegacyRole, newStatus, newMustReset, primaryRoleId, targetUserId]
    );

    // Audit status change
    if (status && status !== currentUser.status) {
      await logAuditEvent({
        category: "USER_ADMIN",
        action:
          status === "ACTIVE" && currentUser.status === "PENDING_APPROVAL"
            ? "USER_ONBOARDING_APPROVED"
            : status === "REJECTED" && currentUser.status === "PENDING_APPROVAL"
            ? "USER_ONBOARDING_REJECTED"
            : "USER_STATUS_CHANGED",
        resource: "user_directory",
        actorId: check.context.userId,
        actorEmail: check.context.email,
        targetId: targetUserId,
        targetName: currentUser.name || currentUser.email,
        details: {
          previousStatus: currentUser.status,
          newStatus: status,
        },
      });
    }

    // If user is suspended, rejected, or forced to reset password, revoke active sessions if needed
    if (newStatus !== "ACTIVE") {
      await pool.query('DELETE FROM "session" WHERE "userId" = $1', [targetUserId]);
    }

    // Update custom permissions overrides if provided
    if (Array.isArray(customPermissions)) {
      await pool.query('DELETE FROM "user_permission" WHERE "userId" = $1', [targetUserId]);
      for (const cp of customPermissions) {
        if (cp?.resource && cp?.action) {
          await pool.query(
            `INSERT INTO "user_permission" ("id", "userId", "resource", "action", "granted")
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT ("userId", "resource", "action") DO UPDATE SET "granted" = EXCLUDED."granted"`,
            [
              randomUUID(),
              targetUserId,
              String(cp.resource),
              String(cp.action),
              cp.granted !== false,
            ]
          );
        }
      }
    }

    // Update password if provided by admin
    if (password && typeof password === "string" && password.trim().length >= 6) {
      const hashedPassword = await hashPassword(password.trim());
      const accountRes = await pool.query(
        'SELECT id FROM "account" WHERE "userId" = $1 AND "providerId" = \'credential\' LIMIT 1',
        [targetUserId]
      );

      if (accountRes.rows.length > 0) {
        await pool.query(
          'UPDATE "account" SET password = $1, "issuer" = \'local:credential\', "updatedAt" = now() WHERE "userId" = $2 AND "providerId" = \'credential\'',
          [hashedPassword, targetUserId]
        );
      } else {
        const accountId = randomUUID();
        await pool.query(
          'INSERT INTO "account" (id, "userId", "accountId", "providerId", "issuer", password, "createdAt", "updatedAt") VALUES ($1, $2, $2, \'credential\', \'local:credential\', $3, now(), now())',
          [accountId, targetUserId, hashedPassword]
        );
      }

      await logAuditEvent({
        category: "USER_ADMIN",
        action: "USER_PASSWORD_RESET_TRIGGERED",
        resource: "user_directory",
        actorId: check.context.userId,
        actorEmail: check.context.email,
        targetId: targetUserId,
        targetName: currentUser.name || currentUser.email,
        details: {
          forcedPasswordResetOnLogin: Boolean(newMustReset),
        },
      });

      // Force password reset on next sign-in whenever an admin resets a user's password
      if (mustResetPassword === undefined && targetUserId !== check.context.userId) {
        await pool.query('UPDATE "user" SET "mustResetPassword" = true WHERE id = $1', [
          targetUserId,
        ]);
      }
      // Revoke all existing sessions for the target user to enforce re-authentication
      await pool.query('DELETE FROM "session" WHERE "userId" = $1', [targetUserId]);
    }

    return Response.json({
      user: {
        ...updateRes.rows[0],
        roleIds: updatedRoleIds || (primaryRoleId ? [primaryRoleId] : []),
      }
    }, { status: 200 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to update user.";
    console.error("[PATCH /api/admin/users/[id]] Error:", err);
    return Response.json({ error: errorMsg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    await ensureAdminProvisioned();
    const { id: targetUserId } = await params;

    const check = await requirePermission("user_admin", "approve_users");
    if (!check.authorized) return check.response;

    if (!targetUserId) {
      return Response.json({ error: "Target user ID is required." }, { status: 400 });
    }

    if (targetUserId === check.context.userId) {
      return Response.json(
        { error: "Self-deletion safeguard: You cannot delete your own active administrator account." },
        { status: 400 }
      );
    }

    const existing = await pool.query(
      'SELECT id, email FROM "user" WHERE id = $1 LIMIT 1',
      [targetUserId]
    );
    if (existing.rows.length === 0) {
      return Response.json({ error: "User not found." }, { status: 404 });
    }

    await pool.query('DELETE FROM "user_assigned_role" WHERE "userId" = $1', [targetUserId]);
    await pool.query('DELETE FROM "user_permission" WHERE "userId" = $1', [targetUserId]);
    await pool.query('DELETE FROM "session" WHERE "userId" = $1', [targetUserId]);
    await pool.query('DELETE FROM "account" WHERE "userId" = $1', [targetUserId]);
    await pool.query('DELETE FROM "user" WHERE id = $1', [targetUserId]);

    await logAuditEvent({
      category: "USER_ADMIN",
      action: "USER_PURGED",
      resource: "user_directory",
      actorId: check.context.userId,
      actorEmail: check.context.email,
      targetId: targetUserId,
      targetName: existing.rows[0].email,
      details: { email: existing.rows[0].email },
    });

    return Response.json(
      { success: true, message: `User ${existing.rows[0].email} purged successfully.` },
      { status: 200 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to delete user.";
    console.error("[DELETE /api/admin/users/[id]] Error:", err);
    return Response.json({ error: errorMsg }, { status: 500 });
  }
}
