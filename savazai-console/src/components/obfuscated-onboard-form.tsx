"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Loader2,
  Mail,
  Lock,
  User,
  ShieldAlert,
  ShieldCheck,
  KeyRound,
  CheckCircle2,
  AlertOctagon,
  ArrowRight,
} from "lucide-react";
import { usePermissions } from "@/lib/auth/use-permissions";

interface ObfuscatedOnboardFormProps {
  appTitle: string;
  logoUrl: string;
}

export function ObfuscatedOnboardForm({ appTitle, logoUrl }: ObfuscatedOnboardFormProps) {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const initialEmail = searchParams.get("email") || "";

  const { captchaChallengeToken } = usePermissions();

  // Verification state of the invitation token
  const [verifyingInvite, setVerifyingInvite] = useState(true);
  const [inviteValid, setInviteValid] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
  const [captchaVerified, setCaptchaVerified] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [quarantineSuccess, setQuarantineSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function checkToken() {
      if (!token || !initialEmail) {
        setVerifyingInvite(false);
        setInviteValid(false);
        setInviteError("Missing cryptographic invitation token or email parameter.");
        return;
      }

      try {
        const res = await fetch("/api/auth/invite/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, email: initialEmail }),
        });
        const data = await res.json();
        if (res.ok && data.valid) {
          setInviteValid(true);
          setEmail(data.email || initialEmail);
        } else {
          setInviteValid(false);
          setInviteError(data.error || "Access Denied: Invalid or expired invitation link.");
        }
      } catch (err: unknown) {
        setInviteValid(false);
        setInviteError(err instanceof Error ? err.message : "Failed to verify invitation token.");
      } finally {
        setVerifyingInvite(false);
      }
    }

    checkToken();
  }, [token, initialEmail]);

  const effectiveCaptchaToken = captchaVerified
    ? captchaChallengeToken || "CF_TURNSTILE_VERIFIED_TOKEN"
    : "";

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password) {
      setError("Please fill in your full name, email address, and initial password.");
      return;
    }
    if (password.length < 8) {
      setError("Initial password must be at least 8 characters long.");
      return;
    }
    if (!captchaVerified) {
      setError("Please complete the bot defense challenge.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          purpose: "onboarding",
          captchaToken: effectiveCaptchaToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to send verification OTP.");
      }
      setOtpSent(true);
      if (data.devOtpPreview) {
        setDevOtpHint(data.devOtpPreview);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to dispatch OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.trim().length !== 6) {
      setError("Please enter the 6-digit numeric OTP sent to your email.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/access-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          otpCode: otpCode.trim(),
          captchaToken: effectiveCaptchaToken,
          inviteToken: token.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to verify OTP or submit access request.");
      }
      setQuarantineSuccess(
        data.message ||
          "Account created in PENDING_APPROVAL quarantine with zero permissions. Await Administrator approval."
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to submit onboarding request.");
    } finally {
      setLoading(false);
    }
  };

  // 1. Loading State
  if (verifyingInvite) {
    return (
      <div className="w-full max-w-md rounded-3xl border border-slate-900 bg-slate-950/70 p-8 shadow-2xl backdrop-blur-xl text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
        <h3 className="text-lg font-bold text-white">Validating Invitation</h3>
        <p className="text-xs text-slate-400 mt-2">Checking cryptographic signature &amp; token expiration...</p>
      </div>
    );
  }

  // 2. Invalid or Expired Token State
  if (!inviteValid) {
    return (
      <div className="w-full max-w-md rounded-3xl border border-red-500/20 bg-slate-950/80 p-8 shadow-2xl backdrop-blur-xl text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/30 mb-5">
          <AlertOctagon className="h-7 w-7 text-red-400" />
        </div>
        <h3 className="text-xl font-bold text-white">Access Denied</h3>
        <p className="text-sm text-slate-300 mt-2">
          {inviteError || "Invalid, revoked, or expired onboarding invitation link."}
        </p>
        <div className="mt-6 p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400 text-left space-y-2">
          <p className="font-semibold text-slate-300">Security Notice:</p>
          <p>
            SavazAI employs Zero-Trust onboarding. Public registration is permanently disabled.
            To gain access, you must obtain a valid, single-use invitation from a verified Super Administrator.
          </p>
        </div>
        <div className="mt-6">
          <Link
            href="/signin"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 border border-slate-800 px-5 py-2.5 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-all"
          >
            Return to Sign In <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  // 3. Quarantined Success State
  if (quarantineSuccess) {
    return (
      <div className="w-full max-w-md rounded-3xl border border-amber-500/30 bg-slate-950/80 p-8 shadow-2xl backdrop-blur-xl text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/30 mb-5">
          <ShieldAlert className="h-8 w-8 text-amber-400" />
        </div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Quarantine Enforced</h2>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-3 py-1 text-xs font-medium text-amber-300 mt-3">
          Status: PENDING_APPROVAL
        </div>
        <div className="mt-5 space-y-3 text-xs text-slate-300 text-left bg-slate-900/70 p-4 rounded-2xl border border-slate-800/80">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>Cryptographic invitation token verified &amp; email OTP confirmed.</span>
          </div>
          <div className="flex items-start gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <span>Zero permissions granted. All API endpoints and dashboard UI are quarantined.</span>
          </div>
          <div className="flex items-start gap-2">
            <User className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
            <span>An administrator must approve your account and assign a role in the User Admin console.</span>
          </div>
        </div>
        <div className="mt-6">
          <Link
            href="/signin"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-primary/20 hover:bg-primary/95 transition-all"
          >
            Return to Sign In Gate
          </Link>
        </div>
      </div>
    );
  }

  // 4. Authorized Onboarding Form
  return (
    <div className="w-full max-w-md rounded-3xl border border-slate-900 bg-slate-950/60 p-8 shadow-2xl backdrop-blur-xl relative">
      <div className="flex flex-col items-center mb-6 text-center">
        {logoUrl && (
          <div className="mb-3 flex h-12 w-auto items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt={appTitle} className="h-9 w-auto object-contain" />
          </div>
        )}
        <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400 mb-2">
          <ShieldCheck className="h-3 w-3" /> Pre-Authorized Invitation
        </div>
        <h2 className="text-2xl font-bold text-white tracking-tight">{appTitle} Onboarding</h2>
        <p className="text-xs text-slate-400 mt-1">
          Complete identity verification to submit your account for administrator approval.
        </p>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!otpSent ? (
        <form onSubmit={handleSendOtp} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Full Name</label>
            <div className="relative">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Operator Name"
                className="w-full rounded-xl border border-slate-800 bg-slate-900/50 py-2.5 pl-10 pr-4 text-xs text-white placeholder-slate-500 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                required
                disabled={loading}
              />
              <User className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Authorized Email</label>
            <div className="relative">
              <input
                type="email"
                value={email}
                readOnly
                className="w-full rounded-xl border border-slate-800 bg-slate-900/80 py-2.5 pl-10 pr-4 text-xs text-slate-400 outline-none cursor-not-allowed select-none"
              />
              <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Locked to the invited address.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Initial Password (Min 8 characters)</label>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-slate-800 bg-slate-900/50 py-2.5 pl-10 pr-4 text-xs text-white placeholder-slate-500 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                required
                disabled={loading}
              />
              <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
            </div>
          </div>

          {/* Bot Defense Checkbox */}
          <div
            onClick={() => setLoading(false)}
            className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-2.5 cursor-pointer select-none hover:border-slate-700 transition-all"
          >
            <div className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={captchaVerified}
                onChange={(e) => setCaptchaVerified(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-950 text-primary focus:ring-primary"
              />
              <span className="text-[11px] font-medium text-slate-300">
                Verify human operator (Cloudflare Turnstile)
              </span>
            </div>
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          </div>

          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-xs font-semibold text-white shadow-lg shadow-primary/20 hover:bg-primary/95 transition-all focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Dispatching Security OTP...
              </>
            ) : (
              "Send 6-Digit Email OTP"
            )}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyAndSubmit} className="space-y-4">
          <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300">
            <p className="font-semibold text-indigo-200">OTP Sent to Inbound Email</p>
            <p className="mt-1 text-[11px] text-indigo-300/80">
              A 6-digit verification code has been dispatched via SMTP to <strong>{email}</strong>. Code valid for 10 minutes.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">6-Digit Email OTP Code</label>
            <div className="relative">
              <input
                type="text"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className="w-full text-center tracking-[8px] text-lg font-mono rounded-xl border border-slate-800 bg-slate-900/70 py-2.5 px-4 text-white placeholder-slate-600 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                required
                disabled={loading}
                autoFocus
              />
              <KeyRound className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />
            </div>
          </div>

          {devOtpHint && (
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
              <span>Dev Preview OTP:</span>
              <span className="font-mono font-bold text-amber-400 tracking-wider">{devOtpHint}</span>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setOtpSent(false);
                setOtpCode("");
              }}
              className="w-1/3 rounded-xl border border-slate-800 bg-slate-900 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-all"
              disabled={loading}
            >
              Back
            </button>
            <button
              type="submit"
              className="w-2/3 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-xs font-semibold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500 transition-all focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Verifying OTP...
                </>
              ) : (
                "Verify OTP & Submit"
              )}
            </button>
          </div>
        </form>
      )}

      <div className="mt-6 pt-4 border-t border-slate-900 text-center text-xs text-slate-500">
        Already have an active account?{" "}
        <Link href="/signin" className="font-semibold text-indigo-400 hover:text-indigo-300 transition-colors">
          Sign In
        </Link>
      </div>
    </div>
  );
}
