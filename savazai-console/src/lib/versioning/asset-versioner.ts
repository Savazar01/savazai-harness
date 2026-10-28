import { pool, ensureAdminProvisioned } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit/audit-logger";

export interface RecordAssetRevisionInput {
  assetType: "skill" | "okf_concept" | string;
  assetKey: string;
  version?: string;
  content: string;
  metadataSnapshot?: Record<string, any>;
  authorId: string;
  authorEmail: string;
  changeSummary?: string;
}

export interface RecordPromptRevisionInput {
  agentId: string;
  agentflowId: string;
  systemPrompt: string;
  authorId: string;
  authorEmail: string;
}

/**
 * Records an immutable snapshot of a Skill or OKF Concept into asset_revisions.
 */
export async function recordAssetRevision(input: RecordAssetRevisionInput): Promise<string> {
  await ensureAdminProvisioned();

  try {
    let version = input.version;
    if (!version) {
      const prevRes = await pool.query(
        'SELECT "version" FROM "asset_revisions" WHERE "asset_key" = $1 ORDER BY "created_at" DESC LIMIT 1',
        [input.assetKey]
      );
      if (prevRes.rows.length === 0) {
        version = "v1.0.0";
      } else {
        const lastVer = prevRes.rows[0].version.replace(/^v/, "");
        const parts = lastVer.split(".").map(Number);
        if (parts.length === 3 && !parts.some(isNaN)) {
          version = `v${parts[0]}.${parts[1]}.${parts[2] + 1}`;
        } else {
          version = "v1.1.0";
        }
      }
    }

    const revisionId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO "asset_revisions" (
        "id", "asset_type", "asset_key", "version", "content", "metadata_snapshot", "author_id", "author_email", "change_summary", "created_at"
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, now())`,
      [
        revisionId,
        input.assetType,
        input.assetKey,
        version,
        input.content,
        JSON.stringify(input.metadataSnapshot || {}),
        input.authorId,
        input.authorEmail,
        input.changeSummary || `Updated ${input.assetType} ${input.assetKey} to ${version}`,
      ]
    );

    // Also record audit event
    await logAuditEvent({
      category: "ASSET_VERSION",
      action: "ASSET_REVISED",
      resource: input.assetType,
      actorId: input.authorId,
      actorEmail: input.authorEmail,
      targetId: input.assetKey,
      targetName: input.metadataSnapshot?.name || input.assetKey,
      details: {
        version,
        assetType: input.assetType,
        changeSummary: input.changeSummary,
      },
    });

    return revisionId;
  } catch (err) {
    console.error("[recordAssetRevision] Error saving revision:", err);
    throw err;
  }
}

/**
 * Records an immutable revision of an agent's System Directive Prompt into prompt_revisions.
 */
export async function recordPromptRevision(input: RecordPromptRevisionInput): Promise<string | null> {
  await ensureAdminProvisioned();

  try {
    // Check latest revision to see if prompt actually changed
    const prevRes = await pool.query(
      'SELECT "system_prompt", "version_number" FROM "prompt_revisions" WHERE "agent_id" = $1 AND "agentflow_id" = $2 ORDER BY "version_number" DESC LIMIT 1',
      [input.agentId, input.agentflowId]
    );

    let nextVersionNumber = 1;
    if (prevRes.rows.length > 0) {
      if (prevRes.rows[0].system_prompt === input.systemPrompt) {
        // No change in prompt content
        return null;
      }
      nextVersionNumber = prevRes.rows[0].version_number + 1;
    }

    const revisionId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO "prompt_revisions" (
        "id", "agent_id", "agentflow_id", "version_number", "system_prompt", "author_id", "author_email", "created_at"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
      [
        revisionId,
        input.agentId,
        input.agentflowId,
        nextVersionNumber,
        input.systemPrompt,
        input.authorId,
        input.authorEmail,
      ]
    );

    await logAuditEvent({
      category: "ASSET_VERSION",
      action: "PROMPT_REVISED",
      resource: "agent_prompt",
      actorId: input.authorId,
      actorEmail: input.authorEmail,
      targetId: input.agentId,
      targetName: `Agent ${input.agentId}`,
      details: {
        agentflowId: input.agentflowId,
        versionNumber: nextVersionNumber,
        promptLength: input.systemPrompt.length,
      },
    });

    return revisionId;
  } catch (err) {
    console.error("[recordPromptRevision] Error recording prompt revision:", err);
    throw err;
  }
}
