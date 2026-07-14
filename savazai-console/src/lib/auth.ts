import { betterAuth } from "better-auth";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const auth = betterAuth({
  database: pool,
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
            // Check count of users in the "user" table
            const res = await pool.query('SELECT COUNT(*) FROM "user"').catch(() => null);
            const userCount = res ? parseInt(res.rows[0].count, 10) : 0;

            // Auto-provision first user as 'admin', others as 'user'
            const role = userCount === 0 ? "admin" : "user";
            return {
              data: {
                ...user,
                role,
              },
            };
          } catch (err) {
            console.error("[auth-hook] Error querying user count:", err);
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
