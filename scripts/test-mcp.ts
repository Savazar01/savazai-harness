import { McpHttpClient } from "../src/mcp/client.js";

async function run() {
  console.log("[Test MCP] Creating client...");
  const client = new McpHttpClient();
  
  console.log("[Test MCP] Running listTools...");
  const start = Date.now();
  const tools = await client.listTools();
  console.log(`[Test MCP] Finished listTools in ${Date.now() - start}ms. Discovered tools count:`, tools.length);
  console.log("[Test MCP] Discovered tools:", JSON.stringify(tools, null, 2));
}

run().catch((err) => {
  console.error("[Test MCP] Failed:", err);
  process.exit(1);
});
