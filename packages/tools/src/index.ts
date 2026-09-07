import { Context } from "yumeri";
import "@velocelab/advanced-chat";
export const depend = ["advanced-chat"];
export const provide = ["tools"];
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute?(input: unknown, context: ToolContext): Promise<unknown>;
}
export interface ToolContext {
  userId: number;
  sessionId?: string;
  runId?: string;
}
export interface ToolsService {
  list(): ToolDefinition[];
  register(tool: ToolDefinition): () => void;
  get(name: string): ToolDefinition | undefined;
}
declare module "yumeri" {
  interface Components {
    tools: ToolsService;
  }
}
export function apply(ctx: Context) {
  const chat = ctx.component["advanced-chat"];
  const service: ToolsService = {
    list: () => chat.tools(),
    register: (tool) => chat.registerTool(tool),
    get: (name) => chat.tools().find((tool) => tool.name === name),
  };
  ctx.registerComponent("tools", service);
}
