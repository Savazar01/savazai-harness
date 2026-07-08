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
    console.log(`[seed] App "${existingApp[0].appName}" already exists (id=${appId})`);
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
  }

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

  if (existingConfig.length === 0) {
    await db.insert(systemConfigurations).values({
      appTitle: "SavazAI Console",
      brandLogoUrl: "https://savazar.com/wp-content/uploads/2023/10/cropped-Transparent_Image_2-300x100.png",
      designTokens: {
        primaryColor: "#4f46e5",
        secondaryColor: "#06b6d4",
      },
    });
    console.log("[seed] Created default system configuration");
  } else {
    console.log("[seed] System configuration already exists");
  }

  console.log("[seed] Baseline configuration complete");
}

seed().catch((err) => {
  console.error("[seed] Failed:", err);
  process.exit(1);
});
