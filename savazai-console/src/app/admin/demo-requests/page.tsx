import { DemoRequestManagement } from "@/components/admin/demo-request-management";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Inbound Demo Requests | SavazAI Admin",
  description: "Track and manage inbound enterprise demo inquiries.",
};

export default async function AdminDemoRequestsPage() {
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
      <DemoRequestManagement />
    </div>
  );
}
