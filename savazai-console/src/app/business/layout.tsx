import { redirect } from "next/navigation";
import React from "react";
import { Sidebar } from "@/components/sidebar";
import { getSessionAccessContext, resolveDefaultLandingRoute } from "@/lib/auth/rbac";
import { AccessDeniedScreen } from "@/components/shared/access-denied";

export default async function BusinessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getSessionAccessContext();

  if (!ctx || ctx.status !== "ACTIVE") {
    redirect("/signin");
  }

  if (ctx.mustResetPassword) {
    redirect("/reset-password");
  }

  const canView =
    ctx.permissions.has("business_center:skills_view") ||
    ctx.permissions.has("business_center:okf_view") ||
    ctx.permissions.has("business_center:compliance_view");

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        {canView ? (
          children
        ) : (
          <AccessDeniedScreen
            requiredPermission="business_center:skills_view | okf_view | compliance_view"
            moduleTitle="Business Policy & Library Center"
            fallbackRoute={resolveDefaultLandingRoute(ctx.permissions)}
          />
        )}
      </main>
    </div>
  );
}
