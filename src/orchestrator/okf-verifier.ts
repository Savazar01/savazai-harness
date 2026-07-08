interface FieldRule {
  name: string;
  type: "string" | "number" | "boolean" | "object";
  required: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
}

interface SkillSchema {
  fields: FieldRule[];
}

const SCHEMAS: Record<string, SkillSchema> = {
  "generate-pdf": {
    fields: [
      { name: "filename", type: "string", required: true, pattern: /\.pdf$/i },
      { name: "title", type: "string", required: false },
      { name: "pages", type: "number", required: false, min: 1, max: 1000 },
      { name: "summaryText", type: "string", required: true },
    ],
  },
  "send-email": {
    fields: [
      { name: "to", type: "string", required: true, pattern: /@/ },
      { name: "subject", type: "string", required: true },
      { name: "bodyHtml", type: "string", required: true },
    ],
  },
  "brave-search-transformer": {
    fields: [
      { name: "query", type: "string", required: true },
      { name: "count", type: "number", required: false, min: 1, max: 50 },
    ],
  },
};

function extractFields(content: string): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  const pairs = content.matchAll(/(\w+)=(\S+)/g);
  for (const [, key, val] of pairs) {
    const num = Number(val);
    fields[key] = Number.isNaN(num) ? val.replace(/[,;"]/g, "") : num;
  }

  const jsonBlock = content.match(/\{.*\}/s);
  if (jsonBlock) {
    try {
      const parsed = JSON.parse(jsonBlock[0]) as Record<string, unknown>;
      Object.assign(fields, parsed);
    } catch {
      /* skip */
    }
  }

  return fields;
}

export class OKFVerifier {
  verifyToolOutput(
    skillName: string,
    outputData: unknown,
  ): { isValid: boolean; failures: string[] } {
    const schema = SCHEMAS[skillName];
    if (!schema) {
      return { isValid: true, failures: [] };
    }

    const failures: string[] = [];
    const data =
      outputData && typeof outputData === "object"
        ? (outputData as Record<string, unknown>)
        : typeof outputData === "string"
          ? extractFields(outputData)
          : {};

    for (const field of schema.fields) {
      const val = data[field.name];

      if (val === undefined || val === null) {
        if (field.required) {
          failures.push(`Missing required field "${field.name}" (${field.type})`);
        }
        continue;
      }

      if (typeof val !== field.type) {
        failures.push(
          `Field "${field.name}" expected ${field.type}, got ${typeof val}`,
        );
        continue;
      }

      if (field.type === "number") {
        const n = val as number;
        if (field.min !== undefined && n < field.min) {
          failures.push(
            `Field "${field.name}" = ${n} is below minimum ${field.min}`,
          );
        }
        if (field.max !== undefined && n > field.max) {
          failures.push(
            `Field "${field.name}" = ${n} exceeds maximum ${field.max}`,
          );
        }
      }

      if (field.pattern && typeof val === "string" && !field.pattern.test(val)) {
        failures.push(
          `Field "${field.name}" = "${val}" does not match pattern ${field.pattern}`,
        );
      }
    }

    return { isValid: failures.length === 0, failures };
  }
}

export const okfVerifier = new OKFVerifier();
