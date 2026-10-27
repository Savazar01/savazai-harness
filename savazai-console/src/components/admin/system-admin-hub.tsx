"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Mail,
  ShieldCheck,
  ShieldAlert,
  Activity,
  Lock,
  Send,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  X,
  AlertTriangle,
} from "lucide-react";
import { HelpTooltip } from "@/components/shared/help-tooltip";

export interface SmtpSettingsState {
  provider: "smtp" | "gmail" | "sendgrid";
  host: string;
  port: string;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
  sendgridApiKey: string;
}

export interface CaptchaSettingsState {
  provider: "turnstile" | "recaptcha_v3" | "disabled";
  siteKey: string;
  secretKey: string;
}

export interface SecuritySettingsState {
  sessionHours: string;
  maxLoginAttempts: string;
  quarantineNotificationEmail: string;
}

interface SystemAdminHubProps {
  canManage: boolean;
  smtpSettings: SmtpSettingsState;
  setSmtpSettings: React.Dispatch<React.SetStateAction<SmtpSettingsState>>;
  captchaSettings: CaptchaSettingsState;
  setCaptchaSettings: React.Dispatch<React.SetStateAction<CaptchaSettingsState>>;
  securitySettings: SecuritySettingsState;
  setSecuritySettings: React.Dispatch<React.SetStateAction<SecuritySettingsState>>;
}

export function SystemAdminHub({
  canManage,
  smtpSettings,
  setSmtpSettings,
  captchaSettings,
  setCaptchaSettings,
  securitySettings,
  setSecuritySettings,
}: SystemAdminHubProps) {
  // Client-side hydration guard for portal
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Nested Sub-Tab State: "email" | "captcha" | "logs" | "security"
  const [subTab, setSubTab] = useState<"email" | "captcha" | "logs" | "security">("email");

  // Mask toggles
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [showSmtpPass, setShowSmtpPass] = useState(false);

  // Test Email Modal State
  const [isTestEmailOpen, setIsTestEmailOpen] = useState(false);
  const [testEmailTarget, setTestEmailTarget] = useState(smtpSettings.fromEmail || "savazarco@gmail.com");
  const [testEmailLoading, setTestEmailLoading] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);

  // Email Audit Logs State
  const [emailLogs, setEmailLogs] = useState<Array<{ id: string; recipient: string; subject: string; purpose: string; status: string; error?: string; createdAt: string }>>([]);
  const [emailLogsLoading, setEmailLogsLoading] = useState(false);

  const fetchEmailLogs = useCallback(async () => {
    setEmailLogsLoading(true);
    try {
      const res = await fetch("/api/admin/system/email-logs");
      if (res.ok) {
        const data = await res.json();
        setEmailLogs(data.logs || []);
      }
    } catch (e) {
      console.warn("Failed to fetch email logs", e);
    } finally {
      setEmailLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (subTab === "logs") {
      fetchEmailLogs();
    }
  }, [subTab, fetchEmailLogs]);

  const handleSendTestEmail = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!testEmailTarget.trim() || testEmailLoading) return;
    setTestEmailLoading(true);
    setTestEmailResult(null);
    try {
      const overridePass =
        smtpSettings.pass && !smtpSettings.pass.includes("••••")
          ? smtpSettings.pass.trim().replace(/\s+/g, "")
          : undefined;

      const overrideSendgrid =
        smtpSettings.sendgridApiKey && !smtpSettings.sendgridApiKey.includes("••••")
          ? smtpSettings.sendgridApiKey.trim()
          : undefined;

      const res = await fetch("/api/admin/system/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetEmail: testEmailTarget.trim(),
          configOverride: {
            provider: smtpSettings.provider,
            host: smtpSettings.host,
            port: Number(smtpSettings.port),
            secure: smtpSettings.secure,
            user: smtpSettings.user.trim(),
            ...(overridePass !== undefined ? { pass: overridePass } : {}),
            fromName: smtpSettings.fromName,
            fromEmail: smtpSettings.fromEmail.trim(),
            ...(overrideSendgrid !== undefined ? { sendgridApiKey: overrideSendgrid } : {}),
          },
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestEmailResult({
          success: true,
          message: data.message || `Test email successfully dispatched to ${testEmailTarget.trim()}`,
        });
        fetchEmailLogs();
      } else {
        setTestEmailResult({ success: false, error: data.error || "Failed to deliver test email." });
      }
    } catch (err: unknown) {
      setTestEmailResult({
        success: false,
        error: err instanceof Error ? err.message : "Network error dispatching test email.",
      });
    } finally {
      setTestEmailLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-indigo-400" />
          System Administration &amp; Security Hub
          <HelpTooltip content="Configure transactional email delivery, CAPTCHA bot protection, security policies, and monitor real-time outbound delivery audit streams." side="right" />
        </h3>
        <p className="text-muted-foreground text-xs">
          SMTP relays, Cloudflare Turnstile bot verification, session controls, and tamper-evident audit logging.
        </p>
      </div>

      {/* Nested Sub-Tab Navigation Bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <button
          type="button"
          onClick={() => setSubTab("email")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            subTab === "email"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
              : "bg-muted/30 text-muted-foreground hover:text-foreground border border-border/80"
          }`}
        >
          <Mail className="h-3.5 w-3.5" />
          Email &amp; SMTP Service
        </button>

        <button
          type="button"
          onClick={() => setSubTab("captcha")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            subTab === "captcha"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
              : "bg-muted/30 text-muted-foreground hover:text-foreground border border-border/80"
          }`}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Bot Defense &amp; CAPTCHA
        </button>

        <button
          type="button"
          onClick={() => setSubTab("logs")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            subTab === "logs"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
              : "bg-muted/30 text-muted-foreground hover:text-foreground border border-border/80"
          }`}
        >
          <Activity className="h-3.5 w-3.5" />
          Outbound Audit Stream ({emailLogs.length})
        </button>

        <button
          type="button"
          onClick={() => setSubTab("security")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            subTab === "security"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
              : "bg-muted/30 text-muted-foreground hover:text-foreground border border-border/80"
          }`}
        >
          <Lock className="h-3.5 w-3.5" />
          Security Policies &amp; Sessions
        </button>
      </div>

      {/* ── Sub-Tab A: Email & SMTP Service ── */}
      {subTab === "email" && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4 text-card-foreground shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
              <div>
                <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Mail className="h-4 w-4 text-primary" />
                  Transactional Email &amp; SMTP Transporter
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Powers 6-digit OTP delivery, admin invitations, and platform notifications.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setTestEmailTarget(smtpSettings.fromEmail || "savazarco@gmail.com");
                  setTestEmailResult(null);
                  setIsTestEmailOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-primary/30 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-all cursor-pointer shrink-0"
              >
                <Send className="h-3.5 w-3.5" />
                Send Test Email
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Transporter Provider
                </label>
                <select
                  value={smtpSettings.provider}
                  disabled={!canManage}
                  onChange={(e) =>
                    setSmtpSettings((prev) => ({
                      ...prev,
                      provider: e.target.value as "smtp" | "gmail" | "sendgrid",
                    }))
                  }
                  className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-xs text-white outline-none focus:border-primary/50"
                >
                  <option value="smtp">Standard SMTP Relay (Recommended: Host, Port, TLS, Auth)</option>
                  <option value="gmail">Google Gmail App Password (Service: Gmail)</option>
                  <option value="sendgrid">Twilio SendGrid API / Relay</option>
                </select>
              </div>

              {smtpSettings.provider === "gmail" ? (
                <div className="md:col-span-2 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                  <p className="font-semibold text-amber-200">Google Workspace / Gmail Notice:</p>
                  <p className="mt-1 text-[11px] text-amber-300/90 leading-relaxed">
                    Use your full Gmail address and a dedicated 16-character <strong>Google App Password</strong> (created via Google Account &rarr; Security &rarr; 2-Step Verification &rarr; App Passwords). Passwords are encrypted at rest with AES-256.
                  </p>
                </div>
              ) : null}

              {smtpSettings.provider === "smtp" && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      SMTP Host Server
                    </label>
                    <input
                      type="text"
                      disabled={!canManage}
                      value={smtpSettings.host}
                      onChange={(e) => setSmtpSettings((prev) => ({ ...prev, host: e.target.value }))}
                      placeholder="smtp.gmail.com or mail.enterprise.com"
                      className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-xs text-white placeholder-slate-600 outline-none focus:border-primary/50 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Port &amp; Encryption
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        disabled={!canManage}
                        value={smtpSettings.port}
                        onChange={(e) => setSmtpSettings((prev) => ({ ...prev, port: e.target.value }))}
                        placeholder="587"
                        className="w-1/2 rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-xs text-white font-mono outline-none focus:border-primary/50"
                      />
                      <label className="w-1/2 flex items-center justify-between px-3 py-2 rounded-xl border border-border bg-muted/30 cursor-pointer">
                        <span className="text-xs text-muted-foreground">SSL/TLS Secure</span>
                        <input
                          type="checkbox"
                          disabled={!canManage}
                          checked={smtpSettings.secure}
                          onChange={(e) => setSmtpSettings((prev) => ({ ...prev, secure: e.target.checked }))}
                          className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary"
                        />
                      </label>
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  {smtpSettings.provider === "sendgrid" ? "SendGrid Username ('apikey')" : "SMTP Username / Email"}
                </label>
                <input
                  type="text"
                  disabled={!canManage}
                  value={smtpSettings.user}
                  onChange={(e) => setSmtpSettings((prev) => ({ ...prev, user: e.target.value }))}
                  placeholder="user@domain.com or apikey"
                  className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-xs text-white placeholder-slate-600 outline-none focus:border-primary/50 font-mono"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {smtpSettings.provider === "gmail"
                      ? "16-Char Google App Password"
                      : smtpSettings.provider === "sendgrid"
                      ? "SendGrid API Key"
                      : "SMTP Password / Secret"}
                  </label>
                  {smtpSettings.pass && smtpSettings.pass.includes("••••") && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-medium text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" />
                      Encrypted Password Saved
                    </span>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showSmtpPass ? "text" : "password"}
                    disabled={!canManage}
                    value={smtpSettings.provider === "sendgrid" ? smtpSettings.sendgridApiKey : smtpSettings.pass}
                    onChange={(e) =>
                      smtpSettings.provider === "sendgrid"
                        ? setSmtpSettings((prev) => ({ ...prev, sendgridApiKey: e.target.value }))
                        : setSmtpSettings((prev) => ({ ...prev, pass: e.target.value }))
                    }
                    placeholder={
                      smtpSettings.provider === "gmail"
                        ? "Enter 16-char app password (e.g. abcd efgh ijkl mnop)"
                        : "••••••••••••••••"
                    }
                    className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 pr-20 text-xs text-white font-mono outline-none focus:border-primary/50"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {smtpSettings.pass && smtpSettings.pass.includes("••••") ? (
                      <button
                        type="button"
                        disabled={!canManage}
                        onClick={() => setSmtpSettings((prev) => ({ ...prev, pass: "" }))}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-medium text-muted-foreground transition-colors cursor-pointer"
                        title="Clear stored placeholder to enter a new password"
                      >
                        Change
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowSmtpPass(!showSmtpPass)}
                        className="p-1 rounded text-muted-foreground hover:text-foreground cursor-pointer"
                        title={showSmtpPass ? "Hide password" : "Show password"}
                      >
                        {showSmtpPass ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Sender Display Name
                </label>
                <input
                  type="text"
                  disabled={!canManage}
                  value={smtpSettings.fromName}
                  onChange={(e) => setSmtpSettings((prev) => ({ ...prev, fromName: e.target.value }))}
                  placeholder="SavazAI Platform Security"
                  className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-xs text-white outline-none focus:border-primary/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Sender Email Address (From)
                </label>
                <input
                  type="email"
                  disabled={!canManage}
                  value={smtpSettings.fromEmail}
                  onChange={(e) => setSmtpSettings((prev) => ({ ...prev, fromEmail: e.target.value }))}
                  placeholder="security@savazar.com"
                  className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-xs text-white outline-none focus:border-primary/50 font-mono"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Sub-Tab B: Bot Defense & CAPTCHA ── */}
      {subTab === "captcha" && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4 text-card-foreground shadow-xs">
            <div className="pb-3 border-b border-border">
              <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                Zero-Trust Bot Defense &amp; Challenge Provider
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Enforces invisible or managed challenges on Sign In, Onboarding Requests, and Password Resets.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  CAPTCHA Challenge Provider
                </label>
                <select
                  value={captchaSettings.provider}
                  disabled={!canManage}
                  onChange={(e) =>
                    setCaptchaSettings((prev) => ({
                      ...prev,
                      provider: e.target.value as "turnstile" | "recaptcha_v3" | "disabled",
                    }))
                  }
                  className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-xs text-white outline-none focus:border-primary/50"
                >
                  <option value="turnstile">Cloudflare Turnstile (Recommended &bull; Privacy-Preserving)</option>
                  <option value="recaptcha_v3">Google reCAPTCHA v3 (Score-Based)</option>
                  <option value="disabled">Disabled (Development / Local Sandboxing Only)</option>
                </select>
              </div>

              {captchaSettings.provider !== "disabled" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Site Key (Public)
                    </label>
                    <input
                      type="text"
                      disabled={!canManage}
                      value={captchaSettings.siteKey}
                      onChange={(e) => setCaptchaSettings((prev) => ({ ...prev, siteKey: e.target.value }))}
                      placeholder="0x4AAAAAA..."
                      className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-xs text-white font-mono outline-none focus:border-primary/50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Secret Key (Private &bull; Encrypted)
                    </label>
                    <div className="relative">
                      <input
                        type={showSecretKey ? "text" : "password"}
                        disabled={!canManage}
                        value={captchaSettings.secretKey}
                        onChange={(e) => setCaptchaSettings((prev) => ({ ...prev, secretKey: e.target.value }))}
                        placeholder="0x4AAAAAA..."
                        className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 pr-10 text-xs text-white font-mono outline-none focus:border-primary/50"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecretKey(!showSecretKey)}
                        className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                      >
                        {showSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Sub-Tab C: Outbound Email & OTP Audit Stream ── */}
      {subTab === "logs" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4 text-card-foreground shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  Outbound Email &amp; OTP Audit Stream
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Real-time database log of all dispatched OTPs, invitations, and transactional messages.
                </p>
              </div>
              <button
                type="button"
                onClick={fetchEmailLogs}
                disabled={emailLogsLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-muted/30 hover:bg-slate-800 text-muted-foreground text-xs font-semibold transition-all cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${emailLogsLoading ? "animate-spin" : ""}`} />
                Refresh Stream
              </button>
            </div>

            {emailLogs.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-xs">
                {emailLogsLoading ? "Loading audit stream..." : "No outbound email records logged yet."}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-left text-xs text-muted-foreground">
                  <thead className="bg-muted/30 text-[10px] uppercase font-bold text-muted-foreground border-b border-border">
                    <tr>
                      <th className="px-3.5 py-2.5">Status</th>
                      <th className="px-3.5 py-2.5">Recipient</th>
                      <th className="px-3.5 py-2.5">Purpose / Subject</th>
                      <th className="px-3.5 py-2.5">Timestamp</th>
                      <th className="px-3.5 py-2.5">Diagnostics</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900">
                    {emailLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-3.5 py-2.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              log.status === "SENT"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : "bg-red-500/10 text-red-400 border border-red-500/20"
                            }`}
                          >
                            {log.status === "SENT" ? (
                              <CheckCircle2 className="h-2.5 w-2.5" />
                            ) : (
                              <XCircle className="h-2.5 w-2.5" />
                            )}
                            {log.status}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 font-mono text-foreground">{log.recipient}</td>
                        <td className="px-3.5 py-2.5">
                          <span className="font-semibold text-white block">{log.purpose}</span>
                          <span className="text-[10px] text-muted-foreground truncate block max-w-xs">{log.subject}</span>
                        </td>
                        <td className="px-3.5 py-2.5 text-muted-foreground whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="px-3.5 py-2.5 text-[10px] font-mono text-muted-foreground">
                          {log.error ? (
                            <span className="text-red-400 truncate block max-w-[200px]" title={log.error}>
                              {log.error}
                            </span>
                          ) : (
                            <span className="text-emerald-400/80">Delivered via Authenticated Handshake</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Sub-Tab D: Security Policies & Sessions ── */}
      {subTab === "security" && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4 text-card-foreground shadow-xs">
            <div className="pb-3 border-b border-border">
              <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" />
                Security Policies, Sessions &amp; Alert Routing
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Enforce idle session timeout thresholds, brute-force mitigation limits, and security notifications.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Session Idle Expiration (Hours)
                </label>
                <select
                  value={securitySettings.sessionHours}
                  disabled={!canManage}
                  onChange={(e) => setSecuritySettings((prev) => ({ ...prev, sessionHours: e.target.value }))}
                  className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-xs text-white outline-none focus:border-primary/50"
                >
                  <option value="8">8 Hours (High Security &bull; Finance / Gov)</option>
                  <option value="24">24 Hours (Standard Enterprise)</option>
                  <option value="72">72 Hours</option>
                  <option value="168">7 Days</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Max Failed Login Attempts
                </label>
                <select
                  value={securitySettings.maxLoginAttempts}
                  disabled={!canManage}
                  onChange={(e) => setSecuritySettings((prev) => ({ ...prev, maxLoginAttempts: e.target.value }))}
                  className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-xs text-white outline-none focus:border-primary/50"
                >
                  <option value="3">3 Attempts (Strict Rate-Limiting)</option>
                  <option value="5">5 Attempts (Balanced)</option>
                  <option value="10">10 Attempts</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Quarantine Submission Alert Email
                </label>
                <input
                  type="email"
                  disabled={!canManage}
                  value={securitySettings.quarantineNotificationEmail}
                  onChange={(e) => setSecuritySettings((prev) => ({ ...prev, quarantineNotificationEmail: e.target.value }))}
                  placeholder="security-team@savazar.com"
                  className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-xs text-white outline-none focus:border-primary/50 font-mono"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Receives notification digests whenever a pre-authorized applicant completes OTP and enters the quarantine approval queue.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Send Test Email (Portaled to document.body to avoid parent form collision) ── */}
      {isTestEmailOpen && mounted && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4 text-card-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary">
                  <Send className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-bold text-foreground">Send Live Test Email</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsTestEmailOpen(false)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Verify your active SMTP handshake by dispatching a real transactional message directly through Nodemailer.
            </p>

            {testEmailResult && (
              <div
                className={`p-3.5 rounded-xl border text-xs ${
                  testEmailResult.success
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border-red-500/30 bg-red-500/10 text-red-300"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {testEmailResult.success ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1">
                    <p className="font-semibold text-xs">
                      {testEmailResult.success
                        ? "✓ Test Email Dispatched Successfully"
                        : "✕ SMTP Handshake / Dispatch Failed"}
                    </p>
                    <p className="text-[11px] leading-relaxed opacity-90 break-words font-mono">
                      {testEmailResult.success ? testEmailResult.message : testEmailResult.error}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Target Recipient Email
                </label>
                <input
                  type="email"
                  value={testEmailTarget}
                  onChange={(e) => setTestEmailTarget(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSendTestEmail();
                    }
                  }}
                  placeholder="recipient@example.com"
                  className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-xs text-white outline-none focus:border-primary/50 font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsTestEmailOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSendTestEmail(e);
                  }}
                  disabled={testEmailLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary/95 text-white text-xs font-semibold shadow-lg shadow-primary/20 disabled:opacity-50 cursor-pointer"
                >
                  {testEmailLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {testEmailLoading ? "Dispatching..." : "Dispatch Test"}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
