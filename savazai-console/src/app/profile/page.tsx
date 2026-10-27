import { redirect } from "next/navigation";
import { getSessionAccessContext } from "@/lib/auth/rbac";
import { ProfileHub } from "@/components/profile/profile-hub";

export const metadata = {
  title: "My Profile & Authorizations | SavazAI",
  description: "Maintain personal account details, update credentials, and review active enterprise RBAC permissions.",
};

export default async function ProfilePage() {
  const ctx = await getSessionAccessContext();

  if (!ctx || ctx.status !== "ACTIVE") {
    redirect("/signin");
  }

  if (ctx.mustResetPassword) {
    redirect("/reset-password");
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <ProfileHub
        user={{
          id: ctx.userId,
          name: ctx.name,
          email: ctx.email,
          image: ctx.image,
          location: ctx.location,
          role: ctx.role,
          roleId: ctx.roleId,
          roleName: ctx.roleName,
          status: ctx.status,
        }}
        grantedPermissions={Array.from(ctx.permissions)}
      />
    </div>
  );
}
