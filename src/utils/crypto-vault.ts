import {
  randomBytes,
  hkdfSync,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const HKDF_HASH = "sha256";
const HKDF_SALT = "savazai-v1";

export class CryptoVault {
  private masterSecret: Buffer;

  constructor() {
    const raw = process.env.MASTER_VAULT_SECRET;
    if (!raw || raw.length < 32) {
      throw new Error(
        "MASTER_VAULT_SECRET must be set and at least 32 characters long",
      );
    }
    this.masterSecret = Buffer.from(raw, "utf8");
  }

  deriveAppKey(appId: string): Buffer {
    return Buffer.from(
      hkdfSync(
        HKDF_HASH,
        this.masterSecret,
        Buffer.from(HKDF_SALT, "utf8"),
        Buffer.from(appId, "utf8"),
        KEY_LENGTH,
      ),
    );
  }

  encryptAppCredential(appId: string, plaintext: string): string {
    const key = this.deriveAppKey(appId);
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(Buffer.from(plaintext, "utf8")),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString("base64");
  }

  decryptAppCredential(appId: string, cipherText: string): string {
    const key = this.deriveAppKey(appId);
    const raw = Buffer.from(cipherText, "base64");
    const iv = raw.subarray(0, IV_LENGTH);
    const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = raw.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
  }
}
