"use client";

import React, { useState } from "react";
import {
  User,
  Shield,
  KeyRound,
  MapPin,
  Mail,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Save,
  Camera,
  Layers,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Loader2,
} from "lucide-react";
import { PERMISSION_REGISTRY, CATEGORY_LABELS } from "@/lib/auth/permissions-registry";

interface ProfileHubProps {
  user: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
    location?: string | null;
    role: string;
    roleId?: string | null;
    roleName?: string | null;
    status: string;
    createdAt?: string;
  };
  grantedPermissions: string[];
}

export function ProfileHub({ user, grantedPermissions }: ProfileHubProps) {
  const [activeTab, setActiveTab] = useState<"details" | "security" | "access">("details");

  // Profile form state
  const [name, setName] = useState(user.name || "");
  const [location, setLocation] = useState(user.location || "");
  const [avatarImage, setAvatarImage] = useState<string | null>(user.image || null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Accordion state for permissions breakdown
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({
    "Agent Workspace": true,
    "Capability Studio": true,
    "Business Center": false,
    "Command Center": false,
  });

  const toggleCategory = (cat: string) => {
    setOpenCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const handleAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setProfileError("Image size must be less than 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAvatarImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);
    setProfileSaving(true);

    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          location: location.trim(),
          image: avatarImage,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update profile.");

      setProfileSuccess("Personal details updated successfully.");
      setTimeout(() => setProfileSuccess(null), 4000);
    } catch (err: unknown) {
      setProfileError(err instanceof Error ? err.message : "Error saving profile.");
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }

    setPasswordSaving(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to change password.");

      setPasswordSuccess("Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPasswordSuccess(null), 4000);
    } catch (err: unknown) {
      setPasswordError(err instanceof Error ? err.message : "Error updating password.");
    } finally {
      setPasswordSaving(false);
    }
  };

  // Group permissions by category
  const grantedSet = new Set(grantedPermissions);
  const categories = Array.from(new Set(PERMISSION_REGISTRY.map((p) => p.category)));

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950 p-6 md:p-8 space-y-6 text-slate-100 max-w-6xl mx-auto w-full">
      {/* Profile Header Banner */}
      <div className="relative rounded-2xl border border-slate-900 bg-gradient-to-r from-slate-900/80 via-slate-900/40 to-slate-950 p-6 backdrop-blur-xl">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
          <div className="relative group">
            <div className="h-20 w-20 rounded-2xl overflow-hidden border-2 border-primary/30 bg-slate-800 flex items-center justify-center text-2xl font-bold text-white shadow-xl shadow-black/50">
              {avatarImage ? (
                <img src={avatarImage} alt={user.name} className="h-full w-full object-cover" />
              ) : (
                user.name?.charAt(0).toUpperCase() || "U"
              )}
            </div>
            <label className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-2xl opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity text-white text-xs font-medium">
              <Camera className="h-4 w-4 mr-1" />
              Edit
              <input type="file" accept="image/*" onChange={handleAvatarFile} className="hidden" />
            </label>
          </div>

          <div className="flex-1 text-center sm:text-left">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-white tracking-tight">{name || user.name}</h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 w-fit mx-auto sm:mx-0">
                <Shield className="h-3 w-3 text-indigo-400" />
                {user.roleName || (user.role === "admin" ? "Super Administrator" : "Operator")}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs text-slate-400 font-mono mt-1">
              <span className="flex items-center gap-1.5 text-slate-300">
                <Mail className="h-3.5 w-3.5 text-slate-500" />
                {user.email}
              </span>
              {location && (
                <span className="flex items-center gap-1.5 text-slate-300 font-sans">
                  <MapPin className="h-3.5 w-3.5 text-slate-500" />
                  {location}
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-emerald-400 font-sans font-medium text-[11px] px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle2 className="h-3 w-3" />
                ACTIVE ACCOUNT
              </span>
            </div>
          </div>
        </div>

        {/* Sub-Tabs */}
        <div className="flex items-center gap-2 border-t border-slate-800/60 mt-6 pt-4">
          <button
            onClick={() => setActiveTab("details")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === "details"
                ? "bg-primary text-white shadow-lg shadow-primary/25"
                : "text-slate-400 hover:text-white hover:bg-slate-900"
            }`}
          >
            <User className="h-3.5 w-3.5" />
            Personal Details
          </button>

          <button
            onClick={() => setActiveTab("security")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === "security"
                ? "bg-primary text-white shadow-lg shadow-primary/25"
                : "text-slate-400 hover:text-white hover:bg-slate-900"
            }`}
          >
            <KeyRound className="h-3.5 w-3.5" />
            Security &amp; Credentials
          </button>

          <button
            onClick={() => setActiveTab("access")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === "access"
                ? "bg-primary text-white shadow-lg shadow-primary/25"
                : "text-slate-400 hover:text-white hover:bg-slate-900"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            My Access Profile
          </button>
        </div>
      </div>

      {/* Tab 1: Personal Details */}
      {activeTab === "details" && (
        <div className="rounded-2xl border border-slate-900 bg-slate-900/30 p-6 backdrop-blur-xl">
          <div className="mb-6">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Maintain Personal Information
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Update your public profile display name, avatar, and operational region.
            </p>
          </div>

          {profileSuccess && (
            <div className="mb-4 flex items-center gap-2 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-xs text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>{profileSuccess}</span>
            </div>
          )}

          {profileError && (
            <div className="mb-4 flex items-center gap-2 p-3 rounded-xl border border-red-500/20 bg-red-500/10 text-xs text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{profileError}</span>
            </div>
          )}

          <form onSubmit={handleProfileSubmit} className="space-y-4 max-w-xl">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-primary/50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Email Address (Verified Identity)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  value={user.email}
                  disabled
                  readOnly
                  className="w-full rounded-xl border border-slate-800/80 bg-slate-950 px-3.5 py-2.5 text-xs text-slate-400 font-mono select-none outline-none cursor-not-allowed"
                />
                <span className="shrink-0 inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium px-2.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle2 className="h-3 w-3" />
                  Verified
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Your email address is your verified security identifier and cannot be changed directly.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Location / Operational Region
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. San Francisco, CA / London, UK / Mumbai, IN"
                className="w-full rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-primary/50"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={profileSaving}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-semibold shadow-lg shadow-primary/20 transition-all"
              >
                {profileSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 2: Security & Credentials */}
      {activeTab === "security" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-900 bg-slate-900/30 p-6 backdrop-blur-xl">
            <div className="mb-6">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" />
                Change Account Password
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Ensure your password is at least 8 characters long with a mix of numbers and letters.
              </p>
            </div>

            {passwordSuccess && (
              <div className="mb-4 flex items-center gap-2 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-xs text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <span>{passwordSuccess}</span>
              </div>
            )}

            {passwordError && (
              <div className="mb-4 flex items-center gap-2 p-3 rounded-xl border border-red-500/20 bg-red-500/10 text-xs text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{passwordError}</span>
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-xl">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    placeholder="Enter current password"
                    className="w-full rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-primary/50"
                  />
                  <Lock className="absolute right-3.5 top-3 h-3.5 w-3.5 text-slate-500" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    placeholder="Minimum 8 characters"
                    className="w-full rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-primary/50"
                  />
                  <Lock className="absolute right-3.5 top-3 h-3.5 w-3.5 text-slate-500" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder="Confirm new password"
                    className="w-full rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-primary/50"
                  />
                  <Lock className="absolute right-3.5 top-3 h-3.5 w-3.5 text-slate-500" />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={passwordSaving}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all"
                >
                  {passwordSaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <KeyRound className="h-3.5 w-3.5" />
                  )}
                  Update Password
                </button>
              </div>
            </form>
          </div>

          {/* MFA / OTP Status */}
          <div className="rounded-2xl border border-slate-900 bg-slate-900/30 p-6 backdrop-blur-xl">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
              <Shield className="h-4 w-4 text-emerald-400" />
              Two-Factor &amp; Identity Verification
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Your account enforces mandatory 6-digit email OTP verification on credential resets and administrative actions.
            </p>
            <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-800 bg-slate-900/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">Email OTP Challenge Pipeline</div>
                  <div className="text-[11px] text-slate-400">Linked to {user.email} (10-minute TTL, CSPRNG SHA-256)</div>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider uppercase bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                ACTIVE
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: My Access Profile & Granted Permissions */}
      {activeTab === "access" && (
        <div className="space-y-6">
          {/* Active Profile Summary */}
          <div className="rounded-2xl border border-slate-900 bg-slate-900/30 p-6 backdrop-blur-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h2 className="text-base font-bold text-white">Granted Access Profile</h2>
                </div>
                <p className="text-xs text-slate-400">
                  Your account is bound to the following RBAC profile and authorization matrix.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="px-3.5 py-1.5 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold text-xs">
                  {user.roleName || (user.role === "admin" ? "Super Administrator" : "Operator")}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {grantedSet.size} of {PERMISSION_REGISTRY.length} permissions active
                </span>
              </div>
            </div>

            {/* Categorized Permissions Breakdown */}
            <div className="space-y-3">
              {categories.map((catKey) => {
                const catLabel = CATEGORY_LABELS[catKey as keyof typeof CATEGORY_LABELS] || catKey;
                const catPerms = PERMISSION_REGISTRY.filter((p) => p.category === catKey);
                const grantedInCat = catPerms.filter((p) =>
                  grantedSet.has(`${p.resource}:${p.action}`)
                );
                const isOpen = openCategories[catKey] ?? false;

                return (
                  <div
                    key={catKey}
                    className="rounded-xl border border-slate-800/80 bg-slate-900/40 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => toggleCategory(catKey)}
                      className="w-full flex items-center justify-between p-3.5 text-left hover:bg-slate-900/70 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 text-slate-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-400" />
                        )}
                        <span className="text-xs font-bold text-white tracking-wide">
                          {catLabel}
                        </span>
                      </div>

                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${
                          grantedInCat.length > 0
                            ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                            : "bg-slate-800 text-slate-500 border-slate-700"
                        }`}
                      >
                        {grantedInCat.length} / {catPerms.length} Granted
                      </span>
                    </button>

                    {isOpen && (
                      <div className="p-3.5 pt-0 border-t border-slate-800/50 bg-slate-950/40">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                          {catPerms.map((perm) => {
                            const isGranted = grantedSet.has(`${perm.resource}:${perm.action}`);
                            return (
                              <div
                                key={`${perm.resource}:${perm.action}`}
                                className={`flex items-start gap-2.5 p-2 rounded-lg border text-xs ${
                                  isGranted
                                    ? "bg-emerald-500/5 border-emerald-500/20 text-slate-200"
                                    : "bg-slate-900/30 border-slate-800/50 text-slate-500 opacity-60"
                                }`}
                              >
                                {isGranted ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                                ) : (
                                  <Lock className="h-3.5 w-3.5 text-slate-600 shrink-0 mt-0.5" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="font-semibold text-[11px] truncate">
                                    {perm.action.replace(/_/g, " ").toUpperCase()}
                                  </div>
                                  <div className="text-[10px] text-slate-400 truncate">
                                    {perm.description}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
