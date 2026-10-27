import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/rbac";
import { sendEmail, verifySmtpConnection, type SmtpConfig } from "@/lib/email/transporter";

export async function POST(req: Request) {
  const permCheck = await requirePermission("command_center", "system_admin_manage");
  if (!permCheck.authorized) {
    return permCheck.response;
  }

  try {
    const body = await req.json();
    const { targetEmail, configOverride } = body;

    if (!targetEmail || typeof targetEmail !== "string") {
      return NextResponse.json(
        { error: "Target email address is required." },
        { status: 400 }
      );
    }

    // 1. Pre-flight handshake verification
    const verifyRes = await verifySmtpConnection(configOverride as SmtpConfig);
    if (!verifyRes.success) {
      return NextResponse.json(
        { error: `SMTP Handshake Failed: ${verifyRes.error}` },
        { status: 500 }
      );
    }

    const testSubject = `[SavazAI] Test Transactional Email Handshake`;
    const testHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #090d16; color: #f8fafc; border-radius: 16px; border: 1px solid #1e293b;">
        <div style="margin-bottom: 24px;">
          <h2 style="color: #10b981; margin: 0 0 8px; font-size: 22px; font-weight: 700;">&check; SMTP Handshake Verified</h2>
          <p style="color: #94a3b8; font-size: 14px; margin: 0;">SavazAI Command Center Email Verification</p>
        </div>
        <div style="background: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0 0 8px; font-size: 13px; color: #f1f5f9;">
            This test email confirms that your outgoing transactional email server configuration is functioning properly.
          </p>
          <ul style="margin: 12px 0 0; padding-left: 20px; font-size: 12px; color: #94a3b8; line-height: 1.6;">
            <li>Timestamp: <strong>${new Date().toUTCString()}</strong></li>
            <li>Recipient: <strong>${targetEmail}</strong></li>
            <li>Security: <strong>TLS / Authenticated Handshake</strong></li>
          </ul>
        </div>
        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #1e293b; font-size: 11px; color: #64748b; text-align: center;">
          Sent from SavazAI Autonomous Agent Orchestration Platform
        </div>
      </div>
    `;

    const result = await sendEmail({
      to: targetEmail,
      subject: testSubject,
      html: testHtml,
      purpose: "test_email",
      configOverride: configOverride as SmtpConfig,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: `SMTP Handshake Failed: ${result.error}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Test email successfully dispatched to ${targetEmail}`,
      messageId: result.messageId,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to dispatch test email." },
      { status: 500 }
    );
  }
}
