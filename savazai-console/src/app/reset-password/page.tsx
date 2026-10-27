"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, ShieldCheck, AlertTriangle, Loader2, CheckCircle2, KeyRound } from "lucide-react";
import { usePermissions } from "@/lib/auth/use-permissions";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { user, refreshPermissions } = usePermissions();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setError("Password must include at least one uppercase letter, one lowercase letter, and one number.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword, confirmPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update password.");
      }

      setSuccess(true);
      await refreshPermissions();
      setTimeout(() => {
        router.push(data.redirectTo || "/dashboard");
      }, 800);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-12 relative overflow-hidden">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/70 p-8 shadow-2xl backdrop-blur-md">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
            <KeyRound className="h-6 w-6" />
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300 mb-2">
            Mandatory First-Time Security Step
          </span>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Set Your Permanent Password
          </h1>
          <p className="text-xs text-slate-400 mt-1.5">
            {user?.email
              ? `Account (${user.email}) has been approved. You must set a new policy-compliant password before accessing the platform.`
              : "You must update your initial or temporary password before accessing any SavazAI workspace."}
          </p>
        </div>

        {error && (
          <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-300">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
            <span>Password updated! Redirecting to your permitted workspace...</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              New Password
            </label>
            <div className="relative">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 8 chars, Uppercase, Lowercase, Digit"
                className="w-full rounded-xl border border-slate-800 bg-slate-950/80 py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none focus:border-primary"
                required
                disabled={loading || success}
              />
              <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Confirm New Password
            </label>
            <div className="relative">
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full rounded-xl border border-slate-800 bg-slate-950/80 py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none focus:border-primary"
                required
                disabled={loading || success}
              />
              <ShieldCheck className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || success}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-white shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Updating Security Credentials...
              </>
            ) : (
              "Save Password & Continue"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
