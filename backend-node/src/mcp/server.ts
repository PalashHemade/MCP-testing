/** Standalone MCP server exposing the 10 registered logistics tools over
 * Streamable HTTP, using the official TypeScript SDK
 * (@modelcontextprotocol/sdk). Shares the exact same src/mcp/registry.ts
 * TOOL_SPECS / service implementations as the Express orchestrator -
 * there is only one implementation of each tool's logic, never two.
 *
 * IMPORTANT (documented simplification, mirrors the Python sibling
 * backend's app.mcp.server): a real deployment would authenticate each
 * MCP connection and resolve tenant/customer scope per-connection. This
 * demo binds the standalone MCP server to a single fixed demo identity
 * (DEMO_MCP_USER_KEY env var, default "demo-ops-primary") because the
 * MCP SDK's connection-level auth hooks are out of scope for this
 * exercise. The Express /api/v1/chat path is the authoritative,
 * per-request-authenticated access path - never expose this server to
 * the public internet.
 */
import "../config/loadEnv.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { z } from "zod";
import type { AuthenticatedUser } from "../auth/models.js";
import { DEV_USERS } from "../auth/devAuth.js";
import { getSettings } from "../config/settings.js";
import { getPool } from "../db/pool.js";
import { TOOL_SPECS } from "./registry.js";

const settings = getSettings();
const demoUserKey = process.env.DEMO_MCP_USER_KEY || "demo-ops-primary";
const resolvedDemoUser = DEV_USERS[demoUserKey];
if (!resolvedDemoUser) {
  throw new Error(`DEMO_MCP_USER_KEY '${demoUserKey}' is not a known demo user: ${Object.keys(DEV_USERS).join(", ")}`);
}
const demoUser: AuthenticatedUser = resolvedDemoUser;

function buildServer(): McpServer {
  const server = new McpServer({ name: "logistics-tools", version: "0.1.0" });

  for (const spec of TOOL_SPECS) {
    const shape = (spec.inputSchema as z.ZodObject<z.ZodRawShape>).shape;
    server.registerTool(
      spec.name,
      { description: spec.description, inputSchema: shape },
      async (args: unknown) => {
        const client = await getPool().connect();
        try {
          await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [demoUser.tenantId]);
          await client.query("SELECT set_config('app.current_customer_id', $1, false)", [demoUser.customerId ?? ""]);
          const parsed = spec.inputSchema.parse(args);
          const output = await spec.run(client, demoUser, parsed);
          return { content: [{ type: "text" as const, text: JSON.stringify(output) }] };
        } catch (err) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }],
            isError: true,
          };
        } finally {
          client.release();
        }
      },
    );
  }

  return server;
}

const app = createMcpExpressApp({ host: settings.mcpServerHost });

app.post("/mcp", async (req, res) => {
  const server = buildServer();
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("close", () => {
      transport.close();
      server.close();
    });
  } catch (err) {
    console.error("Error handling MCP request:", err);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  }
});

app.listen(settings.mcpServerPort, settings.mcpServerHost, () => {
  console.log(
    `Logistics MCP server (Streamable HTTP) listening on http://${settings.mcpServerHost}:${settings.mcpServerPort}/mcp`,
  );
  console.log(`Bound to demo identity: ${demoUserKey} (tenantId=${demoUser.tenantId})`);
});
