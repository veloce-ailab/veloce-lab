import { Context } from "yumeri";
export const depend: string[] = [];
export const provide = ["mcp"];
export interface McpServer { id: string; name: string; url: string; enabled: boolean; config?: Record<string, unknown>; }
export interface McpService { list(userId: number): Promise<McpServer[]>; register(server: McpServer): () => void; }
declare module "yumeri" { interface Components { mcp: McpService; } }
export function apply(ctx: Context) {
  const servers: McpServer[] = [];
  const service: McpService = { list: async (userId) => userId ? servers.filter((server) => server.enabled) : [], register(server) { servers.push(server); return () => { const index = servers.indexOf(server); if (index >= 0) servers.splice(index, 1); }; } };
  ctx.registerComponent("mcp", service);
}
