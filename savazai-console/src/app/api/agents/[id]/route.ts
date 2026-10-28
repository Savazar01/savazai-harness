import { NextRequest } from "next/server";
import { pool, ensureAdminProvisioned } from "@/lib/auth";
import { requirePermission } from "@/lib/auth/rbac";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { recordPromptRevision } from "@/lib/versioning/asset-versioner";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureAdminProvisioned();
    const { id } = await params;

    const res = await pool.query(
      `SELECT 
        id,
        agent_key as "agentKey",
        name,
        role,
        description,
        llm_provider as "llmProvider",
        model_name as "modelName",
        temperature,
        system_prompt as "systemPrompt",
        bound_tools as "boundTools",
        bound_skills as "boundSkills",
        bound_concepts as "boundConcepts",
        origin_type as "originType",
        origin_flow_id as "originFlowId",
        origin_flow_title as "originFlowTitle",
        is_locked as "isLocked",
        allow_modification_in_flow as "allowModificationInFlow",
        created_at as "createdAt",
        updated_at as "updatedAt"
       FROM agents_catalog
       WHERE id = $1 OR agent_key = $1`,
      [id]
    );

    if (res.rows.length === 0) {
      return new Response(JSON.stringify({ error: "Agent not found." }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(res.rows[0]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await requirePermission("capability_studio", ["edit_flow", "create_flow"]);
    let authContext = authCheck.context;
    if (!authCheck.authorized) {
      const bizCheck = await requirePermission("business_center", "skills_edit");
      if (!bizCheck.authorized) return authCheck.response;
      authContext = bizCheck.context;
    }

    await ensureAdminProvisioned();
    const { id } = await params;
    const body = await req.json();

    const curRes = await pool.query(
      `SELECT id, agent_key, name, role, system_prompt, origin_flow_id, origin_flow_title FROM agents_catalog WHERE id = $1`,
      [id]
    );
    if (curRes.rows.length === 0) {
      return new Response(JSON.stringify({ error: "Agent not found." }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    const current = curRes.rows[0];

    const {
      name = current.name,
      role = current.role,
      description,
      llmProvider,
      modelName,
      temperature,
      systemPrompt = current.system_prompt,
      boundTools,
      boundSkills,
      boundConcepts,
      isLocked,
      allowModificationInFlow,
    } = body;

    await pool.query(
      `UPDATE agents_catalog SET
        name = COALESCE($1, name),
        role = COALESCE($2, role),
        description = COALESCE($3, description),
        llm_provider = COALESCE($4, llm_provider),
        model_name = COALESCE($5, model_name),
        temperature = COALESCE($6, temperature),
        system_prompt = COALESCE($7, system_prompt),
        bound_tools = CASE WHEN $8::jsonb IS NOT NULL THEN $8::jsonb ELSE bound_tools END,
        bound_skills = CASE WHEN $9::jsonb IS NOT NULL THEN $9::jsonb ELSE bound_skills END,
        bound_concepts = CASE WHEN $10::jsonb IS NOT NULL THEN $10::jsonb ELSE bound_concepts END,
        is_locked = COALESCE($11, is_locked),
        allow_modification_in_flow = COALESCE($12, allow_modification_in_flow),
        updated_at = now()
       WHERE id = $13`,
      [
        name,
        role,
        description !== undefined ? description : null,
        llmProvider !== undefined ? llmProvider : null,
        modelName !== undefined ? modelName : null,
        temperature !== undefined ? temperature : null,
        systemPrompt,
        boundTools !== undefined ? JSON.stringify(boundTools) : null,
        boundSkills !== undefined ? JSON.stringify(boundSkills) : null,
        boundConcepts !== undefined ? JSON.stringify(boundConcepts) : null,
        isLocked !== undefined ? Boolean(isLocked) : null,
        allowModificationInFlow !== undefined ? Boolean(allowModificationInFlow) : null,
        id,
      ]
    );

    // If prompt changed, record prompt revision
    if (systemPrompt && systemPrompt.trim() !== current.system_prompt.trim()) {
      await recordPromptRevision({
        agentId: id,
        agentName: name,
        agentRole: role,
        agentflowId: current.origin_flow_id || "standalone",
        agentflowTitle: current.origin_flow_title || "Agent Builder",
        systemPrompt: systemPrompt.trim(),
        changeSummary: body.changeSummary || `Updated prompt for agent "${name}" in Agent Builder`,
        authorId: authContext?.userId || "unknown",
        authorEmail: authContext?.email || "system@savazai.local",
      }).catch((e) => console.warn("[recordPromptRevision] update error:", e));
    }

    await logAuditEvent({
      category: "AGENT_BUILDER",
      action: "AGENT_UPDATED",
      resource: "agents_catalog",
      actorId: authContext?.userId || "unknown",
      actorEmail: authContext?.email || "system@savazai.local",
      targetId: id,
      targetName: name,
      details: {
        role,
        isLocked,
        promptChanged: systemPrompt.trim() !== current.system_prompt.trim(),
      },
    }).catch(console.warn);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[api/agents/[id] PUT] Error:", err);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await requirePermission("capability_studio", "delete_flow");
    let authContext = authCheck.context;
    if (!authCheck.authorized) {
      const bizCheck = await requirePermission("business_center", "skills_edit");
      if (!bizCheck.authorized) return authCheck.response;
      authContext = bizCheck.context;
    }

    await ensureAdminProvisioned();
    const { id } = await params;

    const curRes = await pool.query(`SELECT id, name, is_locked FROM agents_catalog WHERE id = $1`, [id]);
    if (curRes.rows.length === 0) {
      return new Response(JSON.stringify({ error: "Agent not found." }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const agent = curRes.rows[0];
    if (agent.is_locked) {
      return new Response(
        JSON.stringify({ error: "Cannot delete an Enterprise-locked agent. Unlock policy first." }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    await pool.query(`DELETE FROM agents_catalog WHERE id = $1`, [id]);

    await logAuditEvent({
      category: "AGENT_BUILDER",
      action: "AGENT_DELETED",
      resource: "agents_catalog",
      actorId: authContext?.userId || "unknown",
      actorEmail: authContext?.email || "system@savazai.local",
      targetId: id,
      targetName: agent.name,
      details: {},
    }).catch(console.warn);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
