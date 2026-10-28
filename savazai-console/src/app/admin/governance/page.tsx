import { GovernanceDashboard } from "@/components/governance/governance-dashboard";
import { getSessionAccessContext, resolveDefaultLandingRoute } from "@/lib/auth/rbac";
import { redirect } from "next/navigation";
import { AccessDeniedScreen } from "@/components/shared/access-denied";

export const metadata = {
  title: "Governance & Compliance Hub | SavazAI",
  description: "Enterprise operational audit ledger, asset versioning, and LLM telemetry tracking.",
};

export default async function GovernancePage() {
  const ctx = await getSessionAccessContext();

  if (!ctx || ctx.status !== "ACTIVE") {
    redirect("/signin");
  }

  if (ctx.mustResetPassword) {
    redirect("/reset-password");
  }

  if (!ctx.permissions.has("governance:view")) {
    return (
      <AccessDeniedScreen
        requiredPermission="governance:view"
        moduleTitle="Governance & Compliance Hub"
        fallbackRoute={resolveDefaultLandingRoute(ctx.permissions)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col p-6">
      <GovernanceDashboard />
    </div>
  );
}
