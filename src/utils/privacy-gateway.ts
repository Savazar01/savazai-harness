const DEFAULT_PATTERNS: { regex: RegExp; label: string }[] = [
  { regex: /[\w.-]+@[\w.-]+\.\w+/g, label: "email" },
  { regex: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, label: "phone" },
  { regex: /\b\d{3}-\d{2}-\d{4}\b/g, label: "ssn" },
  { regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g, label: "card" },
  { regex: /\b\d{1,3}(?:,\d{3})+(?:\.\d{2})?\b/g, label: "currency" },
  { regex: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, label: "ip" },
  { regex: /"token_[a-zA-Z0-9_]+"/g, label: "token" },
  { regex: /\b(id|uuid|guid)[:_]\s*["']?[a-zA-Z0-9_-]{8,}["']?/gi, label: "id" },
];

const TOKEN_PREFIX = "MASK";

export class PrivacyGateway {
  private patterns: { regex: RegExp; label: string }[];

  constructor(patterns?: { regex: RegExp; label: string }[]) {
    this.patterns = patterns ?? DEFAULT_PATTERNS;
  }

  maskPayload(text: string): { maskedText: string; tokenMap: Map<string, string> } {
    const tokenMap = new Map<string, string>();
    let counter = 0;
    let result = text;

    for (const { regex, label } of this.patterns) {
      result = result.replace(regex, (match) => {
        const existing = [...tokenMap.entries()].find(([, v]) => v === match);
        if (existing) return existing[0];
        const key = `[${TOKEN_PREFIX}_${label}_${counter}]`;
        counter++;
        tokenMap.set(key, match);
        return key;
      });
    }

    return { maskedText: result, tokenMap };
  }

  unmaskPayload(text: string, tokenMap: Map<string, string>): string {
    let result = text;
    for (const [key, value] of tokenMap) {
      result = result.replaceAll(key, value);
    }
    return result;
  }
}
