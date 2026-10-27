import { redirect } from "next/navigation";
import React from "react";
import { Sidebar } from "@/components/sidebar";
import { getSessionAccessContext, resolveDefaultLandingRoute } from "@/lib/auth/rbac";
import { AccessDeniedScreen } from "@/components/shared/access-denied";

export default async function StudioLayout({
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

  const canView = ctx.permissions.has("capability_studio:view");

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        {canView ? (
          children
        ) : (
          <AccessDeniedScreen
            requiredPermission="capability_studio:view"
            moduleTitle="Capability Studio"
            fallbackRoute={resolveDefaultLandingRoute(ctx.permissions)}
          />
        )}
      </main>
    </div>
  );
}
