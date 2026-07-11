import "dotenv/config";
import postgres from "postgres";

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

async function wait() {
  console.log("[db-wait] Checking database connection readiness...");
  for (let i = 0; i < 30; i++) {
    try {
      const sql = postgres(databaseUrl, { connect_timeout: 2 });
      await sql`SELECT 1`;
      await sql.end();
      console.log("[db-wait] Database connection verified successfully!");
      process.exit(0);
    } catch (err: any) {
      console.log(`[db-wait] Database not ready yet (attempt ${i + 1}/30). Error: ${err.message}`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  console.error("[db-wait] Database failed to become ready in time.");
  process.exit(1);
}

wait();
