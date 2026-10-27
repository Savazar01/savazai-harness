import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "crypto";

const ALGORITHM = "aes-256-cbc";

function getMasterSecret(): string {
  const secret = process.env.MASTER_VAULT_SECRET;
  if (process.env.NODE_ENV === "production" && (!secret || secret.length < 32)) {
    throw new Error(
      "Security invariant violation: MASTER_VAULT_SECRET must be configured and at least 32 characters long in production."
    );
  }
  return secret || "fallback_secret_key_long_enough_32";
}

export function encrypt(text: string): string {
  if (!text) return "";
  const secret = getMasterSecret();
  const key = scryptSync(secret, "salt", 32);
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  if (!encryptedText) return "";
  const [ivHex, encrypted] = encryptedText.split(":");
  if (!ivHex || !encrypted) return encryptedText; // If not encrypted

  const secrets = [
    process.env.MASTER_VAULT_SECRET,
    ...(process.env.NODE_ENV !== "production" ? ["fallback_secret_key_long_enough_32"] : []),
  ].filter(Boolean) as string[];

  const iv = Buffer.from(ivHex, "hex");

  for (const secret of secrets) {
    try {
      const key = scryptSync(secret, "salt", 32);
      const decipher = createDecipheriv(ALGORITHM, key, iv);
      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch {
      // Try next secret candidate
    }
  }

  return encryptedText; // Return original if all decryption attempts fail
}
