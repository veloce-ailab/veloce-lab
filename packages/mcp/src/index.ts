import { Context } from "yumeri";
import "@velocelab/dashboard";
export const depend = ["dashboard"];
export const provide = ["mcp"];
export interface McpServer { id: string; name: string; url: string; enabled: boolean; config?: Record<string, unknown>; }
export interface McpService { list(userId: number): Promise<McpServer[]>; register(server: McpServer): () => void; }
declare module "yumeri" { interface Components { mcp: McpService; } }
export function apply(ctx: Context) {
  ctx.component.dashboard.addEntry({ dev: new URL("../frontend/index.tsx", import.meta.url).pathname, prod: new URL("../frontend/mcp.js", import.meta.url).pathname, plugin: "mcp" });
  const servers: McpServer[] = [];
  const service: McpService = { list: async (userId) => userId ? servers.filter((server) => server.enabled) : [], register(server) { servers.push(server); return () => { const index = servers.indexOf(server); if (index >= 0) servers.splice(index, 1); }; } };
  ctx.registerComponent("mcp", service);
}
