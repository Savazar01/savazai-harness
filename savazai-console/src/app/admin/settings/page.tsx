import { getSystemConfig } from "@/components/theme-provider";
import { SettingsDashboard } from "@/components/settings-dashboard";
import { getSessionAccessContext, resolveDefaultLandingRoute } from "@/lib/auth/rbac";
import { redirect } from "next/navigation";
import { AccessDeniedScreen } from "@/components/shared/access-denied";

export default async function SettingsPage() {
  const ctx = await getSessionAccessContext();

  if (!ctx || ctx.status !== "ACTIVE") {
    redirect("/signin");
  }

  if (ctx.mustResetPassword) {
    redirect("/reset-password");
  }

  const canView = Array.from(ctx.permissions).some(
    (p) => p.startsWith("command_center:") && p.endsWith("_view")
  );

  if (!canView) {
    return (
      <AccessDeniedScreen
        requiredPermission="command_center:*_view"
        moduleTitle="SavazAI Command Center"
        fallbackRoute={resolveDefaultLandingRoute(ctx.permissions)}
      />
    );
  }

  const rawConfig = await getSystemConfig().catch(() => null);
  const config = {
    appTitle: rawConfig?.appTitle || "SavazAI Console",
    brandLogoUrl: rawConfig?.brandLogoUrl || "https://savazar.com/wp-content/uploads/2023/10/cropped-Transparent_Image_2-300x100.png",
    designTokens: rawConfig?.designTokens || {},
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SettingsDashboard initialConfig={config} />
    </div>
  );
}
