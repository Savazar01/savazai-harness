import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export interface RenderedEmail {
  subject: string;
  bodyHtml: string;
  bodyMarkdown?: string;
}

/**
 * Universal runtime email template renderer for SavazAI multi-agent flows and notifications.
 * Replaces {{variable}} merge tags with context variables.
 */
export async function renderEmailTemplate(
  templateKey: string,
  context: Record<string, any> = {}
): Promise<RenderedEmail> {
  const res = await pool.query(
    `SELECT subject, body_html, body_markdown, is_active FROM email_templates WHERE template_key = $1 LIMIT 1`,
    [templateKey]
  );

  let rawSubject = "[SavazAI Notification] Execution Update";
  let rawHtml = "<p>Execution update notification.</p>";
  let rawMarkdown = "Execution update notification.";

  if (res.rows.length > 0 && res.rows[0].is_active) {
    rawSubject = res.rows[0].subject || rawSubject;
    rawHtml = res.rows[0].body_html || rawHtml;
    rawMarkdown = res.rows[0].body_markdown || rawMarkdown;
  }

  // Merged context with safe system fallbacks
  const mergedContext: Record<string, string> = {
    agent_name: "Agent Orchestrator",
    workflow_title: "Autonomous Agentflow",
    step_name: "Verification Step",
    approver_email: "operator@enterprise.com",
    review_link: process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/dashboard` : "http://localhost:3056/dashboard",
    execution_id: `exec_${Date.now().toString(36)}`,
    status: "PENDING_APPROVAL",
    timestamp: new Date().toUTCString(),
    company_name: "SavazAI Enterprise",
    platform_title: "SavazAI",
    ...Object.fromEntries(
      Object.entries(context).map(([k, v]) => [k, v !== undefined && v !== null ? String(v) : ""])
    ),
  };

  const replaceTags = (textStr: string): string => {
    return textStr.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key) => {
      return mergedContext[key] !== undefined ? mergedContext[key] : `{{${key}}}`;
    });
  };

  return {
    subject: replaceTags(rawSubject),
    bodyHtml: replaceTags(rawHtml),
    bodyMarkdown: replaceTags(rawMarkdown),
  };
}
