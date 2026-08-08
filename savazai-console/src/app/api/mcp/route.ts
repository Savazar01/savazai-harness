import { NextRequest } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Auto-bootstrap domain tables on first POST call (tool handler layer, not core engine)
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  rsvp TEXT DEFAULT 'pending',
  group_name TEXT,
  wedding_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'todo',
  category TEXT DEFAULT 'other',
  due_date TEXT,
  wedding_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ceremonies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  date TEXT,
  time TEXT,
  location TEXT,
  wedding_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT,
  quote NUMERIC,
  status TEXT DEFAULT 'contacted',
  wedding_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`;

let schemaInitialized = false;

async function ensureSchema() {
  if (schemaInitialized) return;
  await pool.query(SCHEMA_SQL);
  schemaInitialized = true;
}

async function resolveDefaultWeddingId(providedId?: string | null): Promise<string> {
  if (providedId && providedId.trim()) return providedId.trim();
  try {
    const configRes = await pool.query(`SELECT design_tokens as "designTokens" FROM system_configurations LIMIT 1`);
    if (configRes.rows.length > 0 && configRes.rows[0].designTokens) {
      const dt = configRes.rows[0].designTokens;
      if (dt.weddingId) return dt.weddingId;
      if (dt.defaultAmbientParameters) {
        const p = typeof dt.defaultAmbientParameters === "string" ? JSON.parse(dt.defaultAmbientParameters) : dt.defaultAmbientParameters;
        if (p.weddingId) return p.weddingId;
      }
    }
  } catch {}
  try {
    const res = await pool.query(`SELECT id FROM weddings ORDER BY created_at DESC LIMIT 1`);
    if (res.rows.length > 0 && res.rows[0].id) {
      return res.rows[0].id;
    }
  } catch {}
  return "be5badd9-0cb2-4d5d-9acf-2412406b9cae";
}

async function handleMcpToolCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<{ content: { type: string; text: string }[]; isError?: boolean }> {
  await ensureSchema();

  function s(args: Record<string, unknown>, key: string): string | undefined {
    if (!args || typeof args !== "object") return undefined;
    if (typeof args[key] === "string" && (args[key] as string).trim()) return (args[key] as string).trim();

    const normTarget = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const [k, v] of Object.entries(args)) {
      if (v === undefined || v === null || String(v).trim() === "") continue;
      const normK = k.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (normK === normTarget || normK.includes(normTarget) || normTarget.includes(normK)) {
        return String(v).trim();
      }
    }
    return undefined;
  }

  try {
    switch (toolName) {
      // ── GUESTS ──
      case "create_guest": {
        const name = s(args, "name");
        if (!name) throw new Error("Missing required parameter: name");
        const email = s(args, "email");
        const phone = s(args, "phone");
        const rsvp = s(args, "rsvp") || "pending";
        const groupName = s(args, "group") || "General";
        const weddingId = await resolveDefaultWeddingId(s(args, "weddingId"));
        const res = await pool.query(
          `INSERT INTO guests (name, email, phone, rsvp, group_name, wedding_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [name, email, phone, rsvp, groupName, weddingId]
        );
        const id = res.rows[0]?.id;
        if (!id) return {
          isError: true,
          content: [{ type: "text", text: "DB_WRITE_FAILED: Database did not return a valid record ID after guest INSERT." }]
        };
        return { content: [{ type: "text", text: JSON.stringify({ id, created: true }) }] };
      }
      case "list_guests": {
        const weddingId = s(args, "weddingId");
        const res = weddingId
          ? await pool.query(`SELECT * FROM guests WHERE wedding_id = $1 ORDER BY created_at DESC`, [weddingId])
          : await pool.query(`SELECT * FROM guests ORDER BY created_at DESC`);
        return { content: [{ type: "text", text: JSON.stringify(res.rows) }] };
      }
      case "update_guest": {
        const id = s(args, "id");
        if (!id) throw new Error("Missing required parameter: id");
        await pool.query(
          `UPDATE guests SET name = COALESCE($1,name), email = COALESCE($2,email), phone = COALESCE($3,phone), rsvp = COALESCE($4,rsvp), group_name = COALESCE($5,group_name) WHERE id = $6`,
          [s(args, "name"), s(args, "email"), s(args, "phone"), s(args, "rsvp"), s(args, "group"), id]
        );
        return { content: [{ type: "text", text: JSON.stringify({ id, updated: true }) }] };
      }
      case "delete_guest": {
        const id = s(args, "id");
        if (!id) throw new Error("Missing required parameter: id");
        await pool.query(`DELETE FROM guests WHERE id = $1`, [id]);
        return { content: [{ type: "text", text: JSON.stringify({ id, deleted: true }) }] };
      }

      // ── TASKS ──
      case "create_task": {
        const title = s(args, "title");
        if (!title) throw new Error("Missing required parameter: title");
        const weddingId = await resolveDefaultWeddingId(s(args, "weddingId"));
        const res = await pool.query(
          `INSERT INTO tasks (title, description, status, category, due_date, wedding_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [title, s(args, "description"), s(args, "status") || "todo", s(args, "category") || "other", s(args, "dueDate"), weddingId]
        );
        const id = res.rows[0]?.id;
        if (!id) return {
          isError: true,
          content: [{ type: "text", text: "DB_WRITE_FAILED: Database did not return a valid record ID after task INSERT." }]
        };
        return { content: [{ type: "text", text: JSON.stringify({ id, created: true }) }] };
      }
      case "list_tasks": {
        const weddingId = s(args, "weddingId");
        const res = weddingId
          ? await pool.query(`SELECT * FROM tasks WHERE wedding_id = $1 ORDER BY created_at DESC`, [weddingId])
          : await pool.query(`SELECT * FROM tasks ORDER BY created_at DESC`);
        return { content: [{ type: "text", text: JSON.stringify(res.rows) }] };
      }
      case "update_task": {
        const id = s(args, "id");
        if (!id) throw new Error("Missing required parameter: id");
        await pool.query(
          `UPDATE tasks SET title = COALESCE($1,title), description = COALESCE($2,description), status = COALESCE($3,status), category = COALESCE($4,category), due_date = COALESCE($5,due_date) WHERE id = $6`,
          [s(args, "title"), s(args, "description"), s(args, "status"), s(args, "category"), s(args, "dueDate"), id]
        );
        return { content: [{ type: "text", text: JSON.stringify({ id, updated: true }) }] };
      }
      case "delete_task": {
        const id = s(args, "id");
        if (!id) throw new Error("Missing required parameter: id");
        await pool.query(`DELETE FROM tasks WHERE id = $1`, [id]);
        return { content: [{ type: "text", text: JSON.stringify({ id, deleted: true }) }] };
      }

      // ── CEREMONIES ──
      case "create_ceremony": {
        const name = s(args, "name");
        if (!name) throw new Error("Missing required parameter: name");
        const weddingId = await resolveDefaultWeddingId(s(args, "weddingId"));
        const res = await pool.query(
          `INSERT INTO ceremonies (name, date, time, location, wedding_id) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [name, s(args, "date"), s(args, "time"), s(args, "location"), weddingId]
        );
        const id = res.rows[0]?.id;
        if (!id) return {
          isError: true,
          content: [{ type: "text", text: "DB_WRITE_FAILED: Database did not return a valid record ID after ceremony INSERT." }]
        };
        return { content: [{ type: "text", text: JSON.stringify({ id, created: true }) }] };
      }
      case "list_ceremonies": {
        const weddingId = s(args, "weddingId");
        const res = weddingId
          ? await pool.query(`SELECT * FROM ceremonies WHERE wedding_id = $1 ORDER BY created_at DESC`, [weddingId])
          : await pool.query(`SELECT * FROM ceremonies ORDER BY created_at DESC`);
        return { content: [{ type: "text", text: JSON.stringify(res.rows) }] };
      }
      case "update_ceremony": {
        const id = s(args, "id");
        if (!id) throw new Error("Missing required parameter: id");
        await pool.query(
          `UPDATE ceremonies SET name = COALESCE($1,name), date = COALESCE($2,date), time = COALESCE($3,time), location = COALESCE($4,location) WHERE id = $5`,
          [s(args, "name"), s(args, "date"), s(args, "time"), s(args, "location"), id]
        );
        return { content: [{ type: "text", text: JSON.stringify({ id, updated: true }) }] };
      }
      case "delete_ceremony": {
        const id = s(args, "id");
        if (!id) throw new Error("Missing required parameter: id");
        await pool.query(`DELETE FROM ceremonies WHERE id = $1`, [id]);
        return { content: [{ type: "text", text: JSON.stringify({ id, deleted: true }) }] };
      }

      // ── VENDORS ──
      case "create_vendor": {
        const vName = s(args, "name");
        if (!vName) throw new Error("Missing required parameter: name");
        const weddingId = await resolveDefaultWeddingId(s(args, "weddingId"));
        const res = await pool.query(
          `INSERT INTO vendors (name, type, quote, status, wedding_id) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [vName, s(args, "type"), s(args, "quote"), s(args, "status") || "contacted", weddingId]
        );
        const id = res.rows[0]?.id;
        if (!id) return {
          isError: true,
          content: [{ type: "text", text: "DB_WRITE_FAILED: Database did not return a valid record ID after vendor INSERT." }]
        };
        return { content: [{ type: "text", text: JSON.stringify({ id, created: true }) }] };
      }
      case "list_vendors": {
        const weddingId = s(args, "weddingId");
        const res = weddingId
          ? await pool.query(`SELECT * FROM vendors WHERE wedding_id = $1 ORDER BY created_at DESC`, [weddingId])
          : await pool.query(`SELECT * FROM vendors ORDER BY created_at DESC`);
        return { content: [{ type: "text", text: JSON.stringify(res.rows) }] };
      }
      case "update_vendor": {
        const id = s(args, "id");
        if (!id) throw new Error("Missing required parameter: id");
        await pool.query(
          `UPDATE vendors SET name = COALESCE($1,name), type = COALESCE($2,type), quote = COALESCE($3,quote), status = COALESCE($4,status) WHERE id = $5`,
          [s(args, "name"), s(args, "type"), s(args, "quote"), s(args, "status"), id]
        );
        return { content: [{ type: "text", text: JSON.stringify({ id, updated: true }) }] };
      }
      case "delete_vendor": {
        const id = s(args, "id");
        if (!id) throw new Error("Missing required parameter: id");
        await pool.query(`DELETE FROM vendors WHERE id = $1`, [id]);
        return { content: [{ type: "text", text: JSON.stringify({ id, deleted: true }) }] };
      }

      // ── WEDDING (generic metadata) ──
      case "get_wedding": {
        const wId = s(args, "id") || s(args, "weddingId");
        let activeWeddingId = wId;
        if (!activeWeddingId) {
          const guestRes = await pool.query(`SELECT DISTINCT wedding_id FROM guests WHERE wedding_id IS NOT NULL LIMIT 1`);
          if (guestRes.rows.length > 0 && guestRes.rows[0].wedding_id) {
            activeWeddingId = guestRes.rows[0].wedding_id;
          } else {
            const configRes = await pool.query(`SELECT design_tokens as "designTokens" FROM system_configurations LIMIT 1`);
            if (configRes.rows.length > 0 && configRes.rows[0].designTokens) {
              const dt = configRes.rows[0].designTokens;
              if (dt.weddingId) activeWeddingId = dt.weddingId;
              else if (dt.defaultAmbientParameters) {
                try {
                  const p = typeof dt.defaultAmbientParameters === "string" ? JSON.parse(dt.defaultAmbientParameters) : dt.defaultAmbientParameters;
                  if (p.weddingId) activeWeddingId = p.weddingId;
                } catch {}
              }
            }
          }
        }
        const sysRes = await pool.query(`SELECT * FROM system_configurations LIMIT 1`);
        const appTitle = sysRes.rows[0]?.appTitle || "WedPlanAI - Smart Wedding Assistant";
        const finalId = activeWeddingId || "be5badd9-0cb2-4d5d-9acf-2412406b9cae";
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              id: finalId,
              weddingId: finalId,
              title: appTitle,
              appTitle: appTitle,
              status: "active"
            })
          }]
        };
      }

      default: {
        throw new Error(`Tool "${toolName}" not supported by local handler.`);
      }
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: errMsg }],
      isError: true,
    };
  }
}

interface McpToolDef {
  name: string;
  description: string;
  inputSchema?: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
}

const MCP_SERVERS_TOOLS: Record<string, McpToolDef[]> = {
  "wedplanai": [
    {
      name: "get_wedding",
      description: "Retrieve wedding planning details",
      inputSchema: { type: "object", properties: { id: { type: "string", description: "Wedding ID" } }, required: [] }
    },
    {
      name: "create_wedding",
      description: "Create a new wedding event planning record",
      inputSchema: { type: "object", properties: { name: { type: "string", description: "Wedding event name" } }, required: ["name"] }
    },
    {
      name: "update_wedding",
      description: "Modify an existing wedding planning details",
      inputSchema: { type: "object", properties: { id: { type: "string", description: "Wedding ID" } }, required: ["id"] }
    },
    { name: "list_guests", description: "Query wedding guest RSVPs and details" },
    {
      name: "create_guest",
      description: "Add a guest to the wedding list",
      inputSchema: { type: "object", properties: { name: { type: "string", description: "Guest full name" }, email: { type: "string", description: "Guest email address" }, phone: { type: "string", description: "Guest phone number" }, rsvp: { type: "string", description: "RSVP status (pending/confirmed/declined)" }, group: { type: "string", description: "Group/table name" } }, required: ["name"] }
    },
    { name: "update_guest", description: "Update guest RSVP status or group info" },
    { name: "delete_guest", description: "Remove a guest from the list" },
    { name: "list_tasks", description: "List planning check-list tasks" },
    {
      name: "create_task",
      description: "Add a task to the planning list",
      inputSchema: { type: "object", properties: { title: { type: "string", description: "Task title" }, description: { type: "string", description: "Task description" }, status: { type: "string", description: "Task status (todo/in_progress/done)" }, category: { type: "string", description: "Task category" }, dueDate: { type: "string", description: "Due date (ISO 8601)" } }, required: ["title"] }
    },
    { name: "update_task", description: "Modify check-list task status" },
    { name: "delete_task", description: "Delete a task from the list" },
    { name: "list_ceremonies", description: "List event ceremonies and schedules" },
    {
      name: "create_ceremony",
      description: "Add a wedding ceremony event",
      inputSchema: { type: "object", properties: { name: { type: "string", description: "Ceremony name" }, date: { type: "string", description: "Ceremony date (ISO 8601)" }, time: { type: "string", description: "Ceremony time" }, location: { type: "string", description: "Ceremony location" } }, required: ["name"] }
    },
    { name: "update_ceremony", description: "Update ceremony details or timing" },
    { name: "delete_ceremony", description: "Remove a ceremony" },
    { name: "list_vendors", description: "Query registered vendor details" },
    {
      name: "create_vendor",
      description: "Add a service vendor",
      inputSchema: { type: "object", properties: { name: { type: "string", description: "Vendor name" }, type: { type: "string", description: "Vendor type" }, quote: { type: "string", description: "Quote amount" } }, required: ["name"] }
    },
    { name: "update_vendor", description: "Update vendor contact or quote status" },
    { name: "delete_vendor", description: "Remove a vendor record" }
  ],
  "github": [
    { name: "list_issues", description: "List repository issues with filters" },
    { name: "issue_write", description: "Create, open, or close an issue" },
    { name: "list_pull_requests", description: "List pull requests in repository" },
    { name: "create_pull_request", description: "Submit a new pull request" },
    { name: "search_repositories", description: "Search for GitHub repositories" },
    { name: "get_file_contents", description: "Read a file from GitHub repository" },
    { name: "create_or_update_file", description: "Commit changes to a file" }
  ],
  "StitchMCP": [
    { name: "list_projects", description: "List Stitch UI projects" },
    { name: "get_project", description: "Fetch design tokens and screens" },
    { name: "create_project", description: "Initialize a new Stitch visual project" },
    { name: "generate_screen_from_text", description: "Draft a UI screen using GenAI prompts" }
  ],
  "context7": [
    { name: "query-docs", description: "Semantic lookup of indexed library types" }
  ],
  "sequential-thinking": [
    { name: "sequentialthinking", description: "Perform sequential multi-step analysis on a complex logic query" }
  ]
};

export async function GET() {
  try {
    const res = await pool.query(
      'SELECT design_tokens as "designTokens" FROM system_configurations LIMIT 1'
    );
    let configuredServers: string[] = ["wedplanai-prod", "github-mcp-server", "StitchMCP", "context7"]; // fallback default list
    
    if (res.rows.length > 0 && res.rows[0].designTokens) {
      const tokens = res.rows[0].designTokens;
      const mcpServersValue = tokens.mcpServers;
      if (mcpServersValue) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let mcpServersObj: any = {};
        if (typeof mcpServersValue === "string") {
          try {
            mcpServersObj = JSON.parse(mcpServersValue);
            mcpServersObj = mcpServersObj.mcpServers || mcpServersObj;
          } catch {}
        } else {
          mcpServersObj = mcpServersValue.mcpServers || mcpServersValue;
        }
        const keys = Object.keys(mcpServersObj);
        if (keys.length > 0) {
          configuredServers = keys;
        }
      }
    }

    // Map each configured server to its canonical tools list
    const serversWithTools = configuredServers.map(server => {
      const canonicalKey = Object.keys(MCP_SERVERS_TOOLS).find(
        k => k.toLowerCase().includes(server.toLowerCase()) || server.toLowerCase().includes(k.toLowerCase())
      );
      const tools = canonicalKey ? MCP_SERVERS_TOOLS[canonicalKey] : [
        { name: "list_tools", description: `Discovered capabilities for server ${server}` }
      ];
      return {
        serverId: server,
        tools
      };
    });

    return new Response(JSON.stringify({ servers: serversWithTools }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[api-mcp-get] Failed to fetch MCP servers:", err);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

// ── JSON-RPC tools/call POST handler for local MCP tool execution ──
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { method, params, id } = body;

    if (method === "tools/list") {
      // Return all available wedplanai tools with full inputSchema
      const wedplanaiTools = MCP_SERVERS_TOOLS["wedplanai"] || [];
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: id || "list-tools",
        result: { tools: wedplanaiTools }
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (method !== "tools/call") {
      return new Response(JSON.stringify({
        jsonrpc: "2.0", id: id || null,
        error: { code: -32601, message: `Method not found: ${method}` }
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const toolName = params?.name;
    const args = params?.arguments || {};

    if (!toolName) {
      return new Response(JSON.stringify({
        jsonrpc: "2.0", id: id || null,
        error: { code: -32602, message: "Missing tool name" }
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const result = await handleMcpToolCall(toolName, args);

    const responseObj: Record<string, unknown> = {
      jsonrpc: "2.0",
      id: id || `call-${toolName}-${Date.now()}`,
    };
    if (result.isError) {
      responseObj.error = { code: -32000, message: result.content[0]?.text || "Tool execution failed" };
    } else {
      responseObj.result = result;
    }

    console.log(`[MCP POST] tool=${toolName} args=${JSON.stringify(args)} response=${JSON.stringify(responseObj)}`);

    return new Response(JSON.stringify(responseObj), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({
      jsonrpc: "2.0", id: null,
      error: { code: -32603, message: errMsg }
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
}
