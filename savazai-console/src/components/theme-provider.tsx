import React from "react";
import { Pool } from "pg";
import { decrypt } from "@/lib/crypto";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export interface LLMProviderConfig {
  apiKey: string;
  endpoint: string;
  defaultModel: string;
  active: boolean;
}

export interface SystemConfig {
  appTitle: string;
  brandLogoUrl: string;
  designTokens: {
    primaryColor?: string;
    secondaryColor?: string;
    background?: string;
    fontSans?: string;

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
  };
}

export async function getSystemConfig(): Promise<SystemConfig> {
  try {
    const res = await pool.query(
      'SELECT app_title as "appTitle", brand_logo_url as "brandLogoUrl", design_tokens as "designTokens" FROM system_configurations LIMIT 1'
    ).catch(() => null);

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
    brandLogoUrl: "https://savazar.com/wp-content/uploads/2023/10/cropped-Transparent_Image_2-300x100.png",
    designTokens: {
      primaryColor: "#4f46e5",
      secondaryColor: "#06b6d4",
    },
  };
}

function hexToRgbComponents(hex: string): string {
  if (!hex || typeof hex !== "string") return "79 70 229";

  const cleanHex = hex.replace("#", "");
  if (cleanHex.length !== 6 && cleanHex.length !== 3) return hex;

  const num = parseInt(cleanHex, 16);
  if (cleanHex.length === 6) {
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `${r} ${g} ${b}`;
  } else {
    const r = ((num >> 8) & 15) * 17;
    const g = ((num >> 4) & 15) * 17;
    const b = (num & 15) * 17;
    return `${r} ${g} ${b}`;
  }
}

export async function ThemeProvider({ children }: { children: React.ReactNode }) {
  const config = await getSystemConfig();
  const { primaryColor, secondaryColor, background, fontSans } = config.designTokens || {};

  const primaryRgb = hexToRgbComponents(primaryColor || "#4f46e5");
  const secondaryRgb = hexToRgbComponents(secondaryColor || "#06b6d4");

  const cssVariables = `
    :root {
      --primary: ${primaryRgb};
      --secondary: ${secondaryRgb};
      ${background ? `--background: ${background};` : ""}
      ${fontSans ? `--font-sans: ${fontSans};` : ""}
      --brand-logo-url: url("${config.brandLogoUrl}");
    }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: cssVariables }} />
      {children}
    </>
  );
}
