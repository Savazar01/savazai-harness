import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

let databaseUrl = process.env.DATABASE_URL || "postgresql://sz_harness_admin:sz_secure_vault_pass_99@savazai-db:5432/savazai_harness";

let targetDb = process.env.POSTGRES_DB;

if (!targetDb && databaseUrl) {
  try {
    const parsed = new URL(databaseUrl);
    const dbPath = parsed.pathname.replace(/^\//, "").split("?")[0];
    if (dbPath && dbPath !== "sz_harness_admin") {
      targetDb = dbPath;
    }
  } catch {
    const matches = databaseUrl.match(/\/([^/?#]+)(?:[?#]|$)/);
    if (matches && matches[1] && matches[1] !== "sz_harness_admin") {
      targetDb = matches[1];
    }
  }
}

if (!targetDb) {
  targetDb = "savazai_harness";
}

try {
  const parsed = new URL(databaseUrl);
  if (!parsed.pathname || parsed.pathname === "/" || parsed.pathname === "") {
    parsed.pathname = `/${targetDb}`;
    databaseUrl = parsed.toString();
  }
} catch {
  if (!databaseUrl.includes(`/${targetDb}`) && !databaseUrl.includes("/sz_harness_admin")) {
    const queryIndex = databaseUrl.indexOf("?");
    if (queryIndex !== -1) {
      const base = databaseUrl.slice(0, queryIndex).replace(/\/$/, "");
      const query = databaseUrl.slice(queryIndex);
      databaseUrl = `${base}/${targetDb}${query}`;
    } else {
      databaseUrl = `${databaseUrl.replace(/\/$/, "")}/${targetDb}`;
    }
  }
}

if (databaseUrl.endsWith("/sz_harness_admin")) {
  databaseUrl = databaseUrl.replace(/\/sz_harness_admin$/, `/${targetDb}`);
} else if (databaseUrl.includes("/sz_harness_admin?")) {
  databaseUrl = databaseUrl.replace(/\/sz_harness_admin\?/, `/${targetDb}?`);
}

const client = postgres(databaseUrl);
export const db = drizzle(client, { schema });
export type Db = typeof db;
