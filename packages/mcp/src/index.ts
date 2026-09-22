import { randomUUID } from "node:crypto";
import { Context, Database, Schema, Session } from "yumeri";
import "@velocelab/dashboard";
import "@velocelab/advanced-chat";
import "@velocelab/advanced-chat";
import { McpClient } from "./client.js";
import { ensureTables } from "./tables.js";
export const depend = ["dashboard", "advanced-chat", "database"];
export const provide = ["mcp"];
export interface McpConfig { allowPrivateNetworkTargets: boolean; requestTimeoutMs: string; maxResponseBytes: string; connectorWaitMs: string; maxToolsPerServer: string; }
export const config: Schema<McpConfig> = Schema.object({
  allowPrivateNetworkTargets: Schema.boolean("Allow private network MCP targets").key("mcp.config.allowPrivateNetworkTargets").default(false),
  requestTimeoutMs: Schema.string("MCP request timeout milliseconds").key("mcp.config.requestTimeoutMs").default("30000"),
  maxResponseBytes: Schema.string("Maximum MCP response bytes").key("mcp.config.maxResponseBytes").default("4194304"),
  connectorWaitMs: Schema.string("Connector MCP wait milliseconds").key("mcp.config.connectorWaitMs").default("30000"),
  maxToolsPerServer: Schema.string("Maximum tools per MCP server").key("mcp.config.maxToolsPerServer").default("100"),
});
export interface McpServer {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  config?: Record<string, unknown>;
}
export interface McpService {
  list(userId: number): Promise<McpServer[]>;
  register(server: McpServer): () => void;
}
declare module "yumeri" {
  interface Components {
    mcp: McpService;
  }
}
export async function apply(ctx: Context, cfg: McpConfig) {
  ctx.component.dashboard.addEntry({
    dev: new URL("../frontend/index.tsx", import.meta.url).pathname,
    prod: new URL("./frontend/mcp.js", import.meta.url).pathname,
    plugin: "mcp",
  });
  const servers: McpServer[] = [];
  const db = ctx.component.database as Database;
  await ensureTables(db);
  const service: McpService = {
    list: async (userId) =>
      userId
        ? (
            await db.select("advanced_chat_mcp_servers", { user_id: userId })
          ).map((row: any) => ({
            id: String(row.id),
            name: String(row.name ?? ""),
            url: String(row.url ?? ""),
            enabled: row.enabled !== false,
            config: JSON.parse(String(row.config ?? "{}")),
          }))
        : [],
    register(server) {
      servers.push(server);
      return () => {
        const index = servers.indexOf(server);
        if (index >= 0) servers.splice(index, 1);
      };
    },
  };
  ctx.registerComponent("mcp", service);
  const chat = ctx.component["advanced-chat"];
  chat.registerContextProvider({
    id: "mcp",
    provide: async ({ userId, mcpServerIds }) => {
      const enabled = await service.list(userId);
      // The session's selection decides which servers are offered to the model.
      const selected = mcpServerIds?.length
        ? enabled.filter((server) =>
            mcpServerIds.includes(String(server.id)),
          )
        : enabled;
      return selected.length
        ? `Enabled MCP servers:\n${selected.map((server) => `- ${server.name}: ${server.url}`).join("\n")}`
        : undefined;
    },
  });
  chat.registerTool({
    name: "mcp_list_servers",
    description: "List enabled MCP servers",
    parameters: { type: "object", properties: {} },
    execute: (_input, context) => service.list(context.userId),
  });
  chat.registerTool({
    name: "mcp_call",
    description: "Call a configured MCP server endpoint",
    parameters: {
      type: "object",
      properties: {
        server_id: { type: "string" },
        method: { type: "string" },
        params: { type: "object" },
      },
      required: ["server_id", "method"],
    },
    execute: async (input, context) => {
      const value = input as any;
      const server: any = await db.selectOne("advanced_chat_mcp_servers", {
        id: String(value.server_id),
        user_id: context.userId,
      });
      if (!server || server.enabled === false)
        throw Error("MCP server is not available");
      if (String(server.transport ?? "") === "connector") {
        const config = JSON.parse(String(server.config ?? "{}"));
        const deviceId = String(
          config.device_id ?? config.connector_device_id ?? "",
        );
        if (!deviceId) throw Error("Connector MCP server requires a device");
        const chat = ctx.component["advanced-chat"];
        const task = await chat.createConnectorTask(
          context.userId,
          deviceId,
          String(value.method) === "tools/list"
            ? "mcp_list_tools"
            : "mcp_call_tool",
          {
            server: {
              id: server.id,
              name: server.name,
              type: "connector",
              command: server.command,
              args: server.args,
              env: server.env,
            },
            ...(String(value.method) === "tools/call"
              ? {
                  name: String((value.params as any)?.name ?? ""),
                  arguments: ((value.params as any)?.arguments ?? {}) as Record<
                    string,
                    unknown
                  >,
                }
              : {}),
          },
        );
        const deadline = Date.now() + Math.max(1000, Number(cfg.connectorWaitMs) || 30000);
        while (Date.now() < deadline) {
          const completed: any = await db.selectOne(
            "advanced_chat_connector_tasks",
            {
              id: task.id,
              user_id: context.userId,
            },
          );
          if (completed?.status === "completed") {
            try {
              return JSON.parse(String(completed.result || "{}"));
            } catch {
              return completed.result;
            }
          }
          if (completed?.status === "failed")
            throw Error(
              String(completed.error_message || "Connector MCP task failed"),
            );
          await new Promise((resolve) => ctx.setTimeout(resolve, 200));
        }
        throw Error("Connector MCP task timed out");
      }
      const config = JSON.parse(String(server.config ?? "{}"));
      const headers =
        config.headers && typeof config.headers === "object"
          ? Object.fromEntries(
              Object.entries(config.headers).map(([key, item]) => [
                key,
                String(item),
              ]),
            )
          : {};
      const endpoint = new URL(String(server.url));
       if (!cfg.allowPrivateNetworkTargets && (endpoint.hostname === "localhost" || endpoint.hostname === "127.0.0.1" || endpoint.hostname === "0.0.0.0" || endpoint.hostname === "::1" || endpoint.hostname.startsWith("10.") || endpoint.hostname.startsWith("192.168.") || endpoint.hostname.startsWith("172.16."))) throw Error("Private network MCP targets are disabled");
       const client = new McpClient(endpoint.toString(), headers, Math.max(1000, Number(cfg.requestTimeoutMs) || 30000), Math.max(1024, Number(cfg.maxResponseBytes) || 4194304));
      if (String(value.method) === "tools/list") return client.listTools();
      if (String(value.method) === "tools/call") {
        const result = await client.callTool(
          String((value.params as any)?.name ?? ""),
          ((value.params as any)?.arguments ?? {}) as Record<string, unknown>,
        );
        return result;
      }
      throw Error("MCP only supports tools/list and tools/call");
    },
  });
  const user = (s: Session) => (s.properties.user as { id?: number } | undefined)?.id;
  ctx
    .route("/api/user/advanced-chat/mcp-servers")
    .methods("GET")
    .action(async (s) => {
      const id = user(s);
      if (id !== undefined) s.respond(await service.list(id), "json");
    });
  ctx
    .route("/api/user/advanced-chat/mcp-servers")
    .methods("PUT")
    .action(async (s) => {
      const id = user(s);
      if (id === undefined) return;
      const input = (await s.parseRequestBody()) as any;
      const rows = Array.isArray(input.servers) ? input.servers : [];
      for (const row of rows) {
        const serverId = String(row.id ?? randomUUID());
        const existing = await db.selectOne("advanced_chat_mcp_servers", {
          id: serverId,
          user_id: id,
        });
        const value = {
          name: String(row.name ?? "MCP"),
          url: String(row.url ?? ""),
          config: JSON.stringify(row.config ?? {}),
          enabled: row.enabled !== false,
          updated_at: new Date().toISOString(),
        };
        if (existing)
          await db.update(
            "advanced_chat_mcp_servers",
            { id: serverId, user_id: id },
            value,
          );
        else
          await db.create("advanced_chat_mcp_servers", {
            id: serverId,
            user_id: id,
            ...value,
            created_at: new Date().toISOString(),
          } as any);
      }
      s.respond(await service.list(id), "json");
    });
  ctx
    .route("/api/user/advanced-chat/mcp-servers/:id")
    .methods("DELETE")
    .action(async (s, _p, serverId) => {
      const id = user(s);
      if (id !== undefined) {
        await db.remove("advanced_chat_mcp_servers", {
          id: serverId,
          user_id: id,
        });
        s.respond({ success: true }, "json");
      }
    });
}
