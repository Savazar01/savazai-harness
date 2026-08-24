import { UserManagement } from "@/components/admin/user-management";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const metadata = {
  title: "User Administration | SavazAI",
  description: "Manage system accounts, user roles, and security credentials.",
};

export default async function UsersPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/signin");
  }

  if (session.user.role !== "admin") {
    redirect("/studio");
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <UserManagement />
    </div>
  );
}
