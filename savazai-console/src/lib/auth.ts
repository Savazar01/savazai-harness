import { betterAuth } from "better-auth";
import { hashPassword } from "better-auth/crypto";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { SYSTEM_ROLES } from "@/lib/auth/permissions-registry";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export function cleanEnv(val?: string | null): string | null {
  if (!val) return null;
  let s = val.trim();
  while ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s || null;
}

let adminBootstrapped = false;

export async function ensureAdminProvisioned() {
  if (adminBootstrapped) return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const adminEmail = cleanEnv(process.env.ADMIN_EMAIL)?.toLowerCase() || "savazar01@gmail.com";
  const adminPassword = cleanEnv(process.env.ADMIN_PASSWORD);
  const adminName = cleanEnv(process.env.ADMIN_NAME) || "System Administrator";

  try {
    // 1. Bootstrap Zero-Trust Account & RBAC Tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "role" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL UNIQUE,
        "description" TEXT,
        "isSystem" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "user" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "email" TEXT NOT NULL UNIQUE,
        "emailVerified" BOOLEAN NOT NULL DEFAULT false,
        "image" TEXT,
        "role" TEXT NOT NULL DEFAULT 'user',
        "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
        "mustResetPassword" BOOLEAN NOT NULL DEFAULT true,
        "roleId" TEXT REFERENCES "role"("id") ON DELETE SET NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL';
      ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "mustResetPassword" BOOLEAN NOT NULL DEFAULT true;
      ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "roleId" TEXT REFERENCES "role"("id") ON DELETE SET NULL;
      ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "image" TEXT;
      ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "location" TEXT;
      ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "roles" TEXT[] DEFAULT ARRAY[]::TEXT[];

      CREATE TABLE IF NOT EXISTS "user_assigned_role" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "roleId" TEXT NOT NULL REFERENCES "role"("id") ON DELETE CASCADE,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE("userId", "roleId")
      );
      CREATE INDEX IF NOT EXISTS "user_assigned_role_user_idx" ON "user_assigned_role"("userId");
      CREATE INDEX IF NOT EXISTS "user_assigned_role_role_idx" ON "user_assigned_role"("roleId");

      -- Auto-migrate existing single roleId mappings to user_assigned_role
      INSERT INTO "user_assigned_role" ("id", "userId", "roleId")
      SELECT gen_random_uuid()::text, "id", "roleId"
      FROM "user"
      WHERE "roleId" IS NOT NULL
      ON CONFLICT ("userId", "roleId") DO NOTHING;

      CREATE TABLE IF NOT EXISTS "role_permission" (
        "id" TEXT PRIMARY KEY,
        "roleId" TEXT NOT NULL REFERENCES "role"("id") ON DELETE CASCADE,
        "resource" TEXT NOT NULL,
        "action" TEXT NOT NULL,
        UNIQUE("roleId", "resource", "action")
      );

      CREATE TABLE IF NOT EXISTS "user_permission" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "resource" TEXT NOT NULL,
        "action" TEXT NOT NULL,
        "granted" BOOLEAN NOT NULL DEFAULT true,
        UNIQUE("userId", "resource", "action")
      );

      CREATE TABLE IF NOT EXISTS "verification_token" (
        "id" TEXT PRIMARY KEY,
        "identifier" TEXT NOT NULL,
        "token" TEXT NOT NULL,
        "purpose" TEXT NOT NULL DEFAULT 'onboarding',
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "attempts" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "verification_token_identifier_idx" ON "verification_token"("identifier");

      CREATE TABLE IF NOT EXISTS "email_audit_logs" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "recipient" TEXT NOT NULL,
        "subject" TEXT NOT NULL,
        "purpose" TEXT NOT NULL,
        "status" VARCHAR(50) NOT NULL,
        "error" TEXT,
        "metadata" JSONB DEFAULT '{}',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "email_audit_recipient_idx" ON "email_audit_logs"("recipient");
      CREATE INDEX IF NOT EXISTS "email_audit_created_at_idx" ON "email_audit_logs"("created_at");

      CREATE TABLE IF NOT EXISTS "email_templates" (
        "id" TEXT PRIMARY KEY,
        "template_key" VARCHAR(128) NOT NULL UNIQUE,
        "name" VARCHAR(256) NOT NULL,
        "category" VARCHAR(64) NOT NULL,
        "description" TEXT,
        "subject" TEXT NOT NULL,
        "body_html" TEXT NOT NULL,
        "body_markdown" TEXT,
        "supported_variables" JSONB DEFAULT '[]',
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "email_templates_category_idx" ON "email_templates"("category");

      CREATE TABLE IF NOT EXISTS "system_audit_logs" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" TEXT,
        "user_email" TEXT,
        "category" VARCHAR(64) DEFAULT 'SYSTEM',
        "action" VARCHAR(128) NOT NULL,
        "resource" VARCHAR(128) NOT NULL,
        "target_id" TEXT,
        "target_name" TEXT,
        "details" JSONB DEFAULT '{}',
        "ip_address" TEXT,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE "system_audit_logs" ADD COLUMN IF NOT EXISTS "category" VARCHAR(64) DEFAULT 'SYSTEM';
      ALTER TABLE "system_audit_logs" ADD COLUMN IF NOT EXISTS "target_id" TEXT;
      ALTER TABLE "system_audit_logs" ADD COLUMN IF NOT EXISTS "target_name" TEXT;
      CREATE INDEX IF NOT EXISTS "system_audit_action_idx" ON "system_audit_logs"("action");
      CREATE INDEX IF NOT EXISTS "system_audit_resource_idx" ON "system_audit_logs"("resource");
      CREATE INDEX IF NOT EXISTS "system_audit_category_idx" ON "system_audit_logs"("category");
      CREATE INDEX IF NOT EXISTS "system_audit_created_at_idx" ON "system_audit_logs"("created_at");

      CREATE TABLE IF NOT EXISTS "asset_revisions" (
        "id" TEXT PRIMARY KEY,
        "asset_type" VARCHAR(32) NOT NULL,
        "asset_key" VARCHAR(128) NOT NULL,
        "version" VARCHAR(32) NOT NULL,
        "content" TEXT NOT NULL,
        "metadata_snapshot" JSONB NOT NULL DEFAULT '{}',
        "author_id" TEXT NOT NULL,
        "author_email" TEXT NOT NULL,
        "change_summary" TEXT,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "asset_revisions_key_idx" ON "asset_revisions"("asset_key");
      CREATE INDEX IF NOT EXISTS "asset_revisions_type_idx" ON "asset_revisions"("asset_type");
      CREATE INDEX IF NOT EXISTS "asset_revisions_created_at_idx" ON "asset_revisions"("created_at");

      CREATE TABLE IF NOT EXISTS "prompt_revisions" (
        "id" TEXT PRIMARY KEY,
        "agent_id" TEXT NOT NULL,
        "agentflow_id" TEXT NOT NULL,
        "version_number" INTEGER NOT NULL,
        "system_prompt" TEXT NOT NULL,
        "author_id" TEXT NOT NULL,
        "author_email" TEXT NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "prompt_revisions_agent_idx" ON "prompt_revisions"("agent_id");
      CREATE INDEX IF NOT EXISTS "prompt_revisions_flow_idx" ON "prompt_revisions"("agentflow_id");
      CREATE INDEX IF NOT EXISTS "prompt_revisions_created_at_idx" ON "prompt_revisions"("created_at");

      CREATE TABLE IF NOT EXISTS "session" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "token" TEXT NOT NULL UNIQUE,
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "ipAddress" TEXT,
        "userAgent" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "account" (
        "id" TEXT PRIMARY KEY,
        "accountId" TEXT NOT NULL,
        "providerId" TEXT NOT NULL,
        "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "accessToken" TEXT,
        "refreshToken" TEXT,
        "idToken" TEXT,
        "accessTokenExpiresAt" TIMESTAMPTZ,
        "refreshTokenExpiresAt" TIMESTAMPTZ,
        "scope" TEXT,
        "password" TEXT,
        "issuer" TEXT DEFAULT 'local:credential',
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "verification" (
        "id" TEXT PRIMARY KEY,
        "identifier" TEXT NOT NULL,
        "value" TEXT NOT NULL,
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "createdAt" TIMESTAMPTZ DEFAULT now(),
        "updatedAt" TIMESTAMPTZ DEFAULT now()
      );

      ALTER TABLE "account" ADD COLUMN IF NOT EXISTS "issuer" TEXT DEFAULT 'local:credential';
      UPDATE "account" SET "issuer" = 'local:credential' WHERE "issuer" IS NULL OR "issuer" = '';
    `);

    // 2. Seed Predefined System Roles & Permissions idempotently
    for (const sysRole of SYSTEM_ROLES) {
      await pool.query(
        `INSERT INTO "role" ("id", "name", "description", "isSystem", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, now(), now())
         ON CONFLICT ("name") DO UPDATE SET
           "description" = EXCLUDED."description",
           "isSystem" = EXCLUDED."isSystem",
           "updatedAt" = now()`,
        [sysRole.id, sysRole.name, sysRole.description, sysRole.isSystem]
      );

      const roleRowRes = await pool.query('SELECT "id" FROM "role" WHERE "name" = $1 LIMIT 1', [sysRole.name]);
      const effectiveRoleId = roleRowRes.rows[0]?.id || sysRole.id;

      for (const perm of sysRole.permissions) {
        const permId = `rp_${effectiveRoleId}_${perm.resource}_${perm.action}`;
        await pool.query(
          `INSERT INTO "role_permission" ("id", "roleId", "resource", "action")
           VALUES ($1, $2, $3, $4)
           ON CONFLICT ("roleId", "resource", "action") DO NOTHING`,
          [permId, effectiveRoleId, perm.resource, perm.action]
        );
      }
    }

    const superAdminRoleRes = await pool.query(
      'SELECT "id" FROM "role" WHERE "name" = \'Super Administrator\' LIMIT 1'
    );
    const superAdminRoleId = superAdminRoleRes.rows[0]?.id || "role_super_admin";

    // 3. Quarantine any existing non-admin users that lack a provisioned roleId
    await pool.query(
      `UPDATE "user"
       SET "status" = 'PENDING_APPROVAL',
           "roleId" = NULL
       WHERE LOWER("email") != $1
         AND "role" != 'admin'
         AND "roleId" IS NULL`,
      [adminEmail]
    );
    // Revoke active sessions for any quarantined users
    await pool.query(
      `DELETE FROM "session"
       WHERE "userId" IN (SELECT "id" FROM "user" WHERE "status" != 'ACTIVE')`
    );

    // 4. Provision / Synchronize Primary Super Administrator
    const userRes = await pool.query('SELECT id, role FROM "user" WHERE LOWER(email) = $1 LIMIT 1', [adminEmail]);

    if (userRes.rows.length > 0) {
      const user = userRes.rows[0];
      await pool.query(
        `UPDATE "user"
         SET name = $1,
             email = $2,
             role = 'admin',
             "status" = 'ACTIVE',
             "mustResetPassword" = false,
             "roleId" = $3,
             "emailVerified" = true,
             "updatedAt" = now()
         WHERE id = $4`,
        [adminName, adminEmail, superAdminRoleId, user.id]
      );

      if (adminPassword) {
        const hashedPassword = await hashPassword(adminPassword);
        const accountRes = await pool.query('SELECT id FROM "account" WHERE "userId" = $1 AND "providerId" = \'credential\' LIMIT 1', [user.id]);
        if (accountRes.rows.length > 0) {
          await pool.query('UPDATE "account" SET password = $1, "issuer" = \'local:credential\', "updatedAt" = now() WHERE "userId" = $2 AND "providerId" = \'credential\'', [hashedPassword, user.id]);
        } else {
          const accountId = randomUUID();
          await pool.query('INSERT INTO "account" (id, "userId", "accountId", "providerId", "issuer", password, "createdAt", "updatedAt") VALUES ($1, $2, $2, \'credential\', \'local:credential\', $3, now(), now())', [accountId, user.id, hashedPassword]);
        }
      }
      console.log(`[Better Auth Init] Synchronized Super Administrator account: ${adminEmail}`);
    } else if (adminPassword) {
      const userId = randomUUID();
      const accountId = randomUUID();
      const hashedPassword = await hashPassword(adminPassword);
      await pool.query(
        `INSERT INTO "user" (id, name, email, "emailVerified", role, "status", "mustResetPassword", "roleId", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, true, 'admin', 'ACTIVE', false, $4, now(), now())`,
        [userId, adminName, adminEmail, superAdminRoleId]
      );
      await pool.query(
        `INSERT INTO "account" (id, "userId", "accountId", "providerId", "issuer", password, "createdAt", "updatedAt")
         VALUES ($1, $2, $2, 'credential', 'local:credential', $3, now(), now())`,
        [accountId, userId, hashedPassword]
      );
      console.log(`[Better Auth Init] Created initial Super Administrator credentials for: ${adminEmail}`);
    }

    // Ensure any other explicitly marked 'admin' accounts have Super Administrator roleId and ACTIVE status
    await pool.query(
      `UPDATE "user"
       SET "status" = 'ACTIVE',
           "mustResetPassword" = false,
           "roleId" = $1
       WHERE "role" = 'admin' AND "roleId" IS NULL`,
      [superAdminRoleId]
    );

    adminBootstrapped = true;
  } catch (err) {
    console.error("[Better Auth Init] Failed to provision RBAC schema & admin credentials:", err);
  }
}

if (process.env.NEXT_PHASE !== "phase-production-build") {
  ensureAdminProvisioned().catch((err) => {
    console.error("[Better Auth Init] Immediate bootstrap error:", err);
  });
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3056",
  secret: process.env.BETTER_AUTH_SECRET || "savazai_secure_auth_secret_development_vault_key_2026",
  database: pool,
  trustedOrigins: [
    "http://localhost:3056",
    "http://localhost:3055",
    process.env.BETTER_AUTH_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ].filter(Boolean) as string[],
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 50,
    storage: "memory",
    customRules: {
      "/sign-in/email": {
        window: 60,
        max: 5,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // Zero-Trust Lockdown: Any user created via Better-Auth hooks is strictly quarantined
          // with PENDING_APPROVAL, mustResetPassword = true, role = 'user', and roleId = null.
          return {
            data: {
              ...user,
              role: "user",
              status: "PENDING_APPROVAL",
              mustResetPassword: true,
              roleId: null,
              emailVerified: false,
            },
          };
        },
      },
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "user",
      },
      status: {
        type: "string",
        defaultValue: "PENDING_APPROVAL",
      },
      mustResetPassword: {
        type: "boolean",
        defaultValue: true,
      },
      roleId: {
        type: "string",
        required: false,
      },
    },
  },
});
