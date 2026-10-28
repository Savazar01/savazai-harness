import { pool } from "@/lib/auth";
import { sendEmail } from "@/lib/email/transporter";

export interface GovernanceAlertRule {
  id: string;
  name: string;
  enabled: boolean;
  eventPattern: string; // e.g. "LLM_PROVIDER_UPDATED", "ROLE_*", "SETTINGS_UPDATED", "PROMPT_*", "*"
  severityThreshold: "all" | "critical" | "warning";
  recipientEmails: string[];
  createdAt: string;
}

export const DEFAULT_ALERT_RULES: GovernanceAlertRule[] = [
  {
    id: "rule-llm-models",
    name: "LLM Providers & Models Mutation Alert",
    enabled: true,
    eventPattern: "LLM_PROVIDER_*",
    severityThreshold: "warning",
    recipientEmails: [],
    createdAt: new Date().toISOString(),
  },
  {
    id: "rule-roles-security",
    name: "User Role & Permissions Elevation Alert",
    enabled: true,
    eventPattern: "ROLE_*",
    severityThreshold: "critical",
    recipientEmails: [],
    createdAt: new Date().toISOString(),
  },
  {
    id: "rule-system-prompt",
    name: "System Prompt Revision Alert",
    enabled: true,
    eventPattern: "PROMPT_*",
    severityThreshold: "all",
    recipientEmails: [],
    createdAt: new Date().toISOString(),
  },
];

export async function getAlertRules(): Promise<GovernanceAlertRule[]> {
  try {
    const res = await pool.query("SELECT design_tokens FROM system_configurations LIMIT 1");
    if (res.rows.length === 0) return DEFAULT_ALERT_RULES;
    const tokens = res.rows[0].design_tokens || {};
    if (Array.isArray(tokens.governanceAlertRules) && tokens.governanceAlertRules.length > 0) {
      return tokens.governanceAlertRules;
    }
    return DEFAULT_ALERT_RULES;
  } catch (err) {
    console.error("[getAlertRules] Error reading rules:", err);
    return DEFAULT_ALERT_RULES;
  }
}

export async function saveAlertRules(rules: GovernanceAlertRule[]): Promise<boolean> {
  try {
    const res = await pool.query("SELECT id, design_tokens FROM system_configurations LIMIT 1");
    if (res.rows.length === 0) return false;
    const configId = res.rows[0].id;
    const tokens = res.rows[0].design_tokens || {};
    tokens.governanceAlertRules = rules;

    await pool.query("UPDATE system_configurations SET design_tokens = $1, updated_at = now() WHERE id = $2", [
      JSON.stringify(tokens),
      configId,
    ]);
    return true;
  } catch (err) {
    console.error("[saveAlertRules] Error saving rules:", err);
    return false;
  }
}

/**
 * Ensures the standardized governance alert email template is seeded in email_templates table
 */
export async function ensureAlertEmailTemplate(): Promise<void> {
  try {
    const check = await pool.query("SELECT id FROM email_templates WHERE template_key = 'governance_alert_notification'");
    if (check.rows.length === 0) {
      const templateId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO email_templates (
          id, template_key, name, description, subject, body_html, body_text, variables, category, is_active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, true, now(), now())`,
        [
          templateId,
          "governance_alert_notification",
          "Governance Critical Mutation Alert",
          "Automated real-time notification sent to administrators when platform settings, LLM models, roles, or prompts are mutated.",
          "⚠️ Governance Alert: {{event_name}} on {{target_resource}}",
          `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;">
            <div style="border-bottom: 2px solid #6366f1; padding-bottom: 12px; margin-bottom: 20px;">
              <h2 style="color: #0f172a; margin: 0; font-size: 20px;">SavazAI Governance Alert</h2>
              <p style="color: #64748b; margin: 4px 0 0 0; font-size: 13px;">Tamper-Evident Operational Audit Notification</p>
            </div>
            
            <p style="font-size: 14px; color: #334155; line-height: 1.5;">
              A monitored configuration or security mutation was registered on the platform:
            </p>

            <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px;">
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 8px 0; color: #64748b; font-weight: 600; width: 140px;">Event Action:</td>
                <td style="padding: 8px 0; color: #0f172a; font-weight: bold;">{{event_name}}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Target Resource:</td>
                <td style="padding: 8px 0; color: #0f172a;">{{target_resource}}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Actor Email:</td>
                <td style="padding: 8px 0; color: #0f172a;">{{actor_email}}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Timestamp:</td>
                <td style="padding: 8px 0; color: #0f172a;">{{timestamp}}</td>
              </tr>
            </table>

            <div style="background: #f8fafc; border-left: 4px solid #6366f1; padding: 12px; margin: 16px 0; border-radius: 4px;">
              <div style="font-size: 12px; font-weight: bold; color: #475569; margin-bottom: 4px;">Change Summary / Delta:</div>
              <div style="font-size: 13px; color: #0f172a; font-family: monospace; white-space: pre-wrap;">{{change_summary}}</div>
            </div>

            <div style="margin-top: 24px; text-align: center;">
              <a href="{{review_link}}" style="display: inline-block; background: #6366f1; color: #ffffff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: bold;">
                Review in Governance Hub →
              </a>
            </div>

            <p style="margin-top: 24px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 12px;">
              Automated dispatch from SavazAI Platform Governance & Compliance Hub.
            </p>
          </div>`,
          "SavazAI Governance Alert\nEvent: {{event_name}}\nTarget: {{target_resource}}\nActor: {{actor_email}}\nTimestamp: {{timestamp}}\n\nChange Summary:\n{{change_summary}}\n\nReview: {{review_link}}",
          JSON.stringify([
            { key: "event_name", label: "Event Name", description: "Audit event action identifier" },
            { key: "target_resource", label: "Target Resource", description: "Target entity or configuration" },
            { key: "actor_email", label: "Actor Email", description: "Email of user executing change" },
            { key: "change_summary", label: "Change Summary", description: "Detailed key delta diff summary" },
            { key: "timestamp", label: "Timestamp", description: "ISO date timestamp of event" },
            { key: "review_link", label: "Review Link", description: "Direct URL to Governance ledger" },
          ]),
          "governance",
        ]
      );
    }
  } catch (err) {
    console.warn("[ensureAlertEmailTemplate] Template seeding notice:", err);
  }
}

/**
 * Dispatches automated alert notification if the event matches any active alert rule
 */
export async function dispatchGovernanceAlert(event: {
  action: string;
  category: string;
  resource?: string;
  targetName?: string;
  actorEmail?: string;
  details?: Record<string, any>;
}): Promise<void> {
  try {
    await ensureAlertEmailTemplate();
    const rules = await getAlertRules();
    const activeRules = rules.filter((r) => r.enabled && r.recipientEmails && r.recipientEmails.length > 0);

    if (activeRules.length === 0) return;

    for (const rule of activeRules) {
      const pattern = rule.eventPattern.trim().toUpperCase();
      const action = event.action.toUpperCase();

      let isMatch = false;
      if (pattern === "*" || pattern === "ALL") {
        isMatch = true;
      } else if (pattern.endsWith("*")) {
        const prefix = pattern.slice(0, -1);
        isMatch = action.startsWith(prefix);
      } else {
        isMatch = action === pattern;
      }

      if (isMatch) {
        // Build change summary
        let summary = "";
        if (event.details?.changes && Array.isArray(event.details.changes)) {
          summary = event.details.changes
            .map((c: any) => `• [${c.changeType.toUpperCase()}] ${c.label || c.field}: ${JSON.stringify(c.oldValue)} → ${JSON.stringify(c.newValue)}`)
            .join("\n");
        } else if (typeof event.details === "object") {
          summary = JSON.stringify(event.details, null, 2);
        } else {
          summary = String(event.details || "No details payload");
        }

        const appUrl = process.env.NEXT_PUBLIC_HARNESS_API_URL || "http://localhost:3056";
        const reviewLink = `${appUrl}/admin/governance`;

        // Fetch template
        let templateRes: any = { rows: [] };
        try {
          templateRes = await pool.query(
            "SELECT subject, body_html FROM email_templates WHERE template_key = 'governance_alert_notification'"
          );
        } catch {}

        let subject = `⚠️ Governance Alert: ${event.action} on ${event.targetName || event.resource || "System"}`;
        let htmlBody = `<p>Governance Event: <strong>${event.action}</strong> on ${event.targetName || event.resource}</p><pre>${summary}</pre>`;

        if (templateRes.rows.length > 0) {
          const tpl = templateRes.rows[0];
          subject = tpl.subject
            .replace(/{{event_name}}/g, event.action)
            .replace(/{{target_resource}}/g, event.targetName || event.resource || "System");

          htmlBody = tpl.body_html
            .replace(/{{event_name}}/g, event.action)
            .replace(/{{target_resource}}/g, event.targetName || event.resource || "System")
            .replace(/{{actor_email}}/g, event.actorEmail || "System")
            .replace(/{{timestamp}}/g, new Date().toLocaleString())
            .replace(/{{change_summary}}/g, summary)
            .replace(/{{review_link}}/g, reviewLink);
        }

        // Send to each configured recipient
        for (const recipient of rule.recipientEmails) {
          if (recipient && recipient.includes("@")) {
            await sendEmail({
              to: recipient.trim(),
              subject,
              html: htmlBody,
              templateKey: "governance_alert_notification",
            }).catch((err) => console.warn(`[dispatchGovernanceAlert] Email to ${recipient} failed:`, err));
          }
        }
      }
    }
  } catch (err) {
    console.warn("[dispatchGovernanceAlert] Error:", err);
  }
}
