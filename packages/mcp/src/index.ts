import { Context } from "yumeri";
import "@velocelab/dashboard";
import "@velocelab/advanced-chat";
export const depend = ["dashboard", "advanced-chat"];
export const provide = ["mcp"];
export interface McpServer { id: string; name: string; url: string; enabled: boolean; config?: Record<string, unknown>; }
export interface McpService { list(userId: number): Promise<McpServer[]>; register(server: McpServer): () => void; }
declare module "yumeri" { interface Components { mcp: McpService; } }
export function apply(ctx: Context) {
  ctx.component.dashboard.addEntry({ dev: new URL("../frontend/index.tsx", import.meta.url).pathname, prod: new URL("../frontend/mcp.js", import.meta.url).pathname, plugin: "mcp" });
  const servers: McpServer[] = [];
  const service: McpService = { list: async (userId) => userId ? servers.filter((server) => server.enabled) : [], register(server) { servers.push(server); return () => { const index = servers.indexOf(server); if (index >= 0) servers.splice(index, 1); }; } };
  ctx.registerComponent("mcp", service);
  const chat = ctx.component["advanced-chat"];
  chat.registerContextProvider({ id: "mcp", provide: async ({ userId }) => { const enabled = await service.list(userId); return enabled.length ? `Enabled MCP servers:\n${enabled.map(server => `- ${server.name}: ${server.url}`).join("\n")}` : undefined; } });
  chat.registerTool({ name: "mcp_list_servers", description: "List enabled MCP servers", parameters: { type: "object", properties: {} }, execute: (_input, context) => service.list(context.userId) });
}
