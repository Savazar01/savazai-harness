import "dotenv/config";
import { db } from "./index.js";
import { connectedApps, autonomousAgents, systemConfigurations } from "./schema.js";
import { eq } from "drizzle-orm";
import { skillTools } from "../utils/skills-loader.js";
import { storeSkillEmbedding } from "../utils/vector-matcher.js";
import { CryptoVault } from "../utils/crypto-vault.js";

async function seed() {
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
