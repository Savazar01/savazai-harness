import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/rbac";
import { getAlertRules, saveAlertRules, GovernanceAlertRule } from "@/lib/alerts/governance-alerter";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authCheck = await requirePermission("governance", "view");
    if (!authCheck.authorized) return authCheck.response;

    const rules = await getAlertRules();
    return new Response(JSON.stringify({ rules }), {
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

export async function POST(req: NextRequest) {
  try {
    const authCheck = await requirePermission("governance", "manage_retention");
    if (!authCheck.authorized) return authCheck.response;

    const body = await req.json();

    if (body.test) {
      const { dispatchGovernanceAlert } = await import("@/lib/alerts/governance-alerter");
      await dispatchGovernanceAlert({
        action: "TEST_ALERT_TRIGGERED",
        category: "governance",
        resource: "governance_alert_rules",
        targetName: body.ruleName || "Test Alert Notification",
        actorEmail: authCheck.user?.email || "admin@savazai.local",
        details: {
          message: "This is a test notification confirming your Governance Alerting rules and SMTP transporter are configured properly.",
          timestamp: new Date().toISOString(),
          testPayload: body.testPayload || "Standard test simulation",
        },
      });
      return new Response(JSON.stringify({ success: true, message: "Test alert dispatched." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { name, eventPattern, severityThreshold = "warning", recipientEmails = [] } = body;

    if (!name || !eventPattern) {
      return new Response(JSON.stringify({ error: "Rule name and event pattern are required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const rules = await getAlertRules();
    const newRule: GovernanceAlertRule = {
      id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim(),
      enabled: true,
      eventPattern: eventPattern.trim(),
      severityThreshold,
      recipientEmails: Array.isArray(recipientEmails)
        ? recipientEmails.map((e: string) => e.trim()).filter((e: string) => e.includes("@"))
        : [],
      createdAt: new Date().toISOString(),
    };

    rules.push(newRule);
    await saveAlertRules(rules);

    return new Response(JSON.stringify({ success: true, rule: newRule }), {
      status: 201,
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

export async function PUT(req: NextRequest) {
  try {
    const authCheck = await requirePermission("governance", "manage_retention");
    if (!authCheck.authorized) return authCheck.response;

    const body = await req.json();
    const { id, enabled, name, eventPattern, severityThreshold, recipientEmails } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: "Rule ID is required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    let rules = await getAlertRules();
    rules = rules.map((r) => {
      if (r.id === id) {
        return {
          ...r,
          ...(enabled !== undefined && { enabled: Boolean(enabled) }),
          ...(name !== undefined && { name: name.trim() }),
          ...(eventPattern !== undefined && { eventPattern: eventPattern.trim() }),
          ...(severityThreshold !== undefined && { severityThreshold }),
          ...(recipientEmails !== undefined && {
            recipientEmails: Array.isArray(recipientEmails)
              ? recipientEmails.map((e: string) => e.trim()).filter((e: string) => e.includes("@"))
              : r.recipientEmails,
          }),
        };
      }
      return r;
    });

    await saveAlertRules(rules);

    return new Response(JSON.stringify({ success: true, rules }), {
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

export async function DELETE(req: NextRequest) {
  try {
    const authCheck = await requirePermission("governance", "manage_retention");
    if (!authCheck.authorized) return authCheck.response;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return new Response(JSON.stringify({ error: "Rule ID is required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    let rules = await getAlertRules();
    rules = rules.filter((r) => r.id !== id);
    await saveAlertRules(rules);

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
