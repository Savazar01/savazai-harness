import React, { Suspense } from "react";
import { getSystemConfig } from "@/components/theme-provider";
import { ObfuscatedOnboardForm } from "@/components/obfuscated-onboard-form";
import { Loader2 } from "lucide-react";

export default async function ObfuscatedOnboardPage() {
  const config = await getSystemConfig();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-7xl h-[600px] pointer-events-none opacity-20">
        <div className="absolute inset-0 rounded-full bg-primary/10 blur-[150px]" />
      </div>

      <Suspense
        fallback={
          <div className="w-full max-w-md rounded-3xl border border-slate-900 bg-slate-950/70 p-8 shadow-2xl backdrop-blur-xl text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
            <h3 className="text-lg font-bold text-white">Loading Onboarding Portal</h3>
          </div>
        }
      >
        <ObfuscatedOnboardForm appTitle={config.appTitle} logoUrl={config.brandLogoUrl} />
      </Suspense>
    </div>
  );
}
