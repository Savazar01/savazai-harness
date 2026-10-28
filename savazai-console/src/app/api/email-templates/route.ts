import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { requirePermission } from "@/lib/auth/rbac";
import crypto from "crypto";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function ensureTableAndSeed() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "email_templates" (
      "id" TEXT PRIMARY KEY,
      "template_key" VARCHAR(128) NOT NULL UNIQUE,
      "name" VARCHAR(256) NOT NULL,
      "category" VARCHAR(64) NOT NULL,
      "description" TEXT,
      "subject" TEXT NOT NULL,
      "body_html" TEXT NOT NULL,
      "body_markdown" TEXT,
      "supported_variables" JSONB DEFAULT '[]',
      "is_active" BOOLEAN NOT NULL DEFAULT true,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "email_templates_category_idx" ON "email_templates"("category");
  `);

  const countRes = await pool.query(`SELECT count(*)::int as count FROM "email_templates"`);
  if (countRes.rows[0].count === 0) {
    const seedTemplates = [
      {
        id: crypto.randomUUID(),
        template_key: "hitl_approval_request",
        name: "Human-in-the-Loop Plan Approval Request",
        category: "approval",
        description: "Dispatched to designated reviewers when an agentflow pauses awaiting human approval before worker execution.",
        subject: "[Action Required] Approval Needed for Agentflow {{agentflow_title}} - {{execution_id}}",
        body_html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
  <div style="margin-bottom: 20px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
    <h2 style="color: #0f172a; margin: 0 0 4px 0; font-size: 20px;">Execution Plan Approval Request</h2>
    <p style="color: #64748b; margin: 0; font-size: 13px;">Agentflow: <strong>{{agentflow_title}}</strong></p>
  </div>
  <p style="color: #334155; font-size: 14px; line-height: 1.6;">Hello,</p>
  <p style="color: #334155; font-size: 14px; line-height: 1.6;">Supervisor agent <strong>{{agent_name}}</strong> has formulated an autonomous execution plan for step <code>{{step_name}}</code> and paused at the Human-in-the-Loop boundary awaiting your authorization.</p>
  <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin: 20px 0;">
    <p style="margin: 0 0 6px 0; font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase;">Execution Reference</p>
    <p style="margin: 0; font-size: 13px; font-family: monospace; color: #0f172a;">ID: {{execution_id}} | Status: {{status}}</p>
    <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">Timestamp: {{timestamp}}</p>
  </div>
  <div style="text-align: center; margin: 28px 0;">
    <a href="{{review_link}}" style="background: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">Review &amp; Authorize Plan</a>
  </div>
  <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px;">Sent securely by {{company_name}} &bull; {{platform_title}} Orchestration Engine</p>
</div>`,
        body_markdown: `## Execution Plan Approval Request\n\nSupervisor agent **{{agent_name}}** has formulated an execution plan for step **{{step_name}}** in Agentflow **{{agentflow_title}}**.\n\n- **Execution ID**: \`{{execution_id}}\`\n- **Status**: {{status}}\n- **Timestamp**: {{timestamp}}\n\nPlease review and approve: [Open Approval Portal]({{review_link}})`,
        supported_variables: JSON.stringify([
          "agent_name",
          "agentflow_title",
          "workflow_title",
          "step_name",
          "approver_email",
          "review_link",
          "execution_id",
          "status",
          "timestamp",
          "company_name",
          "company_email",
          "company_phone",
          "company_address",
          "platform_title"
        ]),
      },
      {
        id: crypto.randomUUID(),
        template_key: "agentflow_execution_success",
        name: "Agentflow Execution Success Report",
        category: "agentflow_result",
        description: "Sent to stakeholders when an enterprise agentflow completes execution with verified ground-truth receipts.",
        subject: "[Execution Complete] Agentflow {{agentflow_title}} Finished Successfully",
        body_html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
  <div style="margin-bottom: 20px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
    <span style="background: #dcfce7; color: #15803d; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 999px; text-transform: uppercase;">Completed</span>
    <h2 style="color: #0f172a; margin: 10px 0 4px 0; font-size: 20px;">{{agentflow_title}} Completed</h2>
    <p style="color: #64748b; margin: 0; font-size: 13px;">Execution ID: <code>{{execution_id}}</code></p>
  </div>
  <p style="color: #334155; font-size: 14px; line-height: 1.6;">All worker agent tasks and tool integrations have successfully finished without execution errors.</p>
  <div style="text-align: center; margin: 24px 0;">
    <a href="{{review_link}}" style="background: #0f172a; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 13px; display: inline-block;">View Ground-Truth Receipts</a>
  </div>
  <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px;">Automated dispatch by {{company_name}}</p>
</div>`,
        body_markdown: `### Agentflow Completed: {{agentflow_title}}\n\nExecution \`{{execution_id}}\` has completed successfully at {{timestamp}}.\n\n[View Full Receipts]({{review_link}})`,
        supported_variables: JSON.stringify([
          "agentflow_title",
          "workflow_title",
          "execution_id",
          "review_link",
          "status",
          "timestamp",
          "company_name"
        ]),
      },
      {
        id: crypto.randomUUID(),
        template_key: "agent_escalation_alert",
        name: "Agent Execution Escalation Alert",
        category: "system_alert",
        description: "Alert dispatched when a specialist agent encounters non-negotiable policy constraints or tool execution errors.",
        subject: "[Alert] Supervisor Escalation on Step {{step_name}} - {{execution_id}}",
        body_html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #fecdd3; border-radius: 12px; background: #ffffff;">
  <div style="margin-bottom: 20px; border-bottom: 1px solid #ffe4e6; padding-bottom: 12px;">
    <span style="background: #fee2e2; color: #b91c1c; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 999px; text-transform: uppercase;">System Escalation</span>
    <h2 style="color: #991b1b; margin: 10px 0 4px 0; font-size: 20px;">Agent Execution Exception</h2>
    <p style="color: #64748b; margin: 0; font-size: 13px;">Agent: <strong>{{agent_name}}</strong> | Step: <code>{{step_name}}</code></p>
  </div>
  <p style="color: #334155; font-size: 14px; line-height: 1.6;">A policy constraint violation or unrecoverable worker tool failure occurred during workflow <strong>{{workflow_title}}</strong>.</p>
  <div style="text-align: center; margin: 24px 0;">
    <a href="{{review_link}}" style="background: #dc2626; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 13px; display: inline-block;">Open Incident Trace</a>
  </div>
  <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px;">{{company_name}} &bull; Enterprise Incident Response</p>
</div>`,
        body_markdown: `### Agent Escalation: {{workflow_title}}\n\nAgent **{{agent_name}}** triggered an escalation on step **{{step_name}}**.\n\n- **Execution ID**: \`{{execution_id}}\`\n- **Timestamp**: {{timestamp}}\n\n[Open Incident]({{review_link}})`,
        supported_variables: JSON.stringify([
          "agent_name",
          "workflow_title",
          "step_name",
          "review_link",
          "execution_id",
          "timestamp",
          "company_name"
        ]),
      },
    ];

    for (const t of seedTemplates) {
      await pool.query(
        `INSERT INTO "email_templates" (id, template_key, name, category, description, subject, body_html, body_markdown, supported_variables, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          t.id,
          t.template_key,
          t.name,
          t.category,
          t.description,
          t.subject,
          t.body_html,
          t.body_markdown,
          t.supported_variables,
          true,
        ]
      );
    }
  }
}

export async function GET() {
  try {
    const authCheck = await requirePermission("business_center", [
      "skills_view",
      "okf_view",
      "compliance_view",
    ]);
    if (!authCheck.authorized) {
      const ccCheck = await requirePermission("command_center", "system_admin_view");
      if (!ccCheck.authorized) return authCheck.response;
    }

    await ensureTableAndSeed();

    const res = await pool.query(
      `SELECT id, template_key as "templateKey", name, category, description, subject, body_html as "bodyHtml", body_markdown as "bodyMarkdown", supported_variables as "supportedVariables", is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt"
       FROM "email_templates"
       ORDER BY category ASC, name ASC`
    );

    return NextResponse.json({ templates: res.rows });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authCheck = await requirePermission("business_center", [
      "skills_create",
      "skills_edit",
      "okf_create",
      "okf_edit",
    ]);
    if (!authCheck.authorized) {
      const ccCheck = await requirePermission("command_center", "system_admin_manage");
      if (!ccCheck.authorized) return authCheck.response;
    }

    await ensureTableAndSeed();
    const body = await req.json();
    const {
      id,
      templateKey,
      name,
      category,
      description,
      subject,
      bodyHtml,
      bodyMarkdown,
      supportedVariables,
      isActive,
    } = body;

    if (!templateKey || !name || !subject || !bodyHtml) {
      return NextResponse.json(
        { error: "Missing required fields: templateKey, name, subject, bodyHtml" },
        { status: 400 }
      );
    }

    const cleanKey = String(templateKey).toLowerCase().trim().replace(/[^a-z0-9_]/g, "_");

    if (id) {
      const updateRes = await pool.query(
        `UPDATE "email_templates"
         SET template_key = $1, name = $2, category = $3, description = $4, subject = $5, body_html = $6, body_markdown = $7, supported_variables = $8, is_active = $9, updated_at = now()
         WHERE id = $10
         RETURNING id, template_key as "templateKey", name, category, description, subject, body_html as "bodyHtml", body_markdown as "bodyMarkdown", supported_variables as "supportedVariables", is_active as "isActive"`,
        [
          cleanKey,
          name,
          category || "notification",
          description || "",
          subject,
          bodyHtml,
          bodyMarkdown || "",
          JSON.stringify(supportedVariables || []),
          isActive !== false,
          id,
        ]
      );
      return NextResponse.json({ success: true, template: updateRes.rows[0] });
    } else {
      const newId = crypto.randomUUID();
      const insertRes = await pool.query(
        `INSERT INTO "email_templates" (id, template_key, name, category, description, subject, body_html, body_markdown, supported_variables, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, template_key as "templateKey", name, category, description, subject, body_html as "bodyHtml", body_markdown as "bodyMarkdown", supported_variables as "supportedVariables", is_active as "isActive"`,
        [
          newId,
          cleanKey,
          name,
          category || "notification",
          description || "",
          subject,
          bodyHtml,
          bodyMarkdown || "",
          JSON.stringify(supportedVariables || []),
          isActive !== false,
        ]
      );
      return NextResponse.json({ success: true, template: insertRes.rows[0] });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authCheck = await requirePermission("business_center", [
      "skills_delete",
      "okf_delete",
    ]);
    if (!authCheck.authorized) {
      const ccCheck = await requirePermission("command_center", "system_admin_manage");
      if (!ccCheck.authorized) return authCheck.response;
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing template id" }, { status: 400 });
    }

    await pool.query(`DELETE FROM "email_templates" WHERE id = $1`, [id]);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
