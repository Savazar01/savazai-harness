import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import React from "react";
import { Sidebar } from "@/components/sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || session.user.role !== "admin") {
    redirect("/");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">{children}</main>
    </div>
  );
}
