import { ChatWorkspace } from "@/components/chat-workspace";
import { getSystemConfig } from "@/components/theme-provider";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getSystemConfig();
  return {
    title: `Agent Workspace - ${config.appTitle}`,
    description: "Interactive multi-agent chat playground",
  };
}

export default async function DashboardPage() {
  const config = await getSystemConfig();
  return <ChatWorkspace initialConfig={config} />;
}
