import { getSystemConfig } from "@/components/theme-provider";
import { SignUpForm } from "@/components/signup-form";

export default async function SignUpPage() {
  const config = await getSystemConfig();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-7xl h-[600px] pointer-events-none opacity-20">
        <div className="absolute inset-0 rounded-full bg-primary/10 blur-[150px]" />
      </div>

      <SignUpForm
        appTitle={config.appTitle}
        logoUrl={config.brandLogoUrl}
      />
    </div>
  );
}
