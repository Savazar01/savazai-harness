import React from "react";
import Link from "next/link";
import { ShieldAlert, ArrowLeft, Lock } from "lucide-react";

interface AccessDeniedScreenProps {
  requiredPermission: string;
  moduleTitle: string;
  fallbackRoute?: string;
}

export function AccessDeniedScreen({
  requiredPermission,
  moduleTitle,
  fallbackRoute = "/dashboard",
}: AccessDeniedScreenProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 p-6 text-center select-none">
      <div className="w-full max-w-lg rounded-3xl border border-red-500/20 bg-slate-900/60 p-8 shadow-2xl backdrop-blur-md">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10 text-red-400">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-red-400 mb-3">
          <Lock className="h-3 w-3" />
          403 Forbidden — Zero-Trust RBAC Guard
        </span>
        <h1 className="text-xl font-extrabold text-white tracking-tight">
          Access Restricted: {moduleTitle}
        </h1>
        <p className="mt-2 text-xs text-slate-400 leading-relaxed">
          Your current role and Separation of Duties (SoD) profile do not include the required
          permission to access this module. Contact your Super Administrator to request role
          provisioning.
        </p>

        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/90 p-3 font-mono text-xs text-amber-300">
          Missing permission: [{requiredPermission}]
        </div>

        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href={fallbackRoute}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
            Return to Permitted Workspace
          </Link>
        </div>
      </div>
    </div>
  );
}
