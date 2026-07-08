import { db } from "../db/index.js";
import { skillEmbeddings } from "../db/schema.js";
import { sql, eq } from "drizzle-orm";

const DIMS = 1536;

function hashToBucket(word: string, seed: number): number {
  let h = seed;
  for (let i = 0; i < word.length; i++) {
    h = ((h << 5) - h + word.charCodeAt(i)) | 0;
  }
  return (Math.abs(h) + seed * 31) % DIMS;
}

function textToVector(text: string): number[] {
  const vec = new Array(DIMS).fill(0);
  const chars = text.toLowerCase();
  const words = chars.split(/\W+/).filter(Boolean);

  for (const word of words) {
    vec[hashToBucket(word, 1)] += 1;
    vec[hashToBucket(word, 7)] += 0.6;
    vec[hashToBucket(word, 13)] += 0.3;
  }

  for (let i = 0; i + 2 < chars.length; i++) {
    const trigram = chars.slice(i, i + 3);
    vec[hashToBucket(trigram, 3)] += 0.4;
    vec[hashToBucket(trigram, 11)] += 0.2;
  }

  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  if (mag === 0) return vec;
  return vec.map((v) => v / mag);
}

async function generateEmbeddingViaApi(text: string): Promise<number[] | null> {
  const url = process.env.EMBEDDING_API_URL;
  if (!url) return null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: text }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: { embedding?: number[] }[] };
    return data.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

async function embedText(text: string): Promise<number[]> {
  const apiVec = await generateEmbeddingViaApi(text);
  return apiVec ?? textToVector(text);
}

export async function storeSkillEmbedding(skillName: string, description: string): Promise<void> {
  const existing = await db
    .select()
    .from(skillEmbeddings)
    .where(eq(skillEmbeddings.skillName, skillName))
    .limit(1);

  if (existing.length > 0) {
    console.log(`[vector-matcher] Embedding already exists for "${skillName}"`);
    return;
  }

  const embedding = await embedText(description);

  await db.insert(skillEmbeddings).values({
    skillName,
    description,
    embedding,
  });

  console.log(`[vector-matcher] Stored embedding for "${skillName}" (${DIMS} dims)`);
}

export async function findRelevantSkills(
  userPrompt: string,
  limit: number = 3,
): Promise<string[]> {
  const promptVec = await embedText(userPrompt);
  const vecStr = `[${promptVec.join(",")}]`;

  const rows = await db.execute<{ skill_name: string }>(
    sql`
      SELECT skill_name
      FROM skill_embeddings
      WHERE embedding IS NOT NULL
      ORDER BY embedding <-> ${sql.raw(`'${vecStr}'::vector`)}
      LIMIT ${limit}
    `,
  );

  return rows.map((r) => r.skill_name);
}
