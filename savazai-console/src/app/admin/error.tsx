"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { ShieldAlert, RefreshCw, LayoutDashboard, LogOut } from "lucide-react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[AdminError Boundary]", error);
  }, [error]);

  const handleClearSessionAndSignIn = async () => {
    try {
      await authClient.signOut();
    } catch {
      // Ignore network error if already disconnected
    }
    window.location.href = "/signin";
  };

  const isDev = process.env.NODE_ENV !== "production";

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-8 shadow-2xl relative overflow-hidden text-card-foreground flex flex-col items-center text-center">
        {/* Glow accent */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-destructive/10 rounded-full blur-3xl pointer-events-none" />

        <div className="w-14 h-14 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive mb-5 shadow-xs">
          <ShieldAlert className="w-7 h-7" />
        </div>

        <h1 className="text-xl font-bold tracking-tight text-foreground mb-2">
          Administrative Module Error
        </h1>
        <p className="text-xs text-muted-foreground max-w-sm mb-6 leading-relaxed">
          The requested administrative module encountered an unexpected condition. You can retry, navigate back to your operational workspace, or re-authenticate.
        </p>

        {isDev && (
          <div className="w-full mb-6 text-left rounded-xl border border-border bg-muted/50 p-3.5 font-mono text-[11px] max-h-36 overflow-auto">
            <div className="text-destructive font-semibold mb-1">
              {error.name}: {error.message}
            </div>
            {error.digest && (
              <div className="text-muted-foreground text-[10px]">Digest: {error.digest}</div>
            )}
            {error.stack && (
              <pre className="text-muted-foreground text-[10px] mt-1 whitespace-pre-wrap break-all opacity-80">
                {error.stack}
              </pre>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 w-full">
          <Button
            onClick={() => reset()}
            variant="outline"
            size="sm"
            className="gap-2 h-9 text-xs border-border"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Try Again
          </Button>

          <Link href="/dashboard" className="flex-1 sm:flex-initial">
            <Button
              size="sm"
              className="w-full gap-2 h-9 text-xs font-semibold shadow-xs"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              Go to Workspace
            </Button>
          </Link>

          <Button
            onClick={handleClearSessionAndSignIn}
            variant="ghost"
            size="sm"
            className="gap-2 h-9 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          >
            <LogOut className="w-3.5 h-3.5" />
            Clear Session
          </Button>
        </div>
      </div>
    </div>
  );
}
