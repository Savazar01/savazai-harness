"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  Key,
  Trash2,
  Edit3,
  Search,
  AlertTriangle,
  CheckCircle2,
  X,
  Loader2,
  RefreshCw,
  Mail,
  User as UserIcon,
  Lock,
  Link as LinkIcon,
  Copy,
  Clock,
  Check,
  Sparkles,
  Layers,
  ChevronDown,
  ChevronRight,
  UserCheck,
  UserX,
  ExternalLink,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { PERMISSION_REGISTRY, CATEGORY_LABELS, PermissionDefinition } from "@/lib/auth/permissions-registry";

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  location?: string | null;
  role: "admin" | "user" | string;
  roleId: string | null;
  roleName: string | null;
  status: "PENDING_APPROVAL" | "ACTIVE" | "SUSPENDED" | "REJECTED" | string;
  mustResetPassword: boolean;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  customPermissions?: { resource: string; action: string; granted: boolean }[];
}

export interface RoleWithPermissions {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: { resource: string; action: string }[];
}

export function UserManagement() {
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id;

  // Active top sub-tab
  const [activeTab, setActiveTab] = useState<"active" | "pending" | "matrix">("active");

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [roles, setRoles] = useState<RoleWithPermissions[]>([]);
  const [loading, setLoading] = useState(true);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isCreateRoleOpen, setIsCreateRoleOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);

  // Form states
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Create User Form fields
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createRoleId, setCreateRoleId] = useState<string>("");
  const [createPassword, setCreatePassword] = useState("");

  // Edit User Form fields
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRoleId, setEditRoleId] = useState<string>("");
  const [editStatus, setEditStatus] = useState<string>("ACTIVE");

  // Approve User Form fields
  const [approveRoleId, setApproveRoleId] = useState<string>("");

  // Reset Password fields
  const [resetPassword, setResetPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Create Role Form fields
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [newRolePerms, setNewRolePerms] = useState<Set<string>>(new Set());

  // Invitation Modal State
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteExpiryHours, setInviteExpiryHours] = useState("48");
  const [inviteSendDirectly, setInviteSendDirectly] = useState(false);
  const [inviteGeneratedUrl, setInviteGeneratedUrl] = useState<string | null>(null);
  const [inviteEmailSent, setInviteEmailSent] = useState<boolean | null>(null);
  const [inviteEmailError, setInviteEmailError] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);

  // Fetch users from /api/admin/users
  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const res = await fetch("/api/admin/users");
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load users";
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch roles from /api/admin/roles
  const fetchRoles = useCallback(async () => {
    try {
      setRolesLoading(true);
      const res = await fetch("/api/admin/roles");
      if (res.ok) {
        const data = await res.json();
        setRoles(data.roles || []);
      }
    } catch (err) {
      console.error("Failed to load roles:", err);
    } finally {
      setRolesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchRoles();
  }, [fetchUsers, fetchRoles]);

  // Flash message timeout
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Derived counts
  const pendingUsers = users.filter((u) => u.status === "PENDING_APPROVAL");
  const activeUsers = users.filter((u) => u.status !== "PENDING_APPROVAL");

  // Filtered active users
  const filteredActiveUsers = activeUsers.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole =
      roleFilter === "all" ||
      u.roleId === roleFilter ||
      (roleFilter === "admin" && (u.role === "admin" || u.roleId === "role_super_admin"));
    return matchesSearch && matchesRole;
  });

  // Handle Generate Invite Link with real delivery status feedback
  const handleGenerateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteEmail.includes("@")) {
      setFormError("Valid invitee email address is required.");
      return;
    }
    setFormError(null);
    setFormLoading(true);
    setInviteEmailSent(null);
    setInviteEmailError(null);

    try {
      const res = await fetch("/api/admin/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim().toLowerCase(),
          expiryHours: Number(inviteExpiryHours),
          sendEmailDirectly: inviteSendDirectly,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate invitation.");

      setInviteGeneratedUrl(data.inviteUrl);
      setInviteEmailSent(Boolean(data.emailSent));
      setInviteEmailError(data.emailError || null);

      if (data.emailSent) {
        setSuccessMessage(`Invitation link created and emailed directly to ${data.email}!`);
      } else if (inviteSendDirectly && !data.emailSent) {
        setFormError(data.emailError || "Email dispatch failed. Please share the URL manually.");
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Error generating invitation");
    } finally {
      setFormLoading(false);
    }
  };

  // Handle Approve User
  const handleApproveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    if (!approveRoleId) {
      setFormError("Please select an RBAC Role / Profile for this user.");
      return;
    }

    setFormError(null);
    setFormLoading(true);

    try {
      const res = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "ACTIVE",
          roleId: approveRoleId,
          mustResetPassword: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to approve user");

      setSuccessMessage(`User '${selectedUser.email}' approved and activated with role profile!`);
      setIsApproveOpen(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Error approving user");
    } finally {
      setFormLoading(false);
    }
  };

  // Handle Edit User
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setFormError(null);

    if (!editName.trim() || !editEmail.trim()) {
      setFormError("Name and email are required.");
      return;
    }

    try {
      setFormLoading(true);
      const res = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          email: editEmail.trim().toLowerCase(),
          roleId: editRoleId || null,
          status: editStatus,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update user");

      setSuccessMessage(`User '${data.user?.email || selectedUser.email}' updated successfully.`);
      setIsEditOpen(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Error updating user");
    } finally {
      setFormLoading(false);
    }
  };

  // Handle Password Reset / Force Reset
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setFormError(null);

    if (resetPassword && resetPassword.length < 8) {
      setFormError("Password must be at least 8 characters long.");
      return;
    }

    if (resetPassword && resetPassword !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }

    try {
      setFormLoading(true);
      const payload: { password?: string; mustResetPassword: boolean } = {
        mustResetPassword: true,
      };
      if (resetPassword) {
        payload.password = resetPassword;
      }

      const res = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update password");

      setSuccessMessage(`Password updated / forced reset flag set for '${selectedUser.email}'.`);
      setIsPasswordOpen(false);
      setSelectedUser(null);
      setResetPassword("");
      setConfirmPassword("");
      fetchUsers();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Error resetting password");
    } finally {
      setFormLoading(false);
    }
  };

  // Handle User Deletion / Quarantine Purge
  const handleDeleteSubmit = async () => {
    if (!selectedUser) return;
    setFormError(null);

    try {
      setFormLoading(true);
      const res = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete user");

      setSuccessMessage(`User '${selectedUser.email}' removed from system.`);
      setIsDeleteOpen(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Error deleting user");
    } finally {
      setFormLoading(false);
    }
  };

  // Handle Create Custom Role
  const handleCreateRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) {
      setFormError("Role name is required.");
      return;
    }

    setFormError(null);
    setFormLoading(true);

    try {
      const permsArray = Array.from(newRolePerms).map((key) => {
        const [resource, action] = key.split(":");
        return { resource, action };
      });

      const res = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newRoleName.trim(),
          description: newRoleDesc.trim(),
          permissions: permsArray,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create role");

      setSuccessMessage(`Custom role '${newRoleName}' created successfully.`);
      setIsCreateRoleOpen(false);
      setNewRoleName("");
      setNewRoleDesc("");
      setNewRolePerms(new Set());
      fetchRoles();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Error creating role");
    } finally {
      setFormLoading(false);
    }
  };

  // Group permissions for matrix
  const categories = Array.from(new Set(PERMISSION_REGISTRY.map((p) => p.category)));

  return (
    <div className="flex-1 overflow-y-auto bg-background p-6 md:p-8 space-y-6 text-foreground">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 text-primary">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">User Administration</h1>
              <p className="text-xs text-muted-foreground">
                Manage console accounts, review quarantined onboarding requests, and administer enterprise RBAC profiles.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              fetchUsers();
              fetchRoles();
            }}
            disabled={loading || rolesLoading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border bg-muted/30 hover:bg-card text-muted-foreground text-xs font-medium transition-all"
            title="Refresh user list"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>

          <button
            onClick={() => {
              setInviteEmail("");
              setInviteExpiryHours("48");
              setInviteSendDirectly(false);
              setInviteGeneratedUrl(null);
              setInviteEmailSent(null);
              setInviteEmailError(null);
              setFormError(null);
              setIsInviteModalOpen(true);
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-xs font-semibold shadow-lg shadow-indigo-500/10 transition-all"
          >
            <LinkIcon className="h-3.5 w-3.5 text-indigo-400" />
            Generate Invite Link
          </button>

          <button
            onClick={() => {
              setCreateName("");
              setCreateEmail("");
              setCreateRoleId(roles.find((r) => r.name === "Workspace Operator")?.id || "");
              setCreatePassword("");
              setFormError(null);
              setIsCreateOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-foreground text-xs font-semibold shadow-lg shadow-primary/25 transition-all"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Create User
          </button>
        </div>
      </div>

      {/* Sub-Tab Navigation Bar */}
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <button
          onClick={() => setActiveTab("active")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === "active"
              ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          Active Users Directory ({activeUsers.length})
        </button>

        <button
          onClick={() => setActiveTab("pending")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === "pending"
              ? "bg-amber-600 text-foreground shadow-sm shadow-amber-600/25"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          <Clock className="h-3.5 w-3.5 text-amber-500" />
          Pending Approvals Queue
          {pendingUsers.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40">
              {pendingUsers.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("matrix")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === "matrix"
              ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          Roles &amp; Access Profiles Matrix ({roles.length})
        </button>
      </div>

      {/* Feedback Alerts */}
      {errorMessage && (
        <div className="flex items-center gap-3 p-4 rounded-2xl border border-red-500/20 bg-red-500/10 text-xs text-red-400">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="flex items-center gap-3 p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-xs text-emerald-300">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* ── TAB 1: ACTIVE USERS DIRECTORY ── */}
      {activeTab === "active" && (
        <div className="space-y-4">
          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search active users by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-border bg-card pl-10 pr-4 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs text-muted-foreground font-medium">Filter Profile:</span>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="rounded-xl border border-border bg-card px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary/50"
              >
                <option value="all">All Profiles</option>
                <option value="admin">Super Administrator</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Active Users Table */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold tracking-wider uppercase text-[10px]">
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Assigned Profile</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Created Date</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/60">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-muted-foreground">
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          <span>Loading users directory...</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredActiveUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-muted-foreground">
                        <span>No active users matching criteria.</span>
                      </td>
                    </tr>
                  ) : (
                    filteredActiveUsers.map((user) => {
                      const isSelf = user.id === currentUserId;
                      const isSuperAdmin = user.role === "admin" || user.roleId === "role_super_admin";

                      return (
                        <tr
                          key={user.id}
                          className={`group hover:bg-muted/30 transition-colors ${
                            isSelf ? "bg-primary/5" : ""
                          }`}
                        >
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                                  isSuperAdmin
                                    ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                                    : "bg-slate-800 text-muted-foreground border border-border"
                                }`}
                              >
                                {user.name ? user.name.charAt(0).toUpperCase() : "U"}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
                                    {user.name}
                                  </span>
                                  {isSelf && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 font-semibold">
                                      You
                                    </span>
                                  )}
                                </div>
                                <div className="text-muted-foreground font-mono text-[11px]">{user.email}</div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide ${
                                isSuperAdmin
                                  ? "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                                  : "bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
                              }`}
                            >
                              <ShieldCheck className="h-3.5 w-3.5" />
                              {user.roleName || (isSuperAdmin ? "Super Administrator" : "Workspace Operator")}
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border ${
                                user.status === "ACTIVE"
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                  : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                              }`}
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-current" />
                              {user.status}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-muted-foreground font-mono text-[11px]">
                            {new Date(user.createdAt).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => {
                                  setSelectedUser(user);
                                  setEditName(user.name);
                                  setEditEmail(user.email);
                                  setEditRoleId(user.roleId || "");
                                  setEditStatus(user.status);
                                  setFormError(null);
                                  setIsEditOpen(true);
                                }}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-slate-800 transition-colors"
                                title="Edit profile & assigned role"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>

                              <button
                                onClick={() => {
                                  setSelectedUser(user);
                                  setResetPassword("");
                                  setConfirmPassword("");
                                  setFormError(null);
                                  setIsPasswordOpen(true);
                                }}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
                                title="Change or force password reset"
                              >
                                <Key className="h-3.5 w-3.5" />
                              </button>

                              {!isSelf && (
                                <button
                                  onClick={() => {
                                    setSelectedUser(user);
                                    setFormError(null);
                                    setIsDeleteOpen(true);
                                  }}
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                  title="Delete user"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: PENDING APPROVALS QUEUE ── */}
      {activeTab === "pending" && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 text-xs text-amber-300 flex items-start gap-3">
            <Clock className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-200 text-sm">Quarantine State Enforced</p>
              <p className="text-amber-300/80 mt-1 leading-relaxed">
                The users below have completed 6-digit email OTP verification via an invitation link, but hold{" "}
                <strong>ZERO permissions</strong>. An administrator must explicitly review and assign an RBAC Role Profile before they can sign in or access any workspace capabilities.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold tracking-wider uppercase text-[10px]">
                    <th className="py-3 px-4">Applicant</th>
                    <th className="py-3 px-4">Verification Status</th>
                    <th className="py-3 px-4">Requested At</th>
                    <th className="py-3 px-4 text-right">Approval Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pendingUsers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-muted-foreground">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <CheckCircle2 className="h-8 w-8 text-emerald-400/40" />
                          <span className="font-semibold text-muted-foreground">Approvals Queue is Clear</span>
                          <span className="text-[11px] text-slate-600">No quarantined accounts awaiting administrator review.</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    pendingUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 flex items-center justify-center font-bold text-xs">
                              {user.name ? user.name.charAt(0).toUpperCase() : "Q"}
                            </div>
                            <div>
                              <div className="font-semibold text-foreground">{user.name}</div>
                              <div className="text-muted-foreground font-mono text-[11px]">{user.email}</div>
                            </div>
                          </div>
                        </td>

                        <td className="py-4 px-4">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                            Email OTP Verified
                          </span>
                        </td>

                        <td className="py-4 px-4 text-muted-foreground font-mono text-[11px]">
                          {new Date(user.createdAt).toLocaleString(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </td>

                        <td className="py-4 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setSelectedUser(user);
                                setApproveRoleId(
                                  roles.find((r) => r.name === "Workspace Operator")?.id || ""
                                );
                                setFormError(null);
                                setIsApproveOpen(true);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-foreground text-xs font-semibold shadow-lg shadow-emerald-600/20 transition-all"
                            >
                              <UserCheck className="h-3.5 w-3.5" />
                              Approve &amp; Assign Profile
                            </button>

                            <button
                              onClick={() => {
                                setSelectedUser(user);
                                setFormError(null);
                                setIsDeleteOpen(true);
                              }}
                              className="p-1.5 rounded-xl text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                              title="Reject & Purge Request"
                            >
                              <UserX className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: ROLES & ACCESS PROFILES MATRIX ── */}
      {activeTab === "matrix" && (
        <div className="space-y-6">
          {/* Header & Create Role Button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-indigo-400" />
                Predefined System Roles &amp; Dynamic RBAC Matrix
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                The platform enforces 53 granular permissions grouped across 7 operational modules.
              </p>
            </div>

            <button
              onClick={() => {
                setNewRoleName("");
                setNewRoleDesc("");
                setNewRolePerms(new Set());
                setFormError(null);
                setIsCreateRoleOpen(true);
              }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-foreground text-xs font-semibold shadow-lg shadow-indigo-600/25 transition-all w-fit"
            >
              <Sparkles className="h-3.5 w-3.5" />
              + Create Custom Profile
            </button>
          </div>

          {/* Role Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {roles.map((r) => (
              <div
                key={r.id}
                className="rounded-2xl border border-border bg-muted/30 p-5 hover:border-border transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h3 className="text-sm font-bold text-foreground tracking-wide">{r.name}</h3>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${
                        r.isSystem
                          ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/30"
                          : "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                      }`}
                    >
                      {r.isSystem ? "System Profile" : "Custom"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {r.description || "No description provided."}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs font-mono text-muted-foreground">
                  <span>Authorized Capabilities:</span>
                  <span className="font-bold text-foreground bg-slate-800 px-2 py-0.5 rounded-md">
                    {r.permissions?.length || 0} / {PERMISSION_REGISTRY.length}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Interactive 53-Permission Matrix Table */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
            <div className="p-4 border-b border-border bg-muted/40 flex items-center justify-between">
              <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                Full Platform Authorization Matrix (53 Permissions)
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                {roles.length} Roles Registered
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-muted-foreground font-semibold tracking-wider text-[11px]">
                    <th className="py-3 px-4 min-w-[280px]">Module &amp; Action</th>
                    {roles.map((r) => (
                      <th key={r.id} className="py-3 px-3 text-center min-w-[120px]">
                        <div className="font-semibold text-foreground truncate">{r.name}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {categories.map((catKey) => {
                    const catLabel = CATEGORY_LABELS[catKey as keyof typeof CATEGORY_LABELS] || catKey;
                    const catPerms = PERMISSION_REGISTRY.filter((p) => p.category === catKey);

                    return (
                      <React.Fragment key={catKey}>
                        <tr className="bg-muted/70">
                          <td
                            colSpan={roles.length + 1}
                            className="py-2 px-4 font-bold text-xs text-primary uppercase tracking-wider"
                          >
                            {catLabel} ({catPerms.length} actions)
                          </td>
                        </tr>

                        {catPerms.map((perm) => (
                          <tr key={`${perm.resource}:${perm.action}`} className="hover:bg-muted/30">
                            <td className="py-2.5 px-4">
                              <div className="font-medium text-foreground font-mono text-[11px]">
                                {perm.action.replace(/_/g, " ").toUpperCase()}
                              </div>
                              <div className="text-[10px] text-muted-foreground truncate max-w-sm">
                                {perm.description}
                              </div>
                            </td>

                            {roles.map((r) => {
                              const isGranted = r.permissions?.some(
                                (rp) => rp.resource === perm.resource && rp.action === perm.action
                              );

                              return (
                                <td key={r.id} className="py-2.5 px-3 text-center">
                                  {isGranted ? (
                                    <div className="inline-flex p-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                      <Check className="h-3 w-3 stroke-[3]" />
                                    </div>
                                  ) : (
                                    <div className="inline-flex p-1 rounded-md bg-card text-slate-600">
                                      <Lock className="h-3 w-3" />
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: APPROVE & ASSIGN PROFILE ── */}
      {isApproveOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card text-card-foreground p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  <UserCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Approve Quarantined User</h3>
                  <p className="text-xs text-muted-foreground">Assign role profile and activate account access.</p>
                </div>
              </div>
              <button
                onClick={() => setIsApproveOpen(false)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {formError && (
              <div className="flex items-center gap-2 p-3 rounded-xl border border-red-500/20 bg-red-500/10 text-xs text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="p-3.5 rounded-xl border border-border bg-muted/30 space-y-1 text-xs">
              <div className="font-semibold text-foreground">{selectedUser.name}</div>
              <div className="text-muted-foreground font-mono text-[11px]">{selectedUser.email}</div>
              <div className="text-emerald-400 text-[10px] font-semibold flex items-center gap-1 mt-1">
                <CheckCircle2 className="h-3 w-3" />
                Email OTP Verified on Onboarding
              </div>
            </div>

            <form onSubmit={handleApproveSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Select RBAC Role Profile <span className="text-red-400">*</span>
                </label>
                <select
                  value={approveRoleId}
                  onChange={(e) => setApproveRoleId(e.target.value)}
                  required
                  className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-xs text-foreground outline-none focus:border-primary/50"
                >
                  <option value="" disabled>
                    -- Choose an Access Profile --
                  </option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.permissions?.length || 0} permissions)
                    </option>
                  ))}
                </select>
                {approveRoleId && (
                  <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed bg-muted/30 p-2.5 rounded-lg border border-border">
                    {roles.find((r) => r.id === approveRoleId)?.description}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsApproveOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-foreground text-xs font-semibold shadow-lg shadow-emerald-600/20"
                >
                  {formLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Approve &amp; Activate Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: GENERATE ONBOARDING INVITE LINK ── */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card text-card-foreground p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
                  <LinkIcon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Generate Onboarding Invite Link</h3>
                  <p className="text-xs text-muted-foreground">
                    Create a cryptographic, time-bounded URL for pre-authorized user registration.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsInviteModalOpen(false)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {formError && (
              <div className="flex items-center gap-2 p-3 rounded-xl border border-red-500/20 bg-red-500/10 text-xs text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {!inviteGeneratedUrl ? (
              <form onSubmit={handleGenerateInvite} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Invitee Email Address
                  </label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="operator@company.com"
                    required
                    className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-xs text-foreground placeholder-slate-500 outline-none focus:border-primary/50"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    The registration form will be locked strictly to this verified email address.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Link Expiration Duration
                  </label>
                  <select
                    value={inviteExpiryHours}
                    onChange={(e) => setInviteExpiryHours(e.target.value)}
                    className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-xs text-foreground outline-none focus:border-primary/50"
                  >
                    <option value="24">24 Hours (Recommended)</option>
                    <option value="48">48 Hours</option>
                    <option value="72">72 Hours</option>
                    <option value="168">7 Days</option>
                  </select>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 p-3">
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">Dispatch Email Directly</span>
                    <p className="text-[11px] text-muted-foreground">
                      Send the invitation URL directly to invitee's inbox via configured SMTP.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={inviteSendDirectly}
                    onChange={(e) => setInviteSendDirectly(e.target.checked)}
                    className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setIsInviteModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={formLoading}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-foreground text-xs font-semibold shadow-lg shadow-indigo-600/20"
                  >
                    {formLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Generate Secure Link
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                {/* Email Delivery Feedback Banner */}
                {inviteSendDirectly && inviteEmailSent === true ? (
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-start gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-emerald-200">Invitation Email Dispatched</p>
                      <p className="text-[11px] text-emerald-300/80 mt-0.5">
                        Delivered successfully to <strong>{inviteEmail}</strong>. You may also copy the backup URL below.
                      </p>
                    </div>
                  </div>
                ) : inviteSendDirectly && inviteEmailSent === false ? (
                  <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-amber-200">Email Delivery Issue</p>
                      <p className="text-[11px] text-amber-300/80 mt-0.5">
                        SMTP delivery failed: {inviteEmailError || "Check Command Center System Admin credentials"}. Please copy the secure link below and share it directly.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 flex items-start gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-indigo-200">Invitation Link Active</p>
                      <p className="text-[11px] text-indigo-300/80 mt-0.5">
                        Valid for <strong>{inviteEmail}</strong>. Provide this URL to the operator to complete onboarding.
                      </p>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Pre-Authorized Onboarding URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={inviteGeneratedUrl}
                      className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-xs text-muted-foreground font-mono select-all outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(inviteGeneratedUrl);
                        setInviteCopied(true);
                        setTimeout(() => setInviteCopied(false), 3000);
                      }}
                      className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-primary text-foreground text-xs font-semibold shrink-0 hover:bg-primary/90"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {inviteCopied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-border">
                  <button
                    type="button"
                    onClick={() => {
                      setInviteGeneratedUrl(null);
                      setInviteEmail("");
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    Create Another
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsInviteModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-card border border-border text-xs font-semibold text-foreground hover:bg-slate-800"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL: EDIT ACTIVE USER ── */}
      {isEditOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card text-card-foreground p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-foreground">Edit User Profile &amp; Role</h3>
              <button
                onClick={() => setIsEditOpen(false)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {formError && (
              <div className="flex items-center gap-2 p-3 rounded-xl border border-red-500/20 bg-red-500/10 text-xs text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Full Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2 text-xs text-foreground outline-none focus:border-primary/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Email</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  required
                  className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2 text-xs text-foreground outline-none focus:border-primary/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Assigned Role Profile</label>
                <select
                  value={editRoleId}
                  onChange={(e) => setEditRoleId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2 text-xs text-foreground outline-none focus:border-primary/50"
                >
                  <option value="">-- No Profile Assigned (User Level) --</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Account Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2 text-xs text-foreground outline-none focus:border-primary/50"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="SUSPENDED">SUSPENDED</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-foreground text-xs font-semibold"
                >
                  {formLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: CREATE CUSTOM ROLE ── */}
      {isCreateRoleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card text-card-foreground p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <Sparkles className="h-5 w-5 text-primary" />
                <h3 className="text-base font-bold text-foreground">Create Custom Enterprise Profile</h3>
              </div>
              <button
                onClick={() => setIsCreateRoleOpen(false)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {formError && (
              <div className="flex items-center gap-2 p-3 rounded-xl border border-red-500/20 bg-red-500/10 text-xs text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateRoleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Profile Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    placeholder="e.g. Compliance Auditor Lead"
                    required
                    className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2 text-xs text-foreground outline-none focus:border-primary/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={newRoleDesc}
                    onChange={(e) => setNewRoleDesc(e.target.value)}
                    placeholder="Purpose and duty boundary of this role"
                    className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2 text-xs text-foreground outline-none focus:border-primary/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground mb-2">
                  Select Granted Permissions ({newRolePerms.size} selected)
                </label>
                <div className="space-y-3 max-h-72 overflow-y-auto border border-border rounded-xl p-3 bg-muted/30">
                  {categories.map((catKey) => {
                    const catLabel = CATEGORY_LABELS[catKey as keyof typeof CATEGORY_LABELS] || catKey;
                    const catPerms = PERMISSION_REGISTRY.filter((p) => p.category === catKey);

                    return (
                      <div key={catKey} className="space-y-1.5">
                        <div className="text-[11px] font-bold text-indigo-400 uppercase tracking-wide border-b border-border pb-1">
                          {catLabel}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {catPerms.map((p) => {
                            const key = `${p.resource}:${p.action}`;
                            const isChecked = newRolePerms.has(key);

                            return (
                              <label
                                key={key}
                                className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-800/40 cursor-pointer text-xs text-muted-foreground"
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    const next = new Set(newRolePerms);
                                    if (e.target.checked) next.add(key);
                                    else next.delete(key);
                                    setNewRolePerms(next);
                                  }}
                                  className="h-3.5 w-3.5 rounded border-border bg-background text-indigo-600 focus:ring-indigo-600"
                                />
                                <span className="truncate text-[11px] font-mono">
                                  {p.action.replace(/_/g, " ")}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsCreateRoleOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-foreground text-xs font-semibold shadow-lg shadow-indigo-600/20"
                >
                  {formLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Save Custom Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: PASSWORD RESET / FORCE RESET ── */}
      {isPasswordOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card text-card-foreground p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-foreground">Reset Password &amp; Force Reset</h3>
              <button
                onClick={() => setIsPasswordOpen(false)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {formError && (
              <div className="flex items-center gap-2 p-3 rounded-xl border border-red-500/20 bg-red-500/10 text-xs text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Reset password for <strong>{selectedUser.email}</strong>. Setting a temporary password will require the user to change it on their next login.
            </p>

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">New Password (Optional)</label>
                <input
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="Leave empty to only flag for password reset"
                  className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2 text-xs text-foreground outline-none focus:border-primary/50"
                />
              </div>

              {resetPassword && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder="Confirm new password"
                    className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2 text-xs text-foreground outline-none focus:border-primary/50"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsPasswordOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-foreground text-xs font-semibold"
                >
                  {formLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Apply Reset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: DELETE USER ── */}
      {isDeleteOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card text-card-foreground p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-destructive">
              <AlertTriangle className="h-6 w-6" />
              <h3 className="text-base font-bold text-foreground">
                {selectedUser.status === "PENDING_APPROVAL" ? "Reject & Purge Request" : "Delete Account"}
              </h3>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to permanently delete{" "}
              <strong className="text-foreground">{selectedUser.name}</strong> (<code>{selectedUser.email}</code>)? This action immediately invalidates any sessions and purges credential records.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setIsDeleteOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteSubmit}
                disabled={formLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs font-semibold"
              >
                {formLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Confirm Deletion
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: CREATE USER ── */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card text-card-foreground p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-foreground">Create Platform User</h3>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {formError && (
              <div className="flex items-center gap-2 p-3 rounded-xl border border-red-500/20 bg-red-500/10 text-xs text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setFormError(null);
                setFormLoading(true);

                try {
                  const res = await fetch("/api/admin/users", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      name: createName.trim(),
                      email: createEmail.trim().toLowerCase(),
                      password: createPassword,
                      roleId: createRoleId || null,
                      status: "ACTIVE",
                      mustResetPassword: true,
                    }),
                  });

                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error || "Failed to create user");

                  setSuccessMessage(`User '${createEmail}' provisioned successfully.`);
                  setIsCreateOpen(false);
                  fetchUsers();
                } catch (err: unknown) {
                  setFormError(err instanceof Error ? err.message : "Error creating user");
                } finally {
                  setFormLoading(false);
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Full Name</label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  required
                  placeholder="Operator Name"
                  className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2 text-xs text-foreground outline-none focus:border-primary/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Email Address</label>
                <input
                  type="email"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  required
                  placeholder="operator@company.com"
                  className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2 text-xs text-foreground outline-none focus:border-primary/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Assigned Profile</label>
                <select
                  value={createRoleId}
                  onChange={(e) => setCreateRoleId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2 text-xs text-foreground outline-none focus:border-primary/50"
                >
                  <option value="">-- No Profile Assigned (Quarantined) --</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Initial Password</label>
                <input
                  type="password"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  required
                  placeholder="Minimum 8 characters"
                  className="w-full rounded-xl border border-border bg-muted/30 px-3.5 py-2 text-xs text-foreground outline-none focus:border-primary/50"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-foreground text-xs font-semibold"
                >
                  {formLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Create &amp; Provision
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
