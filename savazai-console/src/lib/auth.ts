import { betterAuth } from "better-auth";
import { hashPassword } from "better-auth/crypto";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";

const pool = new Pool({
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

  const adminEmail = cleanEnv(process.env.ADMIN_EMAIL)?.toLowerCase();
  const adminPassword = cleanEnv(process.env.ADMIN_PASSWORD);
  const adminName = cleanEnv(process.env.ADMIN_NAME) || "System Administrator";

  if (!adminEmail || !adminPassword) {
    return;
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "user" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "email" TEXT NOT NULL UNIQUE,
        "emailVerified" BOOLEAN NOT NULL DEFAULT false,
        "image" TEXT,
        "role" TEXT NOT NULL DEFAULT 'user',
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
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
    `);

    const userRes = await pool.query('SELECT id, role FROM "user" WHERE LOWER(email) = $1 LIMIT 1', [adminEmail]);
    const hashedPassword = await hashPassword(adminPassword);

    if (userRes.rows.length > 0) {
      const user = userRes.rows[0];
      await pool.query('UPDATE "user" SET name = $1, role = \'admin\', "emailVerified" = true, "updatedAt" = now() WHERE id = $2', [adminName, user.id]);
      
      const accountRes = await pool.query('SELECT id FROM "account" WHERE "userId" = $1 AND "providerId" = \'credential\' LIMIT 1', [user.id]);
      if (accountRes.rows.length > 0) {
        await pool.query('UPDATE "account" SET password = $1, "updatedAt" = now() WHERE "userId" = $2 AND "providerId" = \'credential\'', [hashedPassword, user.id]);
      } else {
        const accountId = randomUUID();
        await pool.query('INSERT INTO "account" (id, "userId", "accountId", "providerId", password, "createdAt", "updatedAt") VALUES ($1, $2, $2, \'credential\', $3, now(), now())', [accountId, user.id, hashedPassword]);
      }
      console.log(`[Better Auth Init] Synchronized admin user and password for: ${adminEmail}`);
    } else {
      const userId = randomUUID();
      const accountId = randomUUID();
      await pool.query('INSERT INTO "user" (id, name, email, "emailVerified", role, "createdAt", "updatedAt") VALUES ($1, $2, $3, true, \'admin\', now(), now())', [userId, adminName, adminEmail]);
      await pool.query('INSERT INTO "account" (id, "userId", "accountId", "providerId", password, "createdAt", "updatedAt") VALUES ($1, $2, $2, \'credential\', $3, now(), now())', [accountId, userId, hashedPassword]);
      console.log(`[Better Auth Init] Created initial admin credentials for: ${adminEmail}`);
    }
    adminBootstrapped = true;
  } catch (err) {
    console.error("[Better Auth Init] Failed to provision admin credentials:", err);
  }
}

if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD && process.env.NEXT_PHASE !== "phase-production-build") {
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
          try {
            const isLocalDev = process.env.NODE_ENV !== "production";
            
            if (isLocalDev) {
              const res = await pool.query('SELECT COUNT(*) FROM "user"').catch(() => null);
              const userCount = res ? parseInt(res.rows[0].count, 10) : 0;
              const isFirstLocalUser = userCount === 0;

              return {
                data: {
                  ...user,
                  role: isFirstLocalUser ? "admin" : "user",
                  emailVerified: isFirstLocalUser ? true : (user.emailVerified ?? false),
                },
              };
            }

            // In production, public registration NEVER receives admin role. Admin is provisioned strictly via environment variables.
            return {
              data: {
                ...user,
                role: "user",
              },
            };
          } catch (err) {
            console.error("[auth-hook] Error in user.create.before hook:", err);
            return {
              data: {
                ...user,
                role: "user",
              },
            };
          }
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
    },
  },
});
