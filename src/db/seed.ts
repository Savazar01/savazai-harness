import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { db } from "./index.js";
import { connectedApps, autonomousAgents, systemConfigurations } from "./schema.js";
import { eq, sql } from "drizzle-orm";
import { skillTools } from "../utils/skills-loader.js";
import { storeSkillEmbedding } from "../utils/vector-matcher.js";
import { CryptoVault } from "../utils/crypto-vault.js";

async function seed() {
  // 1. Ensure Better-Auth tables exist
  await db.execute(sql`
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
      "expiresAt" TIMESTAMPTZ NOT NULL,
      "token" TEXT NOT NULL UNIQUE,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "ipAddress" TEXT,
      "userAgent" TEXT,
      "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
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

  // 2. Admin account bootstrapping from environment variables
  console.log("[Seed] Checking administrator bootstrapping parameters...");
  console.log("[Seed] NODE_ENV:", process.env.NODE_ENV);
  console.log("[Seed] ADMIN_EMAIL detected:", process.env.ADMIN_EMAIL ? `YES (${process.env.ADMIN_EMAIL.trim()})` : "NO");
  console.log("[Seed] ADMIN_PASSWORD detected:", process.env.ADMIN_PASSWORD ? `YES (${process.env.ADMIN_PASSWORD.length} chars)` : "NO");
  console.log("[Seed] ADMIN_NAME:", process.env.ADMIN_NAME || "System Administrator (default)");

  const adminEmail = process.env.ADMIN_EMAIL ? process.env.ADMIN_EMAIL.trim().toLowerCase() : null;
  const adminPassword = process.env.ADMIN_PASSWORD ? process.env.ADMIN_PASSWORD.trim() : null;
  const adminName = (process.env.ADMIN_NAME || "System Administrator").trim();

  if (adminEmail && adminPassword) {
    const existingUser = (await db.execute(sql`SELECT * FROM "user" WHERE LOWER(email) = ${adminEmail} LIMIT 1`)) as unknown as Array<{ id: string; role: string }>;

    const hashedPassword = await hashPassword(adminPassword);

    if (existingUser && existingUser.length > 0) {
      const u = existingUser[0];

      await db.execute(sql`UPDATE "user" SET name = ${adminName}, role = 'admin', "emailVerified" = true, "updatedAt" = now() WHERE id = ${u.id}`);
      
      const existingAccount = (await db.execute(sql`SELECT * FROM "account" WHERE "userId" = ${u.id} AND "providerId" = 'credential' LIMIT 1`)) as unknown as Array<Record<string, unknown>>;
      if (existingAccount && existingAccount.length > 0) {
        await db.execute(sql`UPDATE "account" SET password = ${hashedPassword}, "updatedAt" = now() WHERE "userId" = ${u.id} AND "providerId" = 'credential'`);
        console.log(`[Seed] Successfully synchronized admin user and password: ${adminEmail}`);
      } else {
        const accountId = randomUUID();
        await db.execute(sql`INSERT INTO "account" (id, "userId", "accountId", "providerId", password, "createdAt", "updatedAt") VALUES (${accountId}, ${u.id}, ${u.id}, 'credential', ${hashedPassword}, now(), now())`);
        console.log(`[Seed] Successfully created credential account & admin role for existing user: ${adminEmail}`);
      }
    } else {
      const userId = randomUUID();
      const accountId = randomUUID();

      await db.execute(sql`INSERT INTO "user" (id, name, email, "emailVerified", role, "createdAt", "updatedAt") VALUES (${userId}, ${adminName}, ${adminEmail}, true, 'admin', now(), now())`);
      await db.execute(sql`INSERT INTO "account" (id, "userId", "accountId", "providerId", password, "createdAt", "updatedAt") VALUES (${accountId}, ${userId}, ${userId}, 'credential', ${hashedPassword}, now(), now())`);
      console.log(`[Seed] Successfully inserted new admin user and credential account: ${adminEmail}`);
    }
  } else {
    if (process.env.NODE_ENV !== "production") {
      console.log("[Seed] Running in local development mode. First UI signup will claim administrator role.");
    } else {
      console.log("[Seed] Production mode active. No ADMIN_EMAIL/ADMIN_PASSWORD environment variables set.");
    }
  }
  const existingApp = await db
    .select()
    .from(connectedApps)
    .where(eq(connectedApps.appName, "WedPlanAI-Local"))
    .limit(1);

  let appId: number;

  if (existingApp.length > 0) {
    appId = existingApp[0].id;
    console.log(`[seed] App "${existingApp[0].appName}" already exists (id=${appId}). Skipping config override to protect admin settings.`);
  } else {
    const [app] = await db
      .insert(connectedApps)
      .values({
        appName: "WedPlanAI-Local",
        mcpEndpointUrl: "http://localhost:3044/api/mcp",
      })
      .returning();
    appId = app.id;
    console.log(`[seed] Created app "${app.appName}" (id=${appId})`);

    try {
      const vault = new CryptoVault();
      const sampleToken = "sk_live_wedplan_mcp_token_2026";
      const encrypted = vault.encryptAppCredential("WedPlanAI-Local", sampleToken);
      await db
        .update(connectedApps)
        .set({
          bearerTokenHash: encrypted,
          modelConfig: {
            providerType: process.env.LLM_PROVIDER_TYPE || "openai-compatible",
            baseUrl: process.env.LLM_BASE_URL || "http://localhost:11434/v1",
            modelName: process.env.LLM_MODEL_NAME || "gpt-4o-mini",
            apiKey: process.env.LLM_API_KEY || "",
            backupProviderType: process.env.LLM_BACKUP_PROVIDER_TYPE || undefined,
            backupBaseUrl: process.env.LLM_BACKUP_BASE_URL || undefined,
            backupModelName: process.env.LLM_BACKUP_MODEL_NAME || undefined,
            backupApiKey: process.env.LLM_BACKUP_API_KEY || undefined,
          },
        })
        .where(eq(connectedApps.id, appId));
      console.log("[seed] Encrypted bearer token and model config stored for WedPlanAI-Local");
    } catch {
      console.log("[seed] Skipping credential encryption (MASTER_VAULT_SECRET may not be set)");
    }
  }

  const coreCheck = await db
    .select()
    .from(autonomousAgents)
    .where(eq(autonomousAgents.agentName, "Core Supervisor"))
    .limit(1);

  if (coreCheck.length === 0) {
    await db.insert(autonomousAgents).values({
      appId,
      agentName: "Core Supervisor",
      systemPrompt:
        "You are the core supervisory agent for SavazAI. Your role is to intercept user intent, analyze loaded skills, and route requests to the appropriate sub-agent or MCP action. Always apply privacy masking before external dispatch and re-hydrate payloads on return. Maintain decoupled, application-agnostic execution at all times.",
      allowedMcpTools: ["generate-pdf", "send-email", "brave-search"],
      isCoreAgent: true,
    });
    console.log("[seed] Created Core Supervisor agent");
  } else {
    console.log("[seed] Core Supervisor agent already exists");
  }

  const docCheck = await db
    .select()
    .from(autonomousAgents)
    .where(eq(autonomousAgents.agentName, "Document Automation"))
    .limit(1);

  if (docCheck.length === 0) {
    await db.insert(autonomousAgents).values({
      appId,
      agentName: "Document Automation",
      systemPrompt:
        "You are the Document Automation agent for SavazAI. You generate structured documents (PDFs, reports) using the generate-pdf skill. You operate strictly on masked data and never persist raw PII. Your responses are application-agnostic and driven purely by dynamic tool schemas.",
      allowedMcpTools: ["generate-pdf"],
      isCoreAgent: false,
    });
    console.log("[seed] Created Document Automation agent");
  } else {
    console.log("[seed] Document Automation agent already exists");
  }

  for (const skill of skillTools) {
    await storeSkillEmbedding(skill.name, skill.description);
  }

  const existingConfig = await db
    .select()
    .from(systemConfigurations)
    .limit(1);

  const defaultTokens = {
    primaryColor: "#4f46e5",
    secondaryColor: "#06b6d4",
    globalSystemPrompt: "You are the SavazAI Autonomous Orchestration Control Plane. Your target function is to serve as a high-agency agent router that maps complex operational requests to connected MCP servers, custom local skills, and sub-agents. You operate within a dynamic environment. If an identifier token (such as a weddingId) is required by a tool schema but missing from the current user prompt, you must programmatically fetch the default configuration details by calling 'get_wedding' first to extract it from system context, or look for available parameter mappings within your ambient session state tokens. Never ask the user to input database IDs.",
    orchestrationRules: "1. DIRECT SCHEMA MATCHING: Parse the user's input and match requirements straight to individual discovered MCP tools. 2. CHECKLIST TRACKING: Maintain an internal structural breakdown of multi-part prompts. Execute the single best tool for the first incomplete goal step. 3. ITERATIVE ACCUMULATION: Loop back following each tool completion pass to evaluate the updated message timeline, sequentially calling distinct remaining capabilities until the checklist is satisfied.",
    defaultAmbientParameters: {
      weddingId: "be5badd9-0cb2-4d5d-9acf-2412406b9cae"
    },
    keywordOverrides: [
      {
        keywords: ["guest", "rsvp", "attendance", "invite"],
        tool: "list_guests",
        requiredArgs: ["weddingId"]
      },
      {
        keywords: ["vendor", "supplier", "caterer"],
        tool: "list_vendors",
        requiredArgs: ["weddingId"]
      },
      {
        keywords: ["ceremony", "event", "schedule", "program"],
        tool: "list_ceremonies",
        requiredArgs: ["weddingId"]
      },
      {
        keywords: ["task", "todo", "checklist", "timeline"],
        tool: "list_tasks",
        requiredArgs: ["weddingId"]
      }
    ]
  };

  if (existingConfig.length === 0) {
    await db.insert(systemConfigurations).values({
      appTitle: "SavazAI Console",
      brandLogoUrl: "https://savazar.com/wp-content/uploads/2023/10/cropped-Transparent_Image_2-300x100.png",
      designTokens: defaultTokens,
    });
    console.log("[seed] Created default system configuration");
  } else {
    console.log("[seed] System configuration already exists. Skipping config override to protect admin settings.");
  }

  console.log("[seed] Baseline configuration complete");
}

seed().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error("[seed] Failed:", err);
  process.exit(1);
});
