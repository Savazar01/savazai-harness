import { NextRequest } from "next/server";
import { Pool } from "pg";
import { requirePermission } from "@/lib/auth/rbac";
import { getInternalBackendHeaders } from "@/lib/backend-client";
import { randomUUID } from "node:crypto";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const BACKEND_URL =
  process.env.NEXT_PUBLIC_HARNESS_API_URL || "http://savazai-backend:3055";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ threadId: string }> }
) {
  const permCheck = await requirePermission("agent_workspace", "view");
  if (!permCheck.authorized) {
    return permCheck.response;
  }

  const { threadId } = await props.params;

  // 1. Check PostgreSQL agentflow_thread_memory first (persistent across restarts)
  try {
    const dbRes = await pool.query(
      `SELECT id, role, content, turn_number, created_at 
       FROM agentflow_thread_memory 
       WHERE thread_id = $1 
       ORDER BY turn_number ASC, created_at ASC`,
      [threadId]
    );

    if (dbRes.rows.length > 0) {
      const messages = dbRes.rows
        .filter((r) => r.role === "user" || r.role === "assistant")
        .map((r) => ({
          id: r.id ? String(r.id) : `msg_${r.turn_number}_${Date.now()}`,
          role: r.role as "user" | "assistant",
          content: r.content,
          timestamp: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
        }));

      return new Response(
        JSON.stringify({
          threadId,
          messages,
          source: "database",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  } catch (dbErr) {
    console.warn(`[chat-threads] DB thread memory query failed for ${threadId}:`, dbErr);
  }

  // 2. Fallback to backend in-memory graph state
  try {
    const backendUrl = `${BACKEND_URL}/api/graph/threads/${threadId}`;
    const response = await fetch(backendUrl, {
      headers: getInternalBackendHeaders({ "Content-Type": "application/json" }),
    });

    if (response.ok) {
      const data = await response.json();
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (proxyErr) {
    console.warn(`[chat-threads] Backend proxy query failed for ${threadId}:`, proxyErr);
  }

  // 3. Graceful empty state: Never return a 404 error banner that crashes user workspace
  return new Response(
    JSON.stringify({
      threadId,
      messages: [],
      source: "empty",
      status: "ready",
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}
