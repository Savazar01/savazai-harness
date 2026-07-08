import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

export interface SkillParam {
  name: string;
  type: "string" | "number" | "boolean";
  description: string;
  required: boolean;
}

export interface SkillFrontmatter {
  name: string;
  description: string;
  parameters: SkillParam[];
}

export interface SkillTool {
  name: string;
  description: string;
  parameters: SkillParam[];
  schema: z.ZodObject<Record<string, z.ZodTypeAny>>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

const TYPE_MAP: Record<string, z.ZodTypeAny> = {
  string: z.string(),
  number: z.number(),
  boolean: z.boolean(),
};

function parseYaml(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = text.split("\n").filter((l) => {
    const t = l.trim();
    return t !== "" && !t.startsWith("#");
  });
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) {
      i++;
      continue;
    }

    const key = line.substring(0, colonIdx).trim();
    const val = line.substring(colonIdx + 1).trim();
    const baseIndent = line.length - line.trimStart().length;

    if (val === "") {
      const children: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const childIndent = lines[j].length - lines[j].trimStart().length;
        if (childIndent <= baseIndent) break;
        children.push(lines[j]);
        j++;
      }
      i = j;

      if (children.length > 0 && children[0].trim().startsWith("- ")) {
        const items: Record<string, unknown>[] = [];
        let item: Record<string, unknown> = {};

        for (const child of children) {
          const t = child.trim();
          if (t.startsWith("- ")) {
            if (Object.keys(item).length > 0) {
              items.push(item);
              item = {};
            }
            const rest = t.substring(2);
            const pc = rest.indexOf(":");
            if (pc !== -1) {
              item[rest.substring(0, pc).trim()] = parseScalar(
                rest.substring(pc + 1).trim(),
              );
            }
          } else {
            const pc = t.indexOf(":");
            if (pc !== -1) {
              item[t.substring(0, pc).trim()] = parseScalar(
                t.substring(pc + 1).trim(),
              );
            }
          }
        }
        if (Object.keys(item).length > 0) items.push(item);
        result[key] = items;
      }
    } else {
      result[key] = parseScalar(val);
      i++;
    }
  }

  return result;
}

function parseScalar(val: string): unknown {
  if (val === "true") return true;
  if (val === "false") return false;
  const num = Number(val);
  if (!isNaN(num) && val !== "" && val.trim() !== "") return num;
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    return val.slice(1, -1);
  }
  return val;
}

function parseFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  return parseYaml(match[1]);
}

function getSkillsDir(): string {
  const src = resolve(process.cwd(), "src", "skills");
  if (existsSync(src)) return src;
  return resolve(process.cwd(), "dist", "skills");
}

function buildSchema(params: SkillParam[]): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const p of params) {
    const zodType = TYPE_MAP[p.type] ?? z.string();
    const chain = p.required ? zodType : zodType.optional();
    shape[p.name] = chain.describe(p.description);
  }
  return z.object(shape);
}

export function loadSkills(): SkillTool[] {
  const dir = getSkillsDir();
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }

  const tools: SkillTool[] = [];

  for (const file of files) {
    const fullPath = resolve(dir, file);
    let content: string;
    try {
      content = readFileSync(fullPath, "utf-8");
    } catch {
      continue;
    }

    const raw = parseFrontmatter(content);
    if (!raw) continue;

    const frontmatter = raw as unknown as SkillFrontmatter;
    if (!frontmatter.name || !frontmatter.description || !frontmatter.parameters) {
      continue;
    }

    const schema = buildSchema(frontmatter.parameters);

    const tool: SkillTool = {
      name: frontmatter.name,
      description: frontmatter.description,
      parameters: frontmatter.parameters,
      schema,
      execute: async (args: Record<string, unknown>) => {
        return {
          tool: frontmatter.name,
          args,
          status: "dispatched",
        };
      },
    };

    tools.push(tool);
  }

  return tools;
}

export const skillTools = loadSkills();
