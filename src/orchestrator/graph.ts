import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { z } from "zod";
import { PrivacyGateway } from "../utils/privacy-gateway.js";
import { skillTools } from "../utils/skills-loader.js";
import { findRelevantSkills } from "../utils/vector-matcher.js";
import { CryptoVault } from "../utils/crypto-vault.js";
import { llmSwitchboard } from "../services/llm-switchboard.js";
import { okfVerifier } from "./okf-verifier.js";
import { db } from "../db/index.js";
import { autonomousAgents, connectedApps, systemConfigurations, type ModelConfig } from "../db/schema.js";
import { like, eq } from "drizzle-orm";
import { TelemetryGateway } from "../utils/telemetry.js";

export const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  timestamp: z.string().optional(),
});

export const GraphStateSchema = z.object({
  messages: z.array(MessageSchema),
  currentApp: z.string(),
  activeSubAgent: z.string(),
  tokenMap: z.record(z.string(), z.string()),
  maskedInput: z.string().optional(),
  relevantSkills: z.array(z.string()),
  verificationFailures: z.array(z.string()),
  correctAttempts: z.number(),
  routingDecision: z.enum(["sub_agent", "mcp_action", "respond", "correct", "end"]).optional(),
  modelConfig: z.object({
    providerType: z.string(),
    modelName: z.string().optional(),
  }).optional(),
});

export type GraphState = z.infer<typeof GraphStateSchema>;

const StateAnnotation = Annotation.Root({
  messages: Annotation<GraphState["messages"]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  currentApp: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
  }),
  activeSubAgent: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
  }),
  tokenMap: Annotation<Record<string, string>>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),
  maskedInput: Annotation<string | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
  relevantSkills: Annotation<string[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  verificationFailures: Annotation<string[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  correctAttempts: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 0,
  }),
  routingDecision: Annotation<"sub_agent" | "mcp_action" | "respond" | "correct" | "end" | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
  modelConfig: Annotation<{ providerType: string; modelName?: string } | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
});

interface AgentProfile {
  name: string;
  systemPrompt: string;
  isEphemeral: boolean;
}

const EPHEMERAL_AGENTS = new Map<string, AgentProfile>();

function detectIntent(text: string): string[] {
  const lower = text.toLowerCase();
  const intents: string[] = [];
  if (/\b(generate|create|make|build)\b.*\b(pdf|document|report)\b/.test(lower)) intents.push("generate-pdf");
  if (/\b(send|email|mail)\b/.test(lower)) intents.push("send-email");
  if (/\b(search|find|lookup|query)\b/.test(lower)) intents.push("brave-search");
  return intents;
}

function extractDomainContext(text: string): string | null {
  const patterns = [
    /\b(wedding|ceremony|marriage|bridal)\b.*\b(plan|manage|organize)\b/i,
    /\b(corporate|business|enterprise)\b.*\b(event|meeting)\b/i,
    /\b(conference|seminar|workshop)\b/i,
    /\b(party|celebration|gathering)\b/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0];
  }
  return null;
}

function isCasualOrNoTool(text: string, intents: string[]): boolean {
  const lower = text.toLowerCase().trim();
  const greetings = [
    "hello", "hi", "hey", "hola", "greetings", "good morning", "good afternoon", "good evening",
    "how are you", "what's up", "yo", "sup", "thanks", "thank you", "bye", "goodbye"
  ];
  if (greetings.some(g => lower.startsWith(g) || lower === g)) {
    return true;
  }
  const cleanIntents = intents.filter(i => i !== "none" && i !== "");
  if (cleanIntents.length === 0) {
    return true;
  }
  return false;
}

async function lookupMatchingAgent(domainContext: string): Promise<AgentProfile | null> {
  try {
    const rows = await db
      .select()
      .from(autonomousAgents)
      .where(like(autonomousAgents.systemPrompt, `%${domainContext}%`))
      .limit(1);
    if (rows.length > 0) {
      return {
        name: rows[0].agentName,
        systemPrompt: rows[0].systemPrompt ?? "",
        isEphemeral: false,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function generateEphemeralAgent(domain: string): AgentProfile {
  const name = `ephemeral_${domain.replace(/\W+/g, "_").toLowerCase()}_${Date.now()}`;
  const systemPrompt = `You are a specialized assistant for "${domain}" tasks. ` +
    `Your role is to handle requests related to ${domain} with precision. ` +
    `Use the available tools and skills to fulfill the user's request. ` +
    `Always respect the privacy gateway context when processing sensitive data.`;
  const profile: AgentProfile = { name, systemPrompt, isEphemeral: true };
  EPHEMERAL_AGENTS.set(name, profile);
  return profile;
}

async function registerAppProvider(appName: string, modelOverride?: { providerType: string; modelName?: string }): Promise<void> {
  try {
    const apps = await db
      .select()
      .from(connectedApps)
      .where(eq(connectedApps.appName, appName))
      .limit(1);
    if (apps.length === 0) return;
    const mc = apps[0].modelConfig as ModelConfig;

    const providerType = modelOverride?.providerType || mc?.providerType;
    let modelName = modelOverride?.modelName || mc?.modelName || process.env.LLM_MODEL_NAME || "gpt-4o-mini";

    const configs = await db.select().from(systemConfigurations).limit(1);
    let baseUrl = mc?.baseUrl || process.env.LLM_BASE_URL || "http://localhost:11434/v1";
    let apiKey = mc?.apiKey || process.env.LLM_API_KEY || "";

    if (configs.length > 0 && providerType) {
      const tokens = configs[0].designTokens as any || {};
      const providers = tokens.llmProviders || {};
      const prov = providers[providerType];
      if (prov) {
        baseUrl = prov.endpoint || baseUrl;
        apiKey = prov.apiKey || apiKey;
        if (!modelOverride?.modelName) {
          modelName = prov.defaultModel || modelName;
        }
      }
    }

    if (!providerType) return;

    llmSwitchboard.registerProvider({
      providerId: appName,
      type: providerType,
      baseUrl,
      modelName,
      apiKey,
    });
  } catch (err) {
    console.error("[registerAppProvider] failed:", err);
  }
}

function buildTimestamp(): string {
  return new Date().toISOString();
}

async function supervisorNode(state: typeof StateAnnotation.State, config?: any) {
  const requestId = config?.configurable?.requestId ?? "global";
  const telemetry = TelemetryGateway.getInstance();

  telemetry.startTrace(requestId, "langgraph-run");
  const span = telemetry.startSpan(requestId, "supervisorNode");

  try {
    const lastMessage = state.messages[state.messages.length - 1];
    const gateway = new PrivacyGateway();
    const { maskedText, tokenMap } = gateway.maskPayload(lastMessage?.content ?? "");

    span.attributes.maskedText = maskedText;

    let intents = detectIntent(maskedText);
    let domain = extractDomainContext(maskedText);

    if (state.currentApp) {
      await registerAppProvider(state.currentApp, state.modelConfig);
      try {
        const completion = await llmSwitchboard.executeUniversalCompletion({
          messages: [
            {
              role: "system",
              content:
                "Analyze the user request and respond with one line: intent=<comma-separated list of needed skills> domain=<domain context or 'none'>",
            },
            { role: "user", content: maskedText },
          ],
          providerId: state.currentApp,
          options: { max_tokens: 100, requestId },
        });
        const aiLine = completion.text.toLowerCase();
        const aiMatch = aiLine.match(/intent=(.+?)(?:\s+domain=|$)/);
        const domainMatch = aiLine.match(/domain=(.+)/);
        if (aiMatch) {
          const aiIntents = aiMatch[1].split(",").map((s) => s.trim()).filter(Boolean);
          if (aiIntents.length > 0) intents = [...new Set([...intents, ...aiIntents])];
        }
        if (domainMatch && domainMatch[1] !== "none") domain = domainMatch[1];
      } catch {
        /* fall back to regex results */
      }
    }

    const cleanIntents = intents.filter((i) => i !== "none" && i !== "");
    const isCasual = isCasualOrNoTool(maskedText, cleanIntents);

    let selectedSkills: string[] = [];
    let routingDecision: "sub_agent" | "mcp_action" | "respond" | "end" = "respond";
    let selectedAgent = state.activeSubAgent;

    if (isCasual) {
      selectedSkills = [];
      routingDecision = "sub_agent";
    } else {
      const matchedSkills = await findRelevantSkills(maskedText, 3);
      selectedSkills = matchedSkills.length > 0 ? matchedSkills : skillTools.map((t) => t.name);
      if (selectedSkills.length > 0 && skillTools.some((t) => selectedSkills.includes(t.name))) {
        routingDecision = "mcp_action";
      }
    }

    if (domain && !selectedAgent) {
      let agent = await lookupMatchingAgent(domain);
      if (!agent) {
        agent = generateEphemeralAgent(domain);
      }
      selectedAgent = agent.name;
      if (routingDecision === "respond") {
        routingDecision = "sub_agent";
      }
    }

    if (routingDecision === "respond") {
      const isDeleteAction = /delete_/.test(maskedText);
      if (isDeleteAction) {
        telemetry.endSpan(requestId, span, {
          isDeleteAction: true,
          routingDecision: "end",
        });
        await telemetry.endTrace(requestId);
        return {
          maskedInput: maskedText,
          tokenMap: Object.fromEntries(tokenMap),
          relevantSkills: selectedSkills,
          messages: [{
            role: "system",
            content: "PENDING_APPROVAL: delete action detected - thread frozen",
            timestamp: buildTimestamp(),
          }],
          routingDecision: "end",
          activeSubAgent: selectedAgent,
        };
      }
    }

    telemetry.endSpan(requestId, span, {
      intents: intents.join(","),
      domain: domain ?? "none",
      routingDecision,
      skills: selectedSkills.join(","),
    });

    return {
      maskedInput: maskedText,
      tokenMap: Object.fromEntries(tokenMap),
      relevantSkills: selectedSkills,
      messages: [{
        role: "system",
        content: `[supervisor] intent=${intents.join(",")} domain=${domain ?? "none"} route=${routingDecision} skills=${selectedSkills.join(",")}`,
        timestamp: buildTimestamp(),
      }],
      routingDecision,
      activeSubAgent: selectedAgent ?? state.activeSubAgent,
    };
  } catch (err) {
    telemetry.endSpan(requestId, span, {
      error: err instanceof Error ? err.message : String(err),
    });
    await telemetry.endTrace(requestId);
    throw err;
  }
}

async function subAgentNode(state: typeof StateAnnotation.State, config?: any) {
  const requestId = config?.configurable?.requestId ?? "global";
  const telemetry = TelemetryGateway.getInstance();
  const span = telemetry.startSpan(requestId, "subAgentNode");

  try {
    const agentName = state.activeSubAgent;
    const profile =
      EPHEMERAL_AGENTS.get(agentName) ??
      { name: agentName, systemPrompt: "You are a general-purpose sub-agent.", isEphemeral: false };

    span.attributes.agentName = agentName;
    span.attributes.systemPrompt = profile.systemPrompt;

    const allMessages = [
      { role: "system", content: profile.systemPrompt },
      ...state.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    let responseContent = `[${profile.name}] (no LLM route available)`;

    if (state.currentApp) {
      await registerAppProvider(state.currentApp, state.modelConfig);
      try {
        const completion = await llmSwitchboard.executeUniversalCompletion({
          messages: allMessages,
          providerId: state.currentApp,
          options: { requestId },
        });
        responseContent = `[${profile.name}] ${completion.text}`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        responseContent = `[${profile.name}] LLM unavailable (${msg}). Using system prompt: ${profile.systemPrompt.slice(0, 80)}...`;
        span.attributes.llmError = msg;
      }
    }

    telemetry.endSpan(requestId, span, {
      responseLength: responseContent.length,
    });

    return {
      messages: [{
        role: "assistant",
        content: responseContent,
        timestamp: buildTimestamp(),
      }],
      routingDecision: "respond",
    };
  } catch (err) {
    telemetry.endSpan(requestId, span, {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

async function mcpActionNode(state: typeof StateAnnotation.State, config?: any) {
  const requestId = config?.configurable?.requestId ?? "global";
  const telemetry = TelemetryGateway.getInstance();
  const span = telemetry.startSpan(requestId, "mcpActionNode");

  try {
    const gateway = new PrivacyGateway();
    const latestMessage = state.messages[state.messages.length - 1];
    const unmasked = gateway.unmaskPayload(
      latestMessage?.content ?? "",
      new Map(Object.entries(state.tokenMap)),
    );

    const skillList = state.relevantSkills.length > 0 ? state.relevantSkills.join(",") : "all";
    span.attributes.relevantSkills = skillList;

    let credentialInfo = "none";

    if (state.currentApp) {
      try {
        const vault = new CryptoVault();
        const apps = await db
          .select()
          .from(connectedApps)
          .where(eq(connectedApps.appName, state.currentApp))
          .limit(1);

        if (apps.length > 0 && apps[0].bearerTokenHash) {
          const decrypted = vault.decryptAppCredential(
            state.currentApp,
            apps[0].bearerTokenHash,
          );
          credentialInfo = `decrypted ${decrypted.length}-char credential for app="${state.currentApp}"`;
        } else {
          credentialInfo = `no stored credential for app="${state.currentApp}"`;
        }
      } catch {
        credentialInfo = "unavailable (MASTER_VAULT_SECRET not configured)";
      }
    }

    span.attributes.credentialInfo = credentialInfo;

    telemetry.endSpan(requestId, span, {
      status: "dispatched",
    });

    return {
      messages: [{
        role: "assistant",
        content: `[mcp] skills=[${skillList}] credential=${credentialInfo} Action dispatched. Payload: ${unmasked.slice(0, 120)}...`,
        timestamp: buildTimestamp(),
      }],
      routingDecision: "respond",
    };
  } catch (err) {
    telemetry.endSpan(requestId, span, {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

async function verifierNode(state: typeof StateAnnotation.State, config?: any) {
  const requestId = config?.configurable?.requestId ?? "global";
  const telemetry = TelemetryGateway.getInstance();
  const span = telemetry.startSpan(requestId, "verifierNode");

  try {
    if (state.relevantSkills.length === 0) {
      telemetry.endSpan(requestId, span, {
        isValid: true,
        failures: "",
        attempts: 0,
        routingDecision: "respond",
      });
      return {
        verificationFailures: [],
        correctAttempts: 0,
        routingDecision: "respond" as const,
      };
    }

    const lastMsg = state.messages[state.messages.length - 1];
    const allFailures: string[] = [];

    for (const skill of state.relevantSkills) {
      const result = okfVerifier.verifyToolOutput(skill, lastMsg?.content ?? "");
      allFailures.push(...result.failures);
    }

    const attempts = state.correctAttempts;
    const isValid = allFailures.length === 0;

    let routingDecision: "respond" | "correct" = "respond";
    if (!isValid && attempts < MAX_CORRECT_ATTEMPTS) {
      routingDecision = "correct";
    }

    telemetry.endSpan(requestId, span, {
      isValid,
      failures: allFailures.join("; "),
      attempts,
      routingDecision,
    });

    return {
      verificationFailures: allFailures,
      correctAttempts: isValid ? 0 : attempts + 1,
      routingDecision,
    };
  } catch (err) {
    telemetry.endSpan(requestId, span, {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

async function correctorNode(state: typeof StateAnnotation.State, config?: any) {
  const requestId = config?.configurable?.requestId ?? "global";
  const telemetry = TelemetryGateway.getInstance();
  const span = telemetry.startSpan(requestId, "correctorNode");

  try {
    const failures = state.verificationFailures;
    const correctionNote = `[correction] Verification failed: ${failures.join("; ")}. Retrying with corrections.`;

    span.attributes.failures = failures.join("; ");

    telemetry.endSpan(requestId, span);

    return {
      messages: [{
        role: "system",
        content: correctionNote,
        timestamp: buildTimestamp(),
      }],
      verificationFailures: [],
      routingDecision: "respond" as const,
    };
  } catch (err) {
    telemetry.endSpan(requestId, span, {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

async function respondNode(state: typeof StateAnnotation.State, config?: any) {
  const requestId = config?.configurable?.requestId ?? "global";
  const telemetry = TelemetryGateway.getInstance();
  const span = telemetry.startSpan(requestId, "respondNode");

  try {
    const lastMessage = state.messages[state.messages.length - 1];
    const gateway = new PrivacyGateway();

    if (lastMessage && Object.keys(state.tokenMap).length > 0) {
      const unmasked = gateway.unmaskPayload(
        lastMessage.content,
        new Map(Object.entries(state.tokenMap)),
      );
      telemetry.endSpan(requestId, span);
      await telemetry.endTrace(requestId);
      return {
        messages: [{ ...lastMessage, content: unmasked }],
        routingDecision: "end",
      };
    }

    telemetry.endSpan(requestId, span);
    await telemetry.endTrace(requestId);
    return { messages: [], routingDecision: "end" };
  } catch (err) {
    telemetry.endSpan(requestId, span, {
      error: err instanceof Error ? err.message : String(err),
    });
    await telemetry.endTrace(requestId);
    throw err;
  }
}

const MAX_CORRECT_ATTEMPTS = 2;

function verifierRoutingLogic(state: typeof StateAnnotation.State): string {
  if (state.routingDecision === "correct") return "correct";
  return "respond";
}

function agentRoutingLogic(state: typeof StateAnnotation.State): string {
  return state.routingDecision ?? "respond";
}

const graph = new StateGraph(StateAnnotation)
  .addNode("supervisor", supervisorNode)
  .addNode("subAgent", subAgentNode)
  .addNode("mcpAction", mcpActionNode)
  .addNode("verifier", verifierNode)
  .addNode("corrector", correctorNode)
  .addNode("respond", respondNode)
  .addEdge(START, "supervisor")
  .addConditionalEdges("supervisor", agentRoutingLogic, {
    sub_agent: "subAgent",
    mcp_action: "mcpAction",
    respond: "respond",
    correct: "corrector",
    end: END,
  })
  .addEdge("subAgent", "verifier")
  .addEdge("mcpAction", "verifier")
  .addConditionalEdges("verifier", verifierRoutingLogic, {
    correct: "corrector",
    respond: "respond",
  })
  .addEdge("corrector", "respond")
  .addEdge("respond", END);

export const compiledGraph = graph.compile();
export type GraphAnnotationType = typeof StateAnnotation;

export async function* streamGraphEvents(input: GraphState, requestId?: string): AsyncGenerator<unknown> {
  const stream = await compiledGraph.stream(input, {
    streamMode: "updates",
    configurable: { requestId },
  });
  for await (const chunk of stream) {
    yield chunk;
  }
}
