import { getSystemConfig } from "@/components/theme-provider";
import { SettingsDashboard } from "@/components/settings-dashboard";

export default async function SettingsPage() {
  const config = await getSystemConfig();
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <SettingsDashboard initialConfig={config} />
    </div>
  );
}
