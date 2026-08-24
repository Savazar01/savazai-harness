import { NextRequest } from "next/server";
import { Pool } from "pg";
import { auth } from "@/lib/auth";
import { hashPassword } from "better-auth/crypto";
import { headers } from "next/headers";
import { randomUUID } from "node:crypto";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function GET() {
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

    const result = await pool.query(
      'SELECT id, name, email, role, "emailVerified", "createdAt", "updatedAt" FROM "user" ORDER BY "createdAt" DESC'
    );

    return Response.json({ users: result.rows }, { status: 200 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to fetch users.";
    console.error("[GET /api/admin/users] Error:", err);
    return Response.json({ error: errorMsg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const { name, email, role = "user", password } = body;

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

    const targetRole = role === "admin" ? "admin" : "user";
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    // Check if email already registered
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

    // Insert user record
    const userRes = await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", role, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, true, $4, now(), now())
       RETURNING id, name, email, role, "emailVerified", "createdAt", "updatedAt"`,
      [userId, cleanName, cleanEmail, targetRole]
    );

    // Insert credential account record
    await pool.query(
      `INSERT INTO "account" (id, "userId", "accountId", "providerId", "issuer", password, "createdAt", "updatedAt")
       VALUES ($1, $2, $2, 'credential', 'local:credential', $3, now(), now())`,
      [accountId, userId, hashedPassword]
    );

    return Response.json({ user: userRes.rows[0] }, { status: 201 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to create user.";
    console.error("[POST /api/admin/users] Error:", err);
    return Response.json({ error: errorMsg }, { status: 500 });
  }
}
