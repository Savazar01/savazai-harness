import React from "react";
import { Pool } from "pg";
import { decrypt } from "@/lib/crypto";
import {
  resolveTheme,
  surfaceFromLegacyBackground,
  DEFAULT_ACCENT,
  DEFAULT_SURFACE,
  DEFAULT_RADIUS,
  DEFAULT_DENSITY,
  type AppearanceConfig,
} from "@/lib/theme/palette";
import { ClientThemeProvider } from "@/components/theme/client-theme-provider";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export interface LLMProviderConfig {
  apiKey: string;
  endpoint: string;
  defaultModel: string;
  active: boolean;
  models?: string[];
  discoveredModels?: string[];
}

export interface DesignTokens {
  themeMode?: "system" | "dark" | "light";
  faviconUrl?: string;
  accentPreset?: string;
  accentCustom?: string;
  surfaceTone?: string;
  radius?: string;
  density?: "comfortable" | "compact";

  // Legacy mappings
  primaryColor?: string;
  secondaryColor?: string;
  background?: string;

  fontSans?: string;
  promptFontSize?: string;
  promptFontFamily?: string;
  showAgentWorkspace?: boolean;

  llmProviders?: Record<string, LLMProviderConfig>;
  activeModel?: string;

  mcpServers?: string;

  tavilyApiKey?: string;
  serperApiKey?: string;
  piiRegex?: string;

  googlePlacesApiKey?: string;
  googlePlacesRadius?: string;
  yelpClientId?: string;
  yelpApiKey?: string;
  gmailClientId?: string;
  gmailClientSecret?: string;
  gmailRedirectUri?: string;
  gmailRefreshToken?: string;
  OAUTH_REFRESH_TOKEN?: string;
  sendgridApiKey?: string;
  sendgridSenderEmail?: string;
  wabaId?: string;
  wabaPhoneNumberId?: string;
  wabaAccessToken?: string;
  capabilityProfile?: string;
  globalSystemPrompt?: string;
  orchestrationRules?: string;
  defaultAmbientParameters?: string;
  customSkills?: string | unknown[];
  dbConnections?: string | unknown[];
  socialConnections?: string | unknown[];
  agentsMd?: string;
}

export interface SystemConfig {
  appTitle: string;
  brandLogoUrl: string;
  designTokens: DesignTokens;
}

export async function getSystemConfig(): Promise<SystemConfig> {
  try {
    const res = await pool
      .query(
        'SELECT app_title as "appTitle", brand_logo_url as "brandLogoUrl", design_tokens as "designTokens" FROM system_configurations LIMIT 1'
      )
      .catch(() => null);

    if (res && res.rows.length > 0) {
      const config = res.rows[0] as SystemConfig;
      if (config.designTokens) {
        const dt = config.designTokens;
        if (dt.gmailClientId) dt.gmailClientId = decrypt(dt.gmailClientId);
        if (dt.gmailClientSecret) dt.gmailClientSecret = decrypt(dt.gmailClientSecret);
        if (dt.gmailRefreshToken) dt.gmailRefreshToken = decrypt(dt.gmailRefreshToken);
        if (dt.OAUTH_REFRESH_TOKEN) dt.OAUTH_REFRESH_TOKEN = decrypt(dt.OAUTH_REFRESH_TOKEN);
      }
      return config;
    }
  } catch (err) {
    console.error("[theme-provider] Error querying system_configurations:", err);
  }

  return {
    appTitle: "SavazAI Console",
    brandLogoUrl:
      "https://savazar.com/wp-content/uploads/2023/10/cropped-Transparent_Image_2-300x100.png",
    designTokens: {
      accentPreset: DEFAULT_ACCENT,
      surfaceTone: DEFAULT_SURFACE,
      radius: DEFAULT_RADIUS,
      density: DEFAULT_DENSITY,
      themeMode: "dark",
    },
  };
}

function hexToRgb(hex: string): string {
  const cleanHex = hex.replace("#", "");
  if (cleanHex.length !== 6 && cleanHex.length !== 3) return "194 65 12";
  const num = parseInt(cleanHex, 16);
  if (cleanHex.length === 6) {
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `${r} ${g} ${b}`;
  }
  const r = ((num >> 8) & 15) * 17;
  const g = ((num >> 4) & 15) * 17;
  const b = (num & 15) * 17;
  return `${r} ${g} ${b}`;
}

export async function ThemeProvider({ children }: { children: React.ReactNode }) {
  const config = await getSystemConfig();
  const tokens = config.designTokens || {};

  // Resolve accent: prefer accentPreset/accentCustom, fallback to primaryColor or DEFAULT_ACCENT
  const accentPreset =
    tokens.accentPreset || (tokens.primaryColor ? "custom" : DEFAULT_ACCENT);
  const accentCustom = tokens.accentCustom || tokens.primaryColor;

  // Resolve surface: prefer surfaceTone, fallback to legacy background or DEFAULT_SURFACE
  const surfaceTone =
    tokens.surfaceTone ||
    (tokens.background ? surfaceFromLegacyBackground(tokens.background) : DEFAULT_SURFACE);

  const appearanceConfig: AppearanceConfig = {
    themeMode: tokens.themeMode || "dark",
    accentPreset,
    accentCustom,
    surfaceTone,
    radius: tokens.radius || DEFAULT_RADIUS,
    density: tokens.density || DEFAULT_DENSITY,
    fontSans: tokens.fontSans,
    promptFontSize: tokens.promptFontSize,
  };

  const resolved = resolveTheme(appearanceConfig);

  const primaryLightRgb = hexToRgb(resolved.light["--primary"]);
  const primaryDarkRgb = hexToRgb(resolved.dark["--primary"]);

  const lightCssProps = Object.entries(resolved.light)
    .map(([k, v]) => `${k}: ${v};`)
    .join(" ");

  const darkCssProps = Object.entries(resolved.dark)
    .map(([k, v]) => `${k}: ${v};`)
    .join(" ");

  const resolvedFontFamily = (() => {
    if (!tokens.promptFontFamily || tokens.promptFontFamily === "sans")
      return "var(--font-sans), system-ui, -apple-system, sans-serif";
    if (tokens.promptFontFamily === "mono")
      return "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace";
    if (tokens.promptFontFamily === "inter")
      return "var(--font-inter, Inter), var(--font-sans), system-ui, sans-serif";
    if (tokens.promptFontFamily === "system")
      return "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    return tokens.promptFontFamily;
  })();

  const cssVariables = `
    :root {
      ${lightCssProps}
      --primary-rgb: ${primaryLightRgb};
      --secondary-rgb: ${hexToRgb(resolved.light["--secondary"] || "#f1f5f9")};
      --prompt-font-size: ${tokens.promptFontSize || "16px"};
      --prompt-font-family: ${resolvedFontFamily};
      --brand-logo-url: url("${config.brandLogoUrl}");
    }
    .dark {
      ${darkCssProps}
      --primary-rgb: ${primaryDarkRgb};
      --secondary-rgb: ${hexToRgb(resolved.dark["--secondary"] || "#1a202b")};
    }
  `;

  return (
    <>
      <style
        id="savazai-theme-vars"
        dangerouslySetInnerHTML={{ __html: cssVariables }}
      />
      <ClientThemeProvider defaultTheme={tokens.themeMode || "dark"}>
        {children}
      </ClientThemeProvider>
    </>
  );
}
