"use client";

import React, { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Loader2, Mail, Lock, ShieldAlert } from "lucide-react";

interface SignInFormProps {
  appTitle: string;
  logoUrl: string;
}

export function SignInForm({ appTitle, logoUrl }: SignInFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { error: signInError } = await authClient.signIn.email({
        email,
        password,
        callbackURL: "/admin/settings",
      });

      if (signInError) {
        setError(signInError.message || "Failed to sign in. Please try again.");
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-3xl border border-slate-900 bg-slate-950/80 p-8 shadow-2xl backdrop-blur-md relative overflow-hidden">
      {/* Subtle brand glow behind form */}
      <div className="absolute top-[-10%] right-[-10%] w-[30%] h-[30%] rounded-full bg-primary/10 blur-[50px] pointer-events-none" />

      <div className="flex flex-col items-center mb-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt={appTitle}
          className="h-10 w-auto object-contain brightness-110 mb-4"
          onError={(e) => {
            e.currentTarget.src = "https://savazar.com/wp-content/uploads/2023/10/cropped-Transparent_Image_2-300x100.png";
          }}
        />
        <h2 className="text-2xl font-bold text-white tracking-tight">
          Sign In to {appTitle}
        </h2>
        <p className="text-slate-400 text-xs mt-2 text-center">
          Enter your credentials to access the orchestrator control plane
        </p>
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/5 p-4 text-sm text-red-400">
          <ShieldAlert className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Email Address
          </label>
          <div className="relative">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full rounded-xl border border-slate-800 bg-slate-900/50 py-3 pl-11 pr-4 text-sm text-white placeholder-slate-500 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
              required
              disabled={loading}
            />
            <Mail className="absolute left-4 top-3.5 h-4 w-4 text-slate-500" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Password
          </label>
          <div className="relative">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-slate-800 bg-slate-900/50 py-3 pl-11 pr-4 text-sm text-white placeholder-slate-500 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
              required
              disabled={loading}
            />
            <Lock className="absolute left-4 top-3.5 h-4 w-4 text-slate-500" />
          </div>
        </div>

        <button
          type="submit"
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-white shadow-lg shadow-primary/20 hover:bg-primary/95 transition-all focus:ring-2 focus:ring-primary/30 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.01]"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Verifying credentials...
            </>
          ) : (
            "Access Console"
          )}
        </button>
      </form>
    </div>
  );
}
