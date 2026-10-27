import { DemoRequestManagement } from "@/components/admin/demo-request-management";
import { getSessionAccessContext, resolveDefaultLandingRoute } from "@/lib/auth/rbac";
import { redirect } from "next/navigation";
import { AccessDeniedScreen } from "@/components/shared/access-denied";

export const metadata = {
  title: "Inbound Demo Requests | SavazAI Admin",
  description: "Track and manage inbound enterprise demo inquiries.",
};

export default async function AdminDemoRequestsPage() {
  const ctx = await getSessionAccessContext();

  if (!ctx || ctx.status !== "ACTIVE") {
    redirect("/signin");
  }

  if (ctx.mustResetPassword) {
    redirect("/reset-password");
  }

  if (!ctx.permissions.has("demo_requests:view")) {
    return (
      <AccessDeniedScreen
        requiredPermission="demo_requests:view"
        moduleTitle="Inbound Demo Requests & Leads"
        fallbackRoute={resolveDefaultLandingRoute(ctx.permissions)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <DemoRequestManagement />
    </div>
  );
}
