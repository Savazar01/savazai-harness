import { headers } from "next/headers";
import { auth, pool, ensureAdminProvisioned } from "@/lib/auth";
import { PERMISSION_REGISTRY, formatPermissionKey } from "@/lib/auth/permissions-registry";

export type AccountStatus = "PENDING_APPROVAL" | "ACTIVE" | "SUSPENDED" | "REJECTED";

export interface AuthenticatedAccessContext {
  userId: string;
  email: string;
  name: string;
  image?: string | null;
  location?: string | null;
  role: string;
  roleId: string | null;
  roleName: string | null;
  status: AccountStatus;
  mustResetPassword: boolean;
  permissions: Set<string>;
}

/**
 * Resolves the database ground-truth status, role, and effective permission set for a userId.
 * Evaluates role permissions + granular user_permission overrides (grant / revoke).
 */
export async function resolveUserAccessById(userId: string): Promise<AuthenticatedAccessContext | null> {
  await ensureAdminProvisioned();

  const userRes = await pool.query(
    `SELECT u."id", u."name", u."email", u."image", u."location", u."role", u."status", u."mustResetPassword", u."roleId", r."name" as "roleName"
     FROM "user" u
     LEFT JOIN "role" r ON u."roleId" = r."id"
     WHERE u."id" = $1
     LIMIT 1`,
    [userId]
  );

  if (userRes.rows.length === 0) return null;
  const u = userRes.rows[0];
  const status = (u.status || "PENDING_APPROVAL") as AccountStatus;
  const mustResetPassword = Boolean(u.mustResetPassword);

  const permissions = new Set<string>();

  //Quarantined / non-active users hold ZERO permissions
  if (status !== "ACTIVE") {
    return {
      userId: u.id,
      email: u.email,
      name: u.name,
      image: u.image || null,
      location: u.location || null,
      role: u.role,
      roleId: u.roleId || null,
      roleName: u.roleName || null,
      status,
      mustResetPassword,
      permissions,
    };
  }

  // Super Administrator fallback for primary admin account
  if (u.role === "admin" && (!u.roleId || u.roleId === "role_super_admin")) {
    for (const p of PERMISSION_REGISTRY) {
      permissions.add(formatPermissionKey(p.resource, p.action));
    }
  }

  // Load permissions from assigned Role
  if (u.roleId) {
    const rolePermRes = await pool.query(
      'SELECT "resource", "action" FROM "role_permission" WHERE "roleId" = $1',
      [u.roleId]
    );
    for (const row of rolePermRes.rows) {
      permissions.add(formatPermissionKey(row.resource, row.action));
    }
  }

  // Overlay granular UserPermission overrides (granted = true adds, granted = false revokes)
  const userPermRes = await pool.query(
    'SELECT "resource", "action", "granted" FROM "user_permission" WHERE "userId" = $1',
    [userId]
  );
  for (const row of userPermRes.rows) {
    const key = formatPermissionKey(row.resource, row.action);
    if (row.granted) {
      permissions.add(key);
    } else {
      permissions.delete(key);
    }
  }

  return {
    userId: u.id,
    email: u.email,
    name: u.name,
    image: u.image || null,
    location: u.location || null,
    role: u.role,
    roleId: u.roleId || null,
    roleName: u.roleName || (u.role === "admin" ? "Super Administrator" : null),
    status,
    mustResetPassword,
    permissions,
  };
}

export async function getSessionAccessContext(): Promise<AuthenticatedAccessContext | null> {
  try {
    await ensureAdminProvisioned();
    const reqHeaders = await headers();
    const session = await auth.api.getSession({ headers: reqHeaders });
    if (!session?.user?.id) return null;
    return await resolveUserAccessById(session.user.id);
  } catch {
    return null;
  }
}

export type PermissionCheckResult =
  | { authorized: true; context: AuthenticatedAccessContext }
  | { authorized: false; response: Response; status: number; error: string };

/**
 * Enforces that the caller is authenticated, ACTIVE, has completed mandatory password reset,
 * and holds the required `resource:action` permission (or at least one of the specified pairs).
 */
export async function requirePermission(
  resource: string,
  action: string | string[]
): Promise<PermissionCheckResult> {
  const ctx = await getSessionAccessContext();

  if (!ctx) {
    const firstAction = Array.isArray(action) ? action[0] : action;
    return {
      authorized: false,
      status: 401,
      error: `Unauthorized: Authentication required for [${resource}:${firstAction}]`,
      response: Response.json(
        { error: `Unauthorized: Authentication required for [${resource}:${firstAction}]` },
        { status: 401 }
      ),
    };
  }

  if (ctx.status === "PENDING_APPROVAL") {
    return {
      authorized: false,
      status: 403,
      error: "Account pending administrator approval and role provisioning.",
      response: Response.json(
        { error: "Account pending administrator approval and role provisioning." },
        { status: 403 }
      ),
    };
  }

  if (ctx.status !== "ACTIVE") {
    return {
      authorized: false,
      status: 403,
      error: `Forbidden: Account status is ${ctx.status}.`,
      response: Response.json(
        { error: `Forbidden: Account status is ${ctx.status}.` },
        { status: 403 }
      ),
    };
  }

  if (ctx.mustResetPassword) {
    return {
      authorized: false,
      status: 403,
      error: "Forbidden: Mandatory first-time password reset required before accessing platform resources.",
      response: Response.json(
        {
          error: "Forbidden: Mandatory first-time password reset required before accessing platform resources.",
          mustResetPassword: true,
        },
        { status: 403 }
      ),
    };
  }

  const actions = Array.isArray(action) ? action : [action];
  const hasAny = actions.some((act) => ctx.permissions.has(formatPermissionKey(resource, act)));

  if (!hasAny) {
    const label = `${resource}:${actions.join("|")}`;
    return {
      authorized: false,
      status: 403,
      error: `403 Forbidden: Missing permission [${label}]`,
      response: Response.json(
        { error: `403 Forbidden: Missing permission [${label}]` },
        { status: 403 }
      ),
    };
  }

  return { authorized: true, context: ctx };
}

/**
 * Helper to determine the first route a user is permitted to view after login or password reset.
 */
export function resolveDefaultLandingRoute(permissions: Set<string> | string[]): string {
  const permSet = permissions instanceof Set ? permissions : new Set(permissions);
  if (permSet.has("agent_workspace:view")) return "/dashboard";
  if (permSet.has("capability_studio:view")) return "/studio";
  if (
    permSet.has("business_center:skills_view") ||
    permSet.has("business_center:okf_view") ||
    permSet.has("business_center:compliance_view")
  ) {
    return "/business";
  }
  if (
    Array.from(permSet).some((p) => p.startsWith("command_center:") && p.endsWith("_view"))
  ) {
    return "/admin/settings";
  }
  if (permSet.has("user_admin:view")) return "/admin/users";
  if (permSet.has("demo_requests:view")) return "/admin/demo-requests";
  if (permSet.has("documentation:view")) return "/docs";
  return "/signin";
}
