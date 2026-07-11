import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

let databaseUrl = process.env.DATABASE_URL || "postgresql://sz_harness_admin:sz_secure_vault_pass_99@savazai-db:5432/savazai_harness";

try {
  const parsed = new URL(databaseUrl);
  if (!parsed.pathname || parsed.pathname === "/" || parsed.pathname === "") {
    parsed.pathname = "/savazai_harness";
    databaseUrl = parsed.toString();
  }
} catch {
  if (!databaseUrl.includes("/savazai_harness") && !databaseUrl.includes("/sz_harness_admin")) {
    const queryIndex = databaseUrl.indexOf("?");
    if (queryIndex !== -1) {
      const base = databaseUrl.slice(0, queryIndex).replace(/\/$/, "");
      const query = databaseUrl.slice(queryIndex);
      databaseUrl = `${base}/savazai_harness${query}`;
    } else {
      databaseUrl = `${databaseUrl.replace(/\/$/, "")}/savazai_harness`;
    }
  }
}

if (databaseUrl.endsWith("/sz_harness_admin")) {
  databaseUrl = databaseUrl.replace(/\/sz_harness_admin$/, "/savazai_harness");
} else if (databaseUrl.includes("/sz_harness_admin?")) {
  databaseUrl = databaseUrl.replace(/\/sz_harness_admin\?/, "/savazai_harness?");
}

const client = postgres(databaseUrl);
export const db = drizzle(client, { schema });
export type Db = typeof db;
