import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "crypto";

const ALGORITHM = "aes-256-cbc";

export function encrypt(text: string): string {
  if (!text) return "";
  const secret = process.env.MASTER_VAULT_SECRET || "fallback_secret_key_long_enough_32";
  const key = scryptSync(secret, "salt", 32);
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  if (!encryptedText) return "";
  try {
    const secret = process.env.MASTER_VAULT_SECRET || "fallback_secret_key_long_enough_32";
    const key = scryptSync(secret, "salt", 32);
    const [ivHex, encrypted] = encryptedText.split(":");
    if (!ivHex || !encrypted) return encryptedText; // If not encrypted
    const iv = Buffer.from(ivHex, "hex");
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return encryptedText; // Return original if decryption fails (e.g. not encrypted)
  }
}
