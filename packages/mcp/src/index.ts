import { randomUUID } from "node:crypto";
import { Context, Database, Session } from "yumeri";
import "@velocelab/dashboard";
import "@velocelab/advanced-chat";
export const depend = ["dashboard", "advanced-chat", "database"];
export const provide = ["mcp"];
export interface McpServer { id: string; name: string; url: string; enabled: boolean; config?: Record<string, unknown>; }
export interface McpService { list(userId: number): Promise<McpServer[]>; register(server: McpServer): () => void; }
declare module "yumeri" { interface Components { mcp: McpService; } }
export function apply(ctx: Context) {
  ctx.component.dashboard.addEntry({ dev: new URL("../frontend/index.tsx", import.meta.url).pathname, prod: new URL("../frontend/mcp.js", import.meta.url).pathname, plugin: "mcp" });
  const servers: McpServer[] = [];
  const db = ctx.component.database as Database;
  const service: McpService = { list: async (userId) => userId ? (await db.select("advanced_chat_mcp_servers", { user_id: userId })).map((row: any) => ({ id: String(row.id), name: String(row.name ?? ""), url: String(row.url ?? ""), enabled: row.enabled !== false, config: JSON.parse(String(row.config ?? "{}")) })) : [], register(server) { servers.push(server); return () => { const index = servers.indexOf(server); if (index >= 0) servers.splice(index, 1); }; } };
  ctx.registerComponent("mcp", service);
  const chat = ctx.component["advanced-chat"];
  chat.registerContextProvider({ id: "mcp", provide: async ({ userId }) => { const enabled = await service.list(userId); return enabled.length ? `Enabled MCP servers:\n${enabled.map(server => `- ${server.name}: ${server.url}`).join("\n")}` : undefined; } });
  chat.registerTool({ name: "mcp_list_servers", description: "List enabled MCP servers", parameters: { type: "object", properties: {} }, execute: (_input, context) => service.list(context.userId) });
  const user = (s: Session) => Number((s.properties.user as any)?.id ?? 0);
  ctx.route("/api/user/advanced-chat/mcp-servers").methods("GET").action(async s => { const id = user(s); if (id) s.respond(await service.list(id), "json"); });
  ctx.route("/api/user/advanced-chat/mcp-servers").methods("PUT").action(async s => { const id = user(s); if (!id) return; const input = await s.parseRequestBody() as any; const rows = Array.isArray(input.servers) ? input.servers : []; for (const row of rows) { await db.create("advanced_chat_mcp_servers", { id: String(row.id ?? randomUUID()), user_id: id, name: String(row.name ?? "MCP"), url: String(row.url ?? ""), config: JSON.stringify(row.config ?? {}), enabled: row.enabled !== false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as any); } s.respond(await service.list(id), "json"); });
}
