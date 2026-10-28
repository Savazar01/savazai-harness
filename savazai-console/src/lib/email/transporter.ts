import nodemailer from "nodemailer";
import { pool, ensureAdminProvisioned } from "@/lib/auth";
import { decrypt, encrypt } from "@/lib/crypto";

export interface SmtpConfig {
  provider: "smtp" | "gmail" | "sendgrid";
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  fromName?: string;
  fromEmail?: string;
  sendgridApiKey?: string;
}

export async function getSmtpConfig(): Promise<SmtpConfig> {
  await ensureAdminProvisioned();
  try {
    const res = await pool.query(
      'SELECT design_tokens as "designTokens" FROM system_configurations LIMIT 1'
    );
    const dt = res.rows[0]?.designTokens || {};
    const raw = dt.smtpSettings || {};

    return {
      provider: raw.provider || "smtp",
      host: raw.host || process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(raw.port || process.env.SMTP_PORT || 587),
      secure: raw.secure !== undefined ? Boolean(raw.secure) : false,
      user: raw.user || process.env.SMTP_USER || "",
      pass: raw.pass
        ? decrypt(String(raw.pass)).trim().replace(/\s+/g, "")
        : (process.env.SMTP_PASS || "").trim().replace(/\s+/g, ""),
      fromName: raw.fromName || dt.brandTitle || process.env.SMTP_FROM_NAME || "SavazAI Platform",
      fromEmail: raw.fromEmail || raw.user || process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || "notifications@savazai.local",
      sendgridApiKey: raw.sendgridApiKey
        ? decrypt(String(raw.sendgridApiKey)).trim()
        : (process.env.SENDGRID_API_KEY || "").trim(),
    };
  } catch (err) {
    console.error("[SMTP Config] Error fetching config:", err);
    return {
      provider: "smtp",
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      user: process.env.SMTP_USER || "",
      pass: (process.env.SMTP_PASS || "").trim().replace(/\s+/g, ""),
      fromName: "SavazAI Platform",
      fromEmail: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || "notifications@savazai.local",
    };
  }
}

export async function saveSmtpConfig(config: Partial<SmtpConfig>): Promise<void> {
  await ensureAdminProvisioned();
  const currentRes = await pool.query(
    'SELECT id, design_tokens as "designTokens" FROM system_configurations LIMIT 1'
  );
  if (currentRes.rows.length === 0) return;

  const row = currentRes.rows[0];
  const dt = row.designTokens || {};
  const currentSmtp = dt.smtpSettings || {};

  // If password provided and not masked, encrypt it
  let passToStore = currentSmtp.pass;
  if (
    typeof config.pass === "string" &&
    config.pass.trim() !== "" &&
    !config.pass.includes("••••")
  ) {
    passToStore = encrypt(config.pass.trim().replace(/\s+/g, ""));
  }

  let sendgridKeyToStore = currentSmtp.sendgridApiKey;
  if (
    typeof config.sendgridApiKey === "string" &&
    config.sendgridApiKey.trim() !== "" &&
    !config.sendgridApiKey.includes("••••")
  ) {
    sendgridKeyToStore = encrypt(config.sendgridApiKey.trim());
  }

  const updatedSmtp = {
    ...currentSmtp,
    ...config,
    pass: passToStore,
    sendgridApiKey: sendgridKeyToStore,
  };

  const updatedTokens = {
    ...dt,
    smtpSettings: updatedSmtp,
  };

  await pool.query(
    'UPDATE system_configurations SET design_tokens = $1 WHERE id = $2',
    [JSON.stringify(updatedTokens), row.id]
  );
}

export async function createEmailTransporter(configOverride?: SmtpConfig): Promise<nodemailer.Transporter> {
  const stored = await getSmtpConfig();

  let cfg: SmtpConfig;
  if (configOverride) {
    const overridePass = configOverride.pass;
    const isPassMaskedOrEmpty =
      !overridePass ||
      overridePass.includes("••••") ||
      overridePass.trim() === "";

    const overrideSendgrid = configOverride.sendgridApiKey;
    const isSendgridMaskedOrEmpty =
      !overrideSendgrid ||
      overrideSendgrid.includes("••••") ||
      overrideSendgrid.trim() === "";

    cfg = {
      ...stored,
      ...configOverride,
      pass: isPassMaskedOrEmpty ? stored.pass : overridePass.trim().replace(/\s+/g, ""),
      sendgridApiKey: isSendgridMaskedOrEmpty ? stored.sendgridApiKey : overrideSendgrid.trim(),
    };
  } else {
    cfg = stored;
  }

  const cleanPass = (cfg.pass || "").trim().replace(/\s+/g, "");
  const cleanUser = (cfg.user || "").trim();

  if (!cleanPass || cleanPass.length === 0) {
    throw new Error(
      "SMTP Password decryption returned an empty string. Please re-enter your 16-character Google App Password in System Admin."
    );
  }

  if (cfg.provider === "gmail" || (cfg.host && cfg.host.includes("gmail"))) {
    return nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: cleanUser,
        pass: cleanPass,
      },
      tls: {
        rejectUnauthorized: true,
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
    });
  }

  if (cfg.provider === "sendgrid") {
    // SendGrid SMTP relay
    return nodemailer.createTransport({
      host: "smtp.sendgrid.net",
      port: 587,
      secure: false,
      auth: {
        user: "apikey",
        pass: (cfg.sendgridApiKey || cleanPass).trim(),
      },
    });
  }

  // Standard Custom SMTP
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cleanUser && cleanPass ? { user: cleanUser, pass: cleanPass } : undefined,
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === "production",
    },
  });
}

export async function verifySmtpConnection(
  configOverride?: SmtpConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    const transporter = await createEmailTransporter(configOverride);
    await transporter.verify();
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to establish connection to SMTP server.",
    };
  }
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  purpose?: string;
  metadata?: Record<string, unknown>;
  configOverride?: SmtpConfig;
}

export async function sendEmail(
  options: SendEmailOptions
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  await ensureAdminProvisioned();
  const { to, subject, html, text, purpose = "transactional", metadata = {}, configOverride } = options;
  const cfg = configOverride || (await getSmtpConfig());
  const cleanTo = to.trim().toLowerCase();

  const isGmail = cfg.provider === "gmail" || (cfg.host && cfg.host.includes("gmail"));
  const effectiveFrom =
    isGmail && cfg.fromEmail && !cfg.fromEmail.includes("@gmail.com")
      ? `"${cfg.fromName || "SavazAI Platform"}" <${cfg.user}>`
      : cfg.fromName
      ? `"${cfg.fromName}" <${cfg.fromEmail || cfg.user}>`
      : cfg.fromEmail || cfg.user;

  const replyTo =
    cfg.fromEmail && cfg.fromEmail !== cfg.user ? cfg.fromEmail : undefined;

  try {
    const transporter = await createEmailTransporter(cfg);

    const info = await transporter.sendMail({
      from: effectiveFrom,
      ...(replyTo ? { replyTo } : {}),
      to: cleanTo,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ""),
    });

    // Record success in email_audit_logs
    await pool.query(
      `INSERT INTO "email_audit_logs" ("recipient", "subject", "purpose", "status", "metadata", "created_at")
       VALUES ($1, $2, $3, 'SENT', $4, now())`,
      [cleanTo, subject, purpose, JSON.stringify({ messageId: info.messageId, ...metadata })]
    ).catch((e) => console.warn("[Email Audit Log Insert Warning]", e));

    return { success: true, messageId: info.messageId };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Email Dispatch Error] To: ${cleanTo} | Purpose: ${purpose}:`, errorMsg);

    // Record failure in email_audit_logs
    await pool.query(
      `INSERT INTO "email_audit_logs" ("recipient", "subject", "purpose", "status", "error", "metadata", "created_at")
       VALUES ($1, $2, $3, 'FAILED', $4, $5, now())`,
      [cleanTo, subject, purpose, errorMsg, JSON.stringify(metadata)]
    ).catch((e) => console.warn("[Email Audit Log Insert Warning]", e));

    return { success: false, error: errorMsg };
  }
}
