import { getSystemConfig } from "@/components/theme-provider";
import { SettingsDashboard } from "@/components/settings-dashboard";
import { getSessionAccessContext, resolveDefaultLandingRoute } from "@/lib/auth/rbac";
import { redirect } from "next/navigation";
import { AccessDeniedScreen } from "@/components/shared/access-denied";

export default async function SystemAdminPage() {
  const ctx = await getSessionAccessContext();

  if (!ctx || ctx.status !== "ACTIVE") {
    redirect("/signin");
  }

  if (ctx.mustResetPassword) {
    redirect("/reset-password");
  }

  const canView =
    ctx.role === "admin" ||
    ctx.roleName === "Super Administrator" ||
    ctx.permissions.has("system_admin:view") ||
    ctx.permissions.has("command_center:system_admin_view") ||
    ctx.permissions.has("appearance:update") ||
    ctx.permissions.has("branding:update");

  if (!canView) {
    return (
      <AccessDeniedScreen
        requiredPermission="system_admin:view"
        moduleTitle="System Administration"
        fallbackRoute={resolveDefaultLandingRoute(ctx.permissions)}
      />
    );
  }

  const config = await getSystemConfig();
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SettingsDashboard initialConfig={config} mode="system_admin" />
    </div>
  );
}
