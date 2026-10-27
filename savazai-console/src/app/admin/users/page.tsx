import { UserManagement } from "@/components/admin/user-management";
import { getSessionAccessContext, resolveDefaultLandingRoute } from "@/lib/auth/rbac";
import { redirect } from "next/navigation";
import { AccessDeniedScreen } from "@/components/shared/access-denied";

export const metadata = {
  title: "User Administration | SavazAI",
  description: "Manage system accounts, user roles, and security credentials.",
};

export default async function UsersPage() {
  const ctx = await getSessionAccessContext();

  if (!ctx || ctx.status !== "ACTIVE") {
    redirect("/signin");
  }

  if (ctx.mustResetPassword) {
    redirect("/reset-password");
  }

  if (!ctx.permissions.has("user_admin:view")) {
    return (
      <AccessDeniedScreen
        requiredPermission="user_admin:view"
        moduleTitle="User Administration & RBAC Matrix"
        fallbackRoute={resolveDefaultLandingRoute(ctx.permissions)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <UserManagement />
    </div>
  );
}
