import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/rbac";
import { sendEmail } from "@/lib/email/transporter";
import { renderEmailTemplate } from "@/lib/email/template-renderer";

export async function POST(req: NextRequest) {
  try {
    const authCheck = await requirePermission("business_center", [
      "skills_edit",
      "okf_edit",
    ]);
    if (!authCheck.authorized) {
      const ccCheck = await requirePermission("command_center", "system_admin_manage");
      if (!ccCheck.authorized) return authCheck.response;
    }

    const body = await req.json();
    const { templateKey, recipientEmail, subject, bodyHtml, bodyMarkdown } = body;

    if (!recipientEmail) {
      return NextResponse.json({ error: "Recipient email is required" }, { status: 400 });
    }

    let finalSubject = subject;
    let finalHtml = bodyHtml;
    let finalText = bodyMarkdown;

    if (templateKey && (!finalSubject || !finalHtml)) {
      const rendered = await renderEmailTemplate(templateKey, {
        approver_email: recipientEmail,
        review_link: `${req.nextUrl.origin}/dashboard`,
        workflow_title: "Automated Enterprise Testflow",
        agent_name: "Verification Orchestrator",
        step_name: "Test Verification",
        status: "APPROVED_TEST",
      });
      finalSubject = rendered.subject;
      finalHtml = rendered.bodyHtml;
      finalText = rendered.bodyMarkdown;
    }

    // Attempt delivery via configured SMTP transporter
    const result = await sendEmail({
      to: recipientEmail,
      subject: finalSubject || "[SavazAI Test Dispatch] Message Verification",
      html: finalHtml || "<p>Test notification from SavazAI Email Engine.</p>",
      text: finalText,
      purpose: "template_test_dispatch",
      metadata: { templateKey: templateKey || "ad_hoc_test" },
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || "Failed to dispatch email via active SMTP relay.",
          warning: "Verify SMTP credentials in System Admin -> System Core -> Email SMTP",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      recipient: recipientEmail,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
