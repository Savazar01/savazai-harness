"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { formatPermissionKey } from "./permissions-registry";

export interface UserAccessProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  roleId: string | null;
  roleName: string | null;
  status: "PENDING_APPROVAL" | "ACTIVE" | "SUSPENDED" | "REJECTED";
  mustResetPassword: boolean;
}

interface PermissionsContextValue {
  loading: boolean;
  authenticated: boolean;
  user: UserAccessProfile | null;
  permissions: Set<string>;
  defaultRoute: string;
  captchaChallengeToken: string | null;
  hasPermission: (resource: string, action?: string | string[]) => boolean;
  hasAnyCategoryView: (resource: string) => boolean;
  refreshPermissions: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextValue>({
  loading: true,
  authenticated: false,
  user: null,
  permissions: new Set(),
  defaultRoute: "/signin",
  captchaChallengeToken: null,
  hasPermission: () => false,
  hasAnyCategoryView: () => false,
  refreshPermissions: async () => {},
});

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<UserAccessProfile | null>(null);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [defaultRoute, setDefaultRoute] = useState("/signin");
  const [captchaChallengeToken, setCaptchaChallengeToken] = useState<string | null>(null);

  const fetchPermissions = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me/permissions", { cache: "no-store" });
      if (!res.ok) {
        setAuthenticated(false);
        setUser(null);
        setPermissions(new Set());
        return;
      }
      const data = await res.json();
      if (data.captchaChallengeToken) {
        setCaptchaChallengeToken(data.captchaChallengeToken);
      }
      if (data.authenticated && data.user) {
        setAuthenticated(true);
        setUser(data.user);
        setPermissions(new Set(Array.isArray(data.permissions) ? data.permissions : []));
        setDefaultRoute(data.defaultRoute || "/dashboard");

        // Client-side enforcement of mandatory first-time password reset
        if (
          data.user.mustResetPassword &&
          pathname !== "/reset-password" &&
          pathname !== "/signin" &&
          pathname !== "/signup"
        ) {
          router.replace("/reset-password");
        }
      } else {
        setAuthenticated(false);
        setUser(null);
        setPermissions(new Set());
      }
    } catch {
      // Ignore network errors on initial hydration
    } finally {
      setLoading(false);
    }
  }, [pathname, router]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  useEffect(() => {
    const handler = () => {
      fetchPermissions();
    };
    window.addEventListener("savazai-permissions-updated", handler);
    return () => window.removeEventListener("savazai-permissions-updated", handler);
  }, [fetchPermissions]);

  const hasPermission = useCallback(
    (resource: string, action?: string | string[]): boolean => {
      if (!user || user.status !== "ACTIVE" || user.mustResetPassword) return false;
      // Super Administrator bypass
      if (user.role === "admin" || user.roleName === "Super Administrator") return true;

      if (action === undefined && resource.includes(":")) {
        const parts = resource.split(":");
        return permissions.has(`${parts[0]}:${parts[1]}`);
      }

      const actions = Array.isArray(action) ? action : [action || ""];
      return actions.some((act) => permissions.has(formatPermissionKey(resource, act)));
    },
    [user, permissions]
  );

  const hasAnyCategoryView = useCallback(
    (resource: string): boolean => {
      if (!user || user.status !== "ACTIVE" || user.mustResetPassword) return false;
      for (const perm of permissions) {
        if (perm.startsWith(`${resource}:`) && (perm.endsWith(":view") || perm.endsWith("_view"))) {
          return true;
        }
      }
      return false;
    },
    [user, permissions]
  );

  const value = useMemo(
    () => ({
      loading,
      authenticated,
      user,
      permissions,
      defaultRoute,
      captchaChallengeToken,
      hasPermission,
      hasAnyCategoryView,
      refreshPermissions: fetchPermissions,
    }),
    [
      loading,
      authenticated,
      user,
      permissions,
      defaultRoute,
      captchaChallengeToken,
      hasPermission,
      hasAnyCategoryView,
      fetchPermissions,
    ]
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions() {
  return useContext(PermissionsContext);
}
