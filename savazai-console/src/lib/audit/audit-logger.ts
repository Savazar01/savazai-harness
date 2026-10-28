import { pool, ensureAdminProvisioned } from "@/lib/auth";
import { dispatchGovernanceAlert } from "@/lib/alerts/governance-alerter";

export type AuditCategory =
  | "USER_ADMIN"
  | "COMMAND_CENTER"
  | "BUSINESS_CENTER"
  | "AGENTFLOWS"
  | "AGENTS_ACTIVITY"
  | "ASSET_VERSION"
  | "SYSTEM_CORE";

export interface AuditLogEntry {
  category: AuditCategory;
  action: string;
  resource?: string;
  actorId?: string | null;
  actorEmail?: string | null;
  actorName?: string | null;
  targetId?: string | null;
  targetName?: string | null;
  details?: Record<string, any>;
  ipAddress?: string | null;
}

/**
 * Centrally records an immutable, structured audit entry in system_audit_logs.
 * Safely catches and logs errors so audit writing never breaks core operations.
 */
export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
  try {
    await ensureAdminProvisioned();

    const resource = entry.resource || entry.category.toLowerCase();
    const details = entry.details ? JSON.stringify(entry.details) : "{}";

    await pool.query(
      `INSERT INTO "system_audit_logs" (
        "id", "user_id", "user_email", "category", "action", "resource", "target_id", "target_name", "details", "ip_address", "created_at"
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, now()
      )`,
      [
        entry.actorId || null,
        entry.actorEmail || null,
        entry.category,
        entry.action,
        resource,
        entry.targetId || null,
        entry.targetName || null,
        details,
        entry.ipAddress || null,
      ]
    );

    // Asynchronously dispatch any matched governance alert rules (non-blocking)
    dispatchGovernanceAlert(entry).catch((alertErr) => {
      console.warn("[AuditLogger] Governance alert dispatch notice:", alertErr);
    });
  } catch (err) {
    console.warn("[AuditLogger] Failed to write audit event:", err);
  }
}
