import { redirect } from "next/navigation";
import React from "react";
import { Sidebar } from "@/components/sidebar";
import type { Metadata } from "next";
import { getSessionAccessContext, resolveDefaultLandingRoute } from "@/lib/auth/rbac";
import { AccessDeniedScreen } from "@/components/shared/access-denied";

export const metadata: Metadata = {
  title: "Documentation Hub | SavazAI",
  description: "Comprehensive operational runbook, API references, and architecture guides for the SavazAI Platform.",
};

export default async function DocsLayout({
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

  const canView = ctx.permissions.has("documentation:view");

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {canView ? (
          children
        ) : (
          <AccessDeniedScreen
            requiredPermission="documentation:view"
            moduleTitle="Documentation Hub"
            fallbackRoute={resolveDefaultLandingRoute(ctx.permissions)}
          />
        )}
      </main>
    </div>
  );
}
