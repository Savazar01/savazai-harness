import { NextRequest } from "next/server";
import { pool, ensureAdminProvisioned } from "@/lib/auth";
import { requirePermission } from "@/lib/auth/rbac";

export async function GET(req: NextRequest) {
  try {
    const check = await requirePermission("governance", "view");
    if (!check.authorized) return check.response;

    await ensureAdminProvisioned();

    const { searchParams } = new URL(req.url);
    const tab = searchParams.get("tab") || "user_admin";
    const rawSearch = searchParams.get("search")?.trim() || "";
    const searchParam = rawSearch ? `%${rawSearch}%` : null;
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10), 1), 500);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

    // Single comparison endpoint helper
    const action = searchParams.get("action");
    if (action === "compare") {
      const type = searchParams.get("type"); // "asset" | "prompt"
      const id = searchParams.get("id");
      if (!id) {
        return new Response(JSON.stringify({ error: "Missing revision id." }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (type === "prompt") {
        const curRes = await pool.query(
          `SELECT id, agent_id, agent_name, agent_role, agentflow_id, agentflow_title,
                  version_number, system_prompt, change_summary, prompt_length_chars,
                  author_id, author_email, created_at
           FROM prompt_revisions WHERE id = $1`,
          [id]
        );
        if (curRes.rows.length === 0) {
          return new Response(JSON.stringify({ error: "Revision not found." }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        const current = curRes.rows[0];
        const prevRes = await pool.query(
          `SELECT id, agent_id, agent_name, agent_role, agentflow_id, agentflow_title,
                  version_number, system_prompt, change_summary, prompt_length_chars,
                  author_id, author_email, created_at
           FROM prompt_revisions
           WHERE agent_id = $1 AND agentflow_id = $2 AND version_number < $3
           ORDER BY version_number DESC
           LIMIT 1`,
          [current.agent_id, current.agentflow_id, current.version_number]
        );
        return new Response(
          JSON.stringify({
            current,
            previous: prevRes.rows[0] || null,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      } else {
        // Asset revision
        const curRes = await pool.query(
          `SELECT id, asset_type, asset_key, version, content, metadata_snapshot, author_id, author_email, change_summary, created_at
           FROM asset_revisions WHERE id = $1`,
          [id]
        );
        if (curRes.rows.length === 0) {
          return new Response(JSON.stringify({ error: "Revision not found." }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        const current = curRes.rows[0];
        const prevRes = await pool.query(
          `SELECT id, asset_type, asset_key, version, content, metadata_snapshot, author_id, author_email, change_summary, created_at
           FROM asset_revisions
           WHERE asset_key = $1 AND created_at < $2
           ORDER BY created_at DESC
           LIMIT 1`,
          [current.asset_key, current.created_at]
        );
        return new Response(
          JSON.stringify({
            current,
            previous: prevRes.rows[0] || null,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    if (tab === "user_admin") {
      const countRes = await pool.query(
        `SELECT COUNT(*) as total FROM system_audit_logs
         WHERE category = 'USER_ADMIN'
           AND ($1::text IS NULL OR action ILIKE $1 OR user_email ILIKE $1 OR target_name ILIKE $1 OR target_id ILIKE $1)`,
        [searchParam]
      );
      const rowsRes = await pool.query(
        `SELECT id, category, action, resource, target_id as "targetId", target_name as "targetName",
                details, ip_address as "ipAddress", user_id as "actorId", user_email as "actorEmail", created_at as "createdAt"
         FROM system_audit_logs
         WHERE category = 'USER_ADMIN'
           AND ($1::text IS NULL OR action ILIKE $1 OR user_email ILIKE $1 OR target_name ILIKE $1 OR target_id ILIKE $1)
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [searchParam, limit, offset]
      );
      return new Response(
        JSON.stringify({ items: rowsRes.rows, total: parseInt(countRes.rows[0].total, 10) }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (tab === "command_center") {
      const countRes = await pool.query(
        `SELECT COUNT(*) as total FROM system_audit_logs
         WHERE category = 'COMMAND_CENTER'
           AND ($1::text IS NULL OR action ILIKE $1 OR user_email ILIKE $1 OR target_name ILIKE $1 OR target_id ILIKE $1 OR resource ILIKE $1)`,
        [searchParam]
      );
      const rowsRes = await pool.query(
        `SELECT id, category, action, resource, target_id as "targetId", target_name as "targetName",
                details, ip_address as "ipAddress", user_id as "actorId", user_email as "actorEmail", created_at as "createdAt"
         FROM system_audit_logs
         WHERE category = 'COMMAND_CENTER'
           AND ($1::text IS NULL OR action ILIKE $1 OR user_email ILIKE $1 OR target_name ILIKE $1 OR target_id ILIKE $1 OR resource ILIKE $1)
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [searchParam, limit, offset]
      );
      return new Response(
        JSON.stringify({ items: rowsRes.rows, total: parseInt(countRes.rows[0].total, 10) }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (tab === "business_center") {
      const countRes = await pool.query(
        `SELECT COUNT(*) as total FROM system_audit_logs
         WHERE (category IN ('BUSINESS_CENTER', 'ASSET_VERSION') OR resource IN ('skills', 'okf_concepts', 'email_templates'))
           AND ($1::text IS NULL OR action ILIKE $1 OR user_email ILIKE $1 OR target_name ILIKE $1 OR target_id ILIKE $1 OR resource ILIKE $1)`,
        [searchParam]
      );
      const rowsRes = await pool.query(
        `SELECT id, category, action, resource, target_id as "targetId", target_name as "targetName",
                details, ip_address as "ipAddress", user_id as "actorId", user_email as "actorEmail", created_at as "createdAt"
         FROM system_audit_logs
         WHERE (category IN ('BUSINESS_CENTER', 'ASSET_VERSION') OR resource IN ('skills', 'okf_concepts', 'email_templates'))
           AND ($1::text IS NULL OR action ILIKE $1 OR user_email ILIKE $1 OR target_name ILIKE $1 OR target_id ILIKE $1 OR resource ILIKE $1)
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [searchParam, limit, offset]
      );
      return new Response(
        JSON.stringify({ items: rowsRes.rows, total: parseInt(countRes.rows[0].total, 10) }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (tab === "agentflows") {
      const countRes = await pool.query(
        `SELECT COUNT(*) as total FROM system_audit_logs
         WHERE category = 'AGENTFLOWS'
           AND ($1::text IS NULL OR action ILIKE $1 OR user_email ILIKE $1 OR target_name ILIKE $1 OR target_id ILIKE $1)`,
        [searchParam]
      );
      const rowsRes = await pool.query(
        `SELECT id, category, action, resource, target_id as "targetId", target_name as "targetName",
                details, ip_address as "ipAddress", user_id as "actorId", user_email as "actorEmail", created_at as "createdAt"
         FROM system_audit_logs
         WHERE category = 'AGENTFLOWS'
           AND ($1::text IS NULL OR action ILIKE $1 OR user_email ILIKE $1 OR target_name ILIKE $1 OR target_id ILIKE $1)
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [searchParam, limit, offset]
      );
      return new Response(
        JSON.stringify({ items: rowsRes.rows, total: parseInt(countRes.rows[0].total, 10) }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (tab === "agents_activity") {
      const countRes = await pool.query(
        `SELECT COUNT(*) as total FROM telemetry_logs
         WHERE ($1::text IS NULL OR provider ILIKE $1 OR model_name ILIKE $1)`,
        [searchParam]
      );
      const rowsRes = await pool.query(
        `SELECT id, chat_id as "chatId", provider, model_name as "modelName",
                input_tokens as "inputTokens", output_tokens as "outputTokens",
                reasoning_tokens as "reasoningTokens", execution_latency_ms as "executionLatencyMs",
                executed_mcp_tools as "executedMcpTools", transaction_cost as "transactionCost",
                created_at as "createdAt"
         FROM telemetry_logs
         WHERE ($1::text IS NULL OR provider ILIKE $1 OR model_name ILIKE $1)
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [searchParam, limit, offset]
      );
      return new Response(
        JSON.stringify({ items: rowsRes.rows, total: parseInt(countRes.rows[0].total, 10) }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (tab === "asset_revisions") {
      const countRes = await pool.query(
        `SELECT COUNT(*) as total FROM asset_revisions
         WHERE ($1::text IS NULL OR asset_key ILIKE $1 OR asset_type ILIKE $1 OR author_email ILIKE $1 OR change_summary ILIKE $1)`,
        [searchParam]
      );
      const rowsRes = await pool.query(
        `SELECT id, asset_type as "assetType", asset_key as "assetKey", version, content,
                metadata_snapshot as "metadataSnapshot", author_id as "authorId",
                author_email as "authorEmail", change_summary as "changeSummary", created_at as "createdAt"
         FROM asset_revisions
         WHERE ($1::text IS NULL OR asset_key ILIKE $1 OR asset_type ILIKE $1 OR author_email ILIKE $1 OR change_summary ILIKE $1)
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [searchParam, limit, offset]
      );
      return new Response(
        JSON.stringify({ items: rowsRes.rows, total: parseInt(countRes.rows[0].total, 10) }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (tab === "prompt_revisions") {
      const countRes = await pool.query(
        `SELECT COUNT(*) as total FROM prompt_revisions
         WHERE ($1::text IS NULL OR agent_id ILIKE $1 OR agent_name ILIKE $1 OR agentflow_id ILIKE $1 OR agentflow_title ILIKE $1 OR author_email ILIKE $1)`,
        [searchParam]
      );
      const rowsRes = await pool.query(
        `SELECT id, agent_id as "agentId", agent_name as "agentName", agent_role as "agentRole",
                agentflow_id as "agentflowId", agentflow_title as "agentflowTitle",
                version_number as "versionNumber", system_prompt as "systemPrompt",
                change_summary as "changeSummary", prompt_length_chars as "promptLengthChars",
                author_id as "authorId", author_email as "authorEmail", created_at as "createdAt"
         FROM prompt_revisions
         WHERE ($1::text IS NULL OR agent_id ILIKE $1 OR agent_name ILIKE $1 OR agentflow_id ILIKE $1 OR agentflow_title ILIKE $1 OR author_email ILIKE $1)
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [searchParam, limit, offset]
      );
      return new Response(
        JSON.stringify({ items: rowsRes.rows, total: parseInt(countRes.rows[0].total, 10) }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: `Unknown tab: ${tab}` }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[api-governance-audit] Error:", err);
    return new Response(
      JSON.stringify({ error: errMsg || "Failed to retrieve governance audit records." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
