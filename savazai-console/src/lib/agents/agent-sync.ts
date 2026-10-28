import { pool } from "@/lib/auth";
import { recordPromptRevision } from "@/lib/versioning/asset-versioner";

export interface SyncResult {
  syncedCount: number;
  totalAgents: number;
  totalFlows: number;
  message: string;
}

export async function syncFlowAgentsToCatalog(): Promise<SyncResult> {
  let flowsRes: any = { rows: [] };
  try {
    flowsRes = await pool.query("SELECT id, name, canvas_definition FROM agentflows");
  } catch (err) {
    console.error("[syncFlowAgentsToCatalog] Error querying agentflows:", err);
    return {
      syncedCount: 0,
      totalAgents: 0,
      totalFlows: 0,
      message: "Failed to query agentflows.",
    };
  }

  let createdCount = 0;

  for (const flow of flowsRes.rows) {
    let cd = flow.canvas_definition;
    if (typeof cd === "string") {
      try {
        cd = JSON.parse(cd);
      } catch {
        cd = null;
      }
    }
    if (!cd || !Array.isArray(cd.nodes)) continue;

    for (const node of cd.nodes) {
      if (node.roleTemplate === "team") continue; // Skip team container nodes
      const name = (node.label || node.name || "").trim();
      if (!name) continue;

      const role = node.roleTemplate || "worker";
      const prompt = (node.systemPrompt || node.data?.systemPrompt || node.instructions || "").trim();
      const tools = Array.isArray(node.tools) ? node.tools : [];
      const provider = node.modelConfig?.provider || "openai";
      const model = node.modelConfig?.model || "gpt-4o-mini";
      const temperature = typeof node.modelConfig?.temperature === "number" ? node.modelConfig.temperature : 0.7;

      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const nodeSuffix = node.id ? String(node.id).slice(-6) : Math.random().toString(36).slice(2, 8);
      const agentKey = `${slug}-${nodeSuffix}`;

      // Check if already in catalog by name or agent_key
      const existing = await pool.query(
        "SELECT id, system_prompt FROM agents_catalog WHERE name = $1 OR agent_key = $2",
        [name, agentKey]
      );

      let agentId: string;
      if (existing.rows.length === 0) {
        agentId = crypto.randomUUID();
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
            name,
            role,
            `Imported from flow "${flow.name}"`,
            provider,
            model,
            temperature,
            prompt || `Agent imported from flow "${flow.name}"`,
            JSON.stringify(tools),
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

        // Snapshot initial prompt revision
        if (prompt) {
          await recordPromptRevision({
            agentId,
            agentName: name,
            agentRole: role,
            agentflowId: flow.id,
            agentflowTitle: flow.name,
            systemPrompt: prompt,
            changeSummary: `Auto-ingested from Agentflow "${flow.name}" into universal catalog`,
            authorId: "system",
            authorEmail: "system@savazai.local",
          }).catch((err) => console.warn("[syncFlowAgentsToCatalog recordPromptRevision]:", err));
        }
      }
    }
  }

  const countRes = await pool.query("SELECT count(*)::int as count FROM agents_catalog");
  const totalAgents = countRes.rows[0]?.count || 0;

  return {
    syncedCount: createdCount,
    totalAgents,
    totalFlows: flowsRes.rows.length,
    message: createdCount > 0
      ? `Successfully synced ${createdCount} agent(s) from existing agentflows into catalog.`
      : `Agent catalog is up to date (${totalAgents} agents registered across ${flowsRes.rows.length} flows).`,
  };
}
