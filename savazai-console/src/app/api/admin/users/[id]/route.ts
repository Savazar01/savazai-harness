import { NextRequest } from "next/server";
import { Pool } from "pg";
import { auth } from "@/lib/auth";
import { hashPassword } from "better-auth/crypto";
import { headers } from "next/headers";
import { randomUUID } from "node:crypto";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: targetUserId } = await params;

    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session || session.user.role !== "admin") {
      return Response.json(
        { error: "Forbidden: Admin privileges required." },
        { status: 403 }
      );
    }

    if (!targetUserId) {
      return Response.json({ error: "Target user ID is required." }, { status: 400 });
    }

    const body = await req.json();
    const { name, email, role, password } = body;

    // Self-demotion safeguard: Current admin cannot demote their own account
    if (targetUserId === session.user.id && role && role !== "admin") {
      return Response.json(
        { error: "Self-demotion safeguard: You cannot remove admin privileges from your own active account." },
        { status: 400 }
      );
    }

    // Verify user exists
    const existing = await pool.query(
      'SELECT id, name, email, role FROM "user" WHERE id = $1 LIMIT 1',
      [targetUserId]
    );

    if (existing.rows.length === 0) {
      return Response.json({ error: "User not found." }, { status: 404 });
    }

    const currentUser = existing.rows[0];
    const newName = name ? name.trim() : currentUser.name;
    const newEmail = email ? email.trim().toLowerCase() : currentUser.email;
    const newRole = role ? (role === "admin" ? "admin" : "user") : currentUser.role;

    // Check if new email conflicts with another user
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

    // Update user table
    const updateRes = await pool.query(
      `UPDATE "user"
       SET name = $1, email = $2, role = $3, "updatedAt" = now()
       WHERE id = $4
       RETURNING id, name, email, role, "emailVerified", "createdAt", "updatedAt"`,
      [newName, newEmail, newRole, targetUserId]
    );

    // Update password if provided
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
    }

    return Response.json({ user: updateRes.rows[0] }, { status: 200 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to update user.";
    console.error("[PATCH /api/admin/users/[id]] Error:", err);
    return Response.json({ error: errorMsg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id: targetUserId } = await params;

    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session || session.user.role !== "admin") {
      return Response.json(
        { error: "Forbidden: Admin privileges required." },
        { status: 403 }
      );
    }

    if (!targetUserId) {
      return Response.json({ error: "Target user ID is required." }, { status: 400 });
    }

    // Self-deletion safeguard: Admin cannot delete their own account
    if (targetUserId === session.user.id) {
      return Response.json(
        { error: "Self-deletion safeguard: You cannot delete your own active administrator account." },
        { status: 400 }
      );
    }

    // Verify user exists
    const existing = await pool.query(
      'SELECT id, email FROM "user" WHERE id = $1 LIMIT 1',
      [targetUserId]
    );

    if (existing.rows.length === 0) {
      return Response.json({ error: "User not found." }, { status: 404 });
    }

    // Cascade delete sessions, accounts, and user
    await pool.query('DELETE FROM "session" WHERE "userId" = $1', [targetUserId]);
    await pool.query('DELETE FROM "account" WHERE "userId" = $1', [targetUserId]);
    await pool.query('DELETE FROM "user" WHERE id = $1', [targetUserId]);

    return Response.json(
      { success: true, message: `User ${existing.rows[0].email} deleted successfully.` },
      { status: 200 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to delete user.";
    console.error("[DELETE /api/admin/users/[id]] Error:", err);
    return Response.json({ error: errorMsg }, { status: 500 });
  }
}
