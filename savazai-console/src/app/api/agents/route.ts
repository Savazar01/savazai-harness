import { NextRequest } from "next/server";
import { pool, ensureAdminProvisioned } from "@/lib/auth";
import { requirePermission } from "@/lib/auth/rbac";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { recordPromptRevision } from "@/lib/versioning/asset-versioner";

export const dynamic = "force-dynamic";

export interface AgentCatalogItem {
  id: string;
  agentKey: string;
  name: string;
  role: string;
  description?: string;
  llmProvider: string;
  modelName: string;
  temperature: number;
  systemPrompt: string;
  boundTools: any[];
  boundSkills: any[];
  boundConcepts: any[];
  originType: "agent_builder" | "agentflow";
  originFlowId?: string;
  originFlowTitle?: string;
  isLocked: boolean;
  allowModificationInFlow: boolean;
  usedInFlows?: number;
  createdAt: string;
  updatedAt: string;
}

export async function GET(req: NextRequest) {
  try {
    await ensureAdminProvisioned();

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() || "";
    const role = searchParams.get("role")?.trim() || "";
    const originType = searchParams.get("originType")?.trim() || "";
    const lockedParam = searchParams.get("isLocked");

    const searchPattern = search ? `%${search}%` : null;

    let query = `
      SELECT 
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
      WHERE ($1::text IS NULL OR name ILIKE $1 OR agent_key ILIKE $1 OR description ILIKE $1)
    `;

    const params: any[] = [searchPattern];
    let paramIndex = 2;

    if (role && role !== "all") {
      query += ` AND role = $${paramIndex}`;
      params.push(role);
      paramIndex++;
    }

    if (originType && originType !== "all") {
      query += ` AND origin_type = $${paramIndex}`;
      params.push(originType);
      paramIndex++;
    }

    if (lockedParam === "true") {
      query += ` AND is_locked = true`;
    } else if (lockedParam === "false") {
      query += ` AND is_locked = false`;
    }

    query += ` ORDER BY updated_at DESC`;

    const result = await pool.query(query, params);
    const agents: AgentCatalogItem[] = result.rows;

    // Scan agentflows to compute dynamic usage counts
    let flowsResult: any = { rows: [] };
    try {
      flowsResult = await pool.query('SELECT id, name, canvas_definition FROM agentflows');
    } catch {
      // fallback if table has slightly different column
    }

    const usageMap: Record<string, number> = {};
    for (const flow of flowsResult.rows) {
      let cd = flow.canvas_definition;
      if (typeof cd === "string") {
        try { cd = JSON.parse(cd); } catch { cd = null; }
      }
      if (cd && Array.isArray(cd.nodes)) {
        for (const n of cd.nodes) {
          const catId = n.catalogAgentId || n.id;
          const label = n.label || n.name;
          for (const a of agents) {
            if (a.id === catId || a.agentKey === catId || (label && label === a.name)) {
              usageMap[a.id] = (usageMap[a.id] || 0) + 1;
              break;
            }
          }
        }
      }
    }

    const items = agents.map((a) => ({
      ...a,
      usedInFlows: usageMap[a.id] || 0,
    }));

    return new Response(JSON.stringify({ items, total: items.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[api/agents GET] Error:", err);
    return new Response(JSON.stringify({ error: errMsg || "Failed to fetch agents catalog." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authCheck = await requirePermission("capability_studio", ["create_flow", "edit_flow"]);
    let authContext = authCheck.context;
    if (!authCheck.authorized) {
      const bizCheck = await requirePermission("business_center", "skills_edit");
      if (!bizCheck.authorized) return authCheck.response;
      authContext = bizCheck.context;
    }

    await ensureAdminProvisioned();

    const body = await req.json();

    // Check for flow sync request
    if (body.action === "sync_from_flows") {
      const flowsRes = await pool.query('SELECT id, name, canvas_definition FROM agentflows');
      let createdCount = 0;

      for (const flow of flowsRes.rows) {
        let cd = flow.canvas_definition;
        if (typeof cd === "string") {
          try { cd = JSON.parse(cd); } catch { cd = null; }
        }
        if (cd && Array.isArray(cd.nodes)) {
          for (const node of cd.nodes) {
            if (node.roleTemplate === "team") continue; // Skip team container nodes
            const name = node.label || node.name || "Agent Node";
            const role = node.roleTemplate || "worker";
            const prompt = node.systemPrompt || node.data?.systemPrompt || node.instructions || "";
            if (!prompt || prompt.trim().length === 0) continue;

            const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
            const agentKey = `${slug}-${node.id ? node.id.slice(-6) : Math.random().toString(36).slice(2, 8)}`;

            // Check if already in catalog
            const exists = await pool.query('SELECT id FROM agents_catalog WHERE agent_key = $1 OR name = $2', [agentKey, name]);
            if (exists.rows.length === 0) {
              const id = crypto.randomUUID();
              await pool.query(
                `INSERT INTO agents_catalog (
                  id, agent_key, name, role, description, llm_provider, model_name, temperature,
                  system_prompt, bound_tools, bound_skills, bound_concepts, origin_type,
                  origin_flow_id, origin_flow_title, is_locked, allow_modification_in_flow,
                  created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14, $15, $16, $17, now(), now())`,
                [
                  id,
                  agentKey,
                  name,
                  role,
                  `Imported from flow "${flow.name}"`,
                  node.modelConfig?.provider || "openai",
                  node.modelConfig?.model || "gpt-4o-mini",
                  node.modelConfig?.temperature ?? 0.7,
                  prompt.trim(),
                  JSON.stringify(node.tools || []),
                  JSON.stringify([]),
                  JSON.stringify([]),
                  "agentflow",
                  flow.id,
                  flow.name,
                  false,
                  true,
                ]
              );
              createdCount++;
            }
          }
        }
      }

      return new Response(
        JSON.stringify({ success: true, message: `Synced ${createdCount} new agent(s) from existing agentflows into catalog.` }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const {
      name,
      agentKey: providedKey,
      role = "worker",
      description = "",
      llmProvider = "OpenAI",
      modelName = "gpt-4o-mini",
      temperature = 0.7,
      systemPrompt,
      boundTools = [],
      boundSkills = [],
      boundConcepts = [],
      originType = "agent_builder",
      originFlowId,
      originFlowTitle,
      isLocked = false,
      allowModificationInFlow = true,
    } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return new Response(JSON.stringify({ error: "Agent name is required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!systemPrompt || typeof systemPrompt !== "string" || !systemPrompt.trim()) {
      return new Response(JSON.stringify({ error: "System directive prompt is required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    let agentKey = (providedKey || "").trim();
    if (!agentKey) {
      const baseSlug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      agentKey = `${baseSlug}-${Math.random().toString(36).slice(2, 7)}`;
    }

    // Check duplicate key
    const checkKey = await pool.query('SELECT id FROM agents_catalog WHERE agent_key = $1', [agentKey]);
    if (checkKey.rows.length > 0) {
      agentKey = `${agentKey}-${Math.random().toString(36).slice(2, 6)}`;
    }

    const agentId = crypto.randomUUID();

    await pool.query(
      `INSERT INTO agents_catalog (
        id, agent_key, name, role, description, llm_provider, model_name, temperature,
        system_prompt, bound_tools, bound_skills, bound_concepts, origin_type,
        origin_flow_id, origin_flow_title, is_locked, allow_modification_in_flow,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14, $15, $16, $17, now(), now())`,
      [
        agentId,
        agentKey,
        name.trim(),
        role,
        description.trim(),
        llmProvider,
        modelName,
        temperature,
        systemPrompt.trim(),
        JSON.stringify(boundTools),
        JSON.stringify(boundSkills),
        JSON.stringify(boundConcepts),
        originType,
        originFlowId || null,
        originFlowTitle || null,
        Boolean(isLocked),
        Boolean(allowModificationInFlow),
      ]
    );

    // Snapshot prompt revision v1
    await recordPromptRevision({
      agentId,
      agentName: name.trim(),
      agentRole: role,
      agentflowId: originFlowId || "standalone",
      agentflowTitle: originFlowTitle || "Standalone Agent Builder",
      systemPrompt: systemPrompt.trim(),
      changeSummary: `Created agent "${name.trim()}" in Agent Builder`,
      authorId: authContext?.userId || "unknown",
      authorEmail: authContext?.email || "system@savazai.local",
    }).catch((e) => console.warn("[recordPromptRevision] Initial error:", e));

    await logAuditEvent({
      category: "AGENT_BUILDER",
      action: "AGENT_CREATED",
      resource: "agents_catalog",
      actorId: authContext?.userId || "unknown",
      actorEmail: authContext?.email || "system@savazai.local",
      targetId: agentId,
      targetName: name.trim(),
      details: {
        agentKey,
        role,
        isLocked,
        originType,
      },
    }).catch(console.warn);

    return new Response(JSON.stringify({ success: true, id: agentId, agentKey }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[api/agents POST] Error:", err);
    return new Response(JSON.stringify({ error: errMsg || "Failed to create agent." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
