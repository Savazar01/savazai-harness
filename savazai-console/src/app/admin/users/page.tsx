import { UserManagement } from "@/components/admin/user-management";

export const metadata = {
  title: "User Administration | SavazAI",
  description: "Manage system accounts, user roles, and security credentials.",
};

export default function UsersPage() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <UserManagement />
    </div>
  );
}
