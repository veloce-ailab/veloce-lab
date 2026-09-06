import { Context } from "yumeri";
export const depend: string[] = [];
export const provide = ["tools"];
export interface ToolDefinition { name: string; description: string; parameters: Record<string, unknown>; execute?(input: unknown, context: ToolContext): Promise<unknown>; }
export interface ToolContext { userId: number; sessionId?: string; runId?: string; }
export interface ToolsService { list(): ToolDefinition[]; register(tool: ToolDefinition): () => void; get(name: string): ToolDefinition | undefined; }
declare module "yumeri" { interface Components { tools: ToolsService; } }
export function apply(ctx: Context) {
  const definitions: ToolDefinition[] = [];
  const service: ToolsService = {
    list: () => definitions.slice(),
    register(tool) { definitions.push(tool); return () => { const index = definitions.indexOf(tool); if (index >= 0) definitions.splice(index, 1); }; },
    get: (name) => definitions.find((tool) => tool.name === name),
  };
  ctx.registerComponent("tools", service);
}
