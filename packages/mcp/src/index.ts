import { randomUUID } from "node:crypto";
import { Context, Database, Session } from "yumeri";
import "@velocelab/dashboard";
import "@velocelab/advanced-chat";
import "@velocelab/model";
export const depend = ["dashboard", "advanced-chat", "database", "model"];
export const provide = ["mcp"];
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
export function apply(ctx: Context) {
  ctx.component.dashboard.addEntry({
    dev: new URL("../frontend/index.tsx", import.meta.url).pathname,
    prod: new URL("../frontend/mcp.js", import.meta.url).pathname,
    plugin: "mcp",
  });
  const servers: McpServer[] = [];
  const db = ctx.component.database as Database;
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
    provide: async ({ userId }) => {
      const enabled = await service.list(userId);
      return enabled.length
        ? `Enabled MCP servers:\n${enabled.map((server) => `- ${server.name}: ${server.url}`).join("\n")}`
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
      const response = await fetch(String(server.url), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: randomUUID(),
          method: String(value.method),
          params: value.params ?? {},
        }),
      });
      const text = await response.text();
      if (!response.ok)
        throw Error(
          `MCP request failed (${response.status}): ${text.slice(0, 500)}`,
        );
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    },
  });
  const user = (s: Session) => Number((s.properties.user as any)?.id ?? 0);
  ctx
    .route("/api/user/advanced-chat/mcp-servers")
    .methods("GET")
    .action(async (s) => {
      const id = user(s);
      if (id) s.respond(await service.list(id), "json");
    });
  ctx
    .route("/api/user/advanced-chat/mcp-servers")
    .methods("PUT")
    .action(async (s) => {
      const id = user(s);
      if (!id) return;
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
      if (id) {
        await db.remove("advanced_chat_mcp_servers", {
          id: serverId,
          user_id: id,
        });
        s.respond({ success: true }, "json");
      }
    });
}
