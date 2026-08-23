import { betterAuth } from "better-auth";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

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
