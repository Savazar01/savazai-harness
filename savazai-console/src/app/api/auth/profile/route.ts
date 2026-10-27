import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { auth, pool, ensureAdminProvisioned } from "@/lib/auth";

export async function PATCH(req: NextRequest) {
  try {
    await ensureAdminProvisioned();
    const reqHeaders = await headers();
    const session = await auth.api.getSession({ headers: reqHeaders });

    if (!session?.user?.id) {
      return Response.json(
        { error: "Unauthorized: Active session required." },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const body = await req.json();
    const { name, location, image } = body;

    const updates: string[] = [];
    const values: (string | null)[] = [];
    let idx = 1;

    if (name !== undefined) {
      if (!name || typeof name !== "string" || !name.trim()) {
        return Response.json({ error: "Full name cannot be empty." }, { status: 400 });
      }
      updates.push(`"name" = $${idx++}`);
      values.push(name.trim());
    }

    if (location !== undefined) {
      updates.push(`"location" = $${idx++}`);
      values.push(location ? String(location).trim() : null);
    }

    if (image !== undefined) {
      // image can be base64 data URL or external URL or null
      updates.push(`"image" = $${idx++}`);
      values.push(image ? String(image).trim() : null);
    }

    if (updates.length === 0) {
      return Response.json({ message: "No profile changes detected." }, { status: 200 });
    }

    updates.push(`"updatedAt" = now()`);
    values.push(userId);

    const query = `
      UPDATE "user"
      SET ${updates.join(", ")}
      WHERE "id" = $${idx}
      RETURNING "id", "name", "email", "image", "location", "role", "status", "updatedAt"
    `;

    const res = await pool.query(query, values);
    const updatedUser = res.rows[0];

    return Response.json(
      {
        success: true,
        message: "Profile updated successfully.",
        user: updatedUser,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    console.error("[PATCH /api/auth/profile] Error:", err);
    const errorMsg = err instanceof Error ? err.message : "Failed to update profile.";
    return Response.json({ error: errorMsg }, { status: 500 });
  }
}
